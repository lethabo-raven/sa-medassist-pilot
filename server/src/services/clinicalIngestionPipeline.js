import { pool, query } from "../db/pool.js";
import { chunkText } from "./chunker.js";
import { embedText } from "./ollama.js";
import { parseDocumentFile } from "./documentParsing.js";
import { extractEntitiesFromPages } from "./entityExtraction.js";

function findPageForChunk(pages, chunk) {
  return pages.find((page) => page.text.includes(chunk.slice(0, 80))) || pages[0] || {};
}

export async function processUploadedClinicalDocument(documentId, file) {
  const run = await query(
    "INSERT INTO document_processing_runs (document_id, status) VALUES ($1, 'pending') RETURNING id",
    [documentId]
  );
  const runId = run.rows[0].id;

  try {
    const parsed = await parseDocumentFile(file);
    await query(
      "UPDATE document_processing_runs SET status = 'parsed', parser = $2 WHERE id = $1",
      [runId, parsed.parser]
    );

    const chunks = chunkText(parsed.text);
    const entities = extractEntitiesFromPages(parsed.pages);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM document_chunks WHERE document_id = $1", [documentId]);
      await client.query("DELETE FROM document_entities WHERE document_id = $1 AND review_status = 'pending'", [documentId]);

      for (let index = 0; index < chunks.length; index += 1) {
        const page = findPageForChunk(parsed.pages, chunks[index]);
        const embedding = await embedText(chunks[index]);
        await client.query(
          `INSERT INTO document_chunks
             (document_id, chunk_index, content, citation_label, embedding, page_number, section_heading)
           VALUES ($1, $2, $3, $4, $5::vector, $6, $7)`,
          [
            documentId,
            index,
            chunks[index],
            `Document ${documentId}, section ${page.sectionHeading || "content"}, chunk ${index + 1}`,
            `[${embedding.join(",")}]`,
            page.pageNumber || null,
            page.sectionHeading || null
          ]
        );
      }

      for (const entity of entities) {
        await client.query(
          `INSERT INTO document_entities
             (document_id, entity_type, entity_value, normalized_value, page_number,
              section_heading, source_text, confidence_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            documentId,
            entity.entityType,
            entity.entityValue,
            entity.normalizedValue,
            entity.pageNumber,
            entity.sectionHeading,
            entity.sourceText,
            entity.confidenceScore
          ]
        );
      }

      await client.query(
        "UPDATE documents SET raw_text = $2 WHERE id = $1",
        [documentId, parsed.text]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    await query(
      `UPDATE document_processing_runs
       SET status = 'embedded', chunk_count = $2, entity_count = $3, completed_at = now()
       WHERE id = $1`,
      [runId, chunks.length, entities.length]
    );

    return { runId, chunks: chunks.length, entities: entities.length };
  } catch (error) {
    await query(
      "UPDATE document_processing_runs SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1",
      [runId, error.message]
    );
    throw error;
  }
}

export async function activateApprovedDocumentKnowledge(documentId, reviewer) {
  await query(
    `UPDATE document_entities
     SET review_status = 'approved',
         reviewed_by = $2,
         reviewed_at = now(),
         active_flag = true
     WHERE document_id = $1
       AND review_status = 'pending'`,
    [documentId, reviewer]
  );
}

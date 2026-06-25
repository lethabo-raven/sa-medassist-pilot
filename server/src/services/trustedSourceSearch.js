import * as db from "../db/pool.js";
import { searchMode } from "./vectorCompatibility.js";

const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

export async function searchTrustedDocumentChunks({ text, limit = 8 } = {}) {
  const searchText = String(text || "").trim();
  if (!searchText) return [];

  if (searchMode() === "pgvector") {
    // Embedding retrieval is intentionally not required for the pilot.
    // Keep the same safe PostgreSQL full-text path until vector search is explicitly enabled and wired.
  }

  const { rows } = await query(
    `
    SELECT
      c.document_id,
      c.chunk_index,
      c.chunk_text,
      c.page_number,
      c.source_url,
      c.authority,
      c.version,
      c.publication_date,
      ts_rank(c.search_text, plainto_tsquery('english', $1)) AS rank
    FROM trusted_document_chunks c
    JOIN trusted_source_documents d ON d.document_id = c.document_id
    WHERE d.approval_status = 'approved'
      AND d.active = true
      AND (d.expiry_date IS NULL OR d.expiry_date >= CURRENT_DATE)
      AND c.search_text @@ plainto_tsquery('english', $1)
    ORDER BY rank DESC
    LIMIT $2
    `,
    [searchText, limit],
  );
  return rows;
}

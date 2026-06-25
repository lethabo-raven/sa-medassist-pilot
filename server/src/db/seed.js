import { query, pool } from "./pool.js";
import { embedText } from "../services/ollama.js";
import { chunkText } from "../services/chunker.js";

const title = "MVP Safety Baseline";
const content = `
This assistant provides general medical information for South African users.
It must not diagnose, prescribe medicine, replace a clinician, or handle emergencies.
For emergency symptoms such as severe chest pain, trouble breathing, stroke symptoms,
severe allergic reaction, poisoning, or loss of consciousness, users should seek urgent
medical help immediately.
`;

try {
  const existing = await query("SELECT id FROM documents WHERE title = $1 LIMIT 1", [title]);
  if (existing.rowCount > 0) {
    console.log("Seed document already exists.");
  } else {
    const doc = await query(
      `INSERT INTO documents (title, authority, source_type, status, active_flag, raw_text, approved_by, approved_at, approver, approval_date, uploaded_by, upload_date)
       VALUES ($1, $2, $3, $4, true, $5, $6, now(), $6, now(), $7, now())
       RETURNING id`,
      [title, "system", "system", "approved", content, "system", "seed"]
    );
    const chunks = chunkText(content);
    for (let index = 0; index < chunks.length; index += 1) {
      const embedding = await embedText(chunks[index]);
      await query(
        `INSERT INTO document_chunks (document_id, chunk_index, content, citation_label, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [doc.rows[0].id, index, chunks[index], `${title}, chunk ${index + 1}`, `[${embedding.join(",")}]`]
      );
    }
    console.log("Seed document inserted.");
  }
} finally {
  await pool.end();
}

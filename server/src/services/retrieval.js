import { query } from "../db/pool.js";
import { config } from "../config.js";
import { embedText } from "./ollama.js";

export async function retrieveContexts(question, limit = 5) {
  const embedding = await embedText(question);
  const result = await query(
    `SELECT
       dc.id,
       dc.content,
       dc.citation_label,
       d.id AS document_id,
       d.source_id,
       d.version,
       d.title,
       d.source_url,
       d.authority,
       d.active_flag,
       d.status,
       d.approval_date,
       d.expiry_date,
       1 - (dc.embedding <=> $1::vector) AS relevance
     FROM document_chunks dc
     JOIN documents d ON d.id = dc.document_id
     WHERE d.status = 'approved'
       AND d.active_flag = true
       AND (d.expiry_date IS NULL OR d.expiry_date > now())
     ORDER BY
       dc.embedding <=> $1::vector,
       d.approval_date DESC NULLS LAST,
       d.version DESC
     LIMIT $2`,
    [`[${embedding.join(",")}]`, limit]
  );

  return result.rows.filter((row) => Number(row.relevance) >= config.minCitationConfidence);
}

export function toCitations(contexts) {
  return contexts.map((context, index) => ({
    index: index + 1,
    title: context.title,
    documentId: context.document_id,
    sourceId: context.source_id,
    version: context.version,
    label: context.citation_label,
    sourceUrl: context.source_url,
    authority: context.authority,
    approvalStatus: context.status,
    active: context.active_flag,
    approvalDate: context.approval_date,
    expiryDate: context.expiry_date,
    documentIdentifier: context.document_id,
    relevance: Number(context.relevance)
  }));
}

export function topConfidence(contexts) {
  return contexts.length > 0 ? Math.max(...contexts.map((context) => Number(context.relevance))) : 0;
}

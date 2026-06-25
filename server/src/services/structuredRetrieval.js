import { query } from "../db/pool.js";

function tokens(text) {
  return [...new Set(String(text || "").toLowerCase().match(/[a-z0-9.-]{3,}/g) || [])].slice(0, 40);
}

export async function structuredLookup(question, limit = 8) {
  const terms = tokens(question);
  if (terms.length === 0) return [];

  const result = await query(
    `SELECT e.id, e.entity_type, e.entity_value, e.normalized_value, e.page_number,
            e.section_heading, e.source_text, e.confidence_score,
            d.id AS document_id, d.source_id, d.title, d.source_organization, d.version,
            d.status, d.active_flag, d.approval_date, d.source_url
     FROM document_entities e
     JOIN documents d ON d.id = e.document_id
     WHERE e.review_status = 'approved'
       AND e.active_flag = true
       AND d.status = 'approved'
       AND d.active_flag = true
       AND (d.expiry_date IS NULL OR d.expiry_date > now())
       AND (
         e.normalized_value = ANY($1::text[])
         OR EXISTS (
           SELECT 1 FROM unnest($1::text[]) AS term
           WHERE e.normalized_value ILIKE '%' || term || '%'
              OR e.source_text ILIKE '%' || term || '%'
         )
       )
     ORDER BY e.confidence_score DESC, d.approval_date DESC NULLS LAST
     LIMIT $2`,
    [terms, limit]
  );

  return result.rows;
}

export function structuredCitations(rows) {
  return rows.map((row, index) => ({
    index: index + 1,
    source: "structured",
    entityType: row.entity_type,
    entityValue: row.entity_value,
    documentId: row.document_id,
    title: row.title,
    sourceOrganization: row.source_organization,
    version: row.version,
    pageNumber: row.page_number,
    sectionHeading: row.section_heading,
    sourceText: row.source_text,
    approvalStatus: row.status,
    approvalDate: row.approval_date,
    sourceUrl: row.source_url,
    confidence: Number(row.confidence_score)
  }));
}

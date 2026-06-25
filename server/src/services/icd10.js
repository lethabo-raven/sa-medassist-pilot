import { query } from "../db/pool.js";
import { config } from "../config.js";

export function isIcd10Query(text) {
  return /\bicd[-\s]?10\b/i.test(text) || /\bdiagnosis code\b/i.test(text) || /\bclaim code\b/i.test(text);
}

export async function lookupIcd10(text, limit = 5) {
  const result = await query(
    `SELECT c.code, c.description, c.document_id, c.source_id, c.source_version,
            c.approval_status, c.effective_date, c.expiry_date,
            ts_rank(to_tsvector('english', c.description || ' ' || c.code), plainto_tsquery('english', $1)) AS confidence
     FROM icd10_codes c
     JOIN documents d ON d.id = c.document_id
     WHERE c.approval_status = 'approved'
       AND d.status = 'approved'
       AND d.active_flag = true
       AND (c.expiry_date IS NULL OR c.expiry_date > now())
       AND (d.expiry_date IS NULL OR d.expiry_date > now())
       AND to_tsvector('english', c.description || ' ' || c.code) @@ plainto_tsquery('english', $1)
     ORDER BY confidence DESC, c.source_version DESC
     LIMIT $2`,
    [text, limit]
  );

  const matches = result.rows;
  return {
    matches,
    confidence: matches.length > 0 ? Number(matches[0].confidence) : 0,
    lowConfidence: matches.length === 0 || Number(matches[0].confidence) < config.icd10MinConfidence
  };
}

export function formatIcd10Support(lookup) {
  if (lookup.matches.length === 0) {
    return "I cannot identify an ICD-10 code from approved ICD-10 sources with enough confidence.";
  }

  const lines = lookup.matches.map((match) => {
    return `${match.code}: ${match.description} (source document ${match.document_id}, source version ${match.source_version}, approval status ${match.approval_status})`;
  });

  if (lookup.lowConfidence) {
    return `I cannot state an ICD-10 code with certainty. Possible ICD-10 matches include:\n${lines.join("\n")}\nConfirm against the prescription, diagnosis, and relevant medical aid rules before claim submission.`;
  }

  return `Possible ICD-10 matches include:\n${lines.join("\n")}\nBased on approved sources. Confirm against the prescription, diagnosis, and relevant medical aid rules before claim submission.`;
}

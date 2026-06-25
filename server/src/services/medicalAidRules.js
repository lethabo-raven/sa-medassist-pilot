import { query } from "../db/pool.js";

export const MEDICAL_AID_CLAIM_DISCLAIMER =
  "Medical aid scheme rules, benefit options, PMB rules, formularies, authorisation requirements, and claim requirements may differ. Confirm with the relevant medical aid or scheme rules where required.";

export async function assertApprovedSourceDocument(documentId) {
  const result = await query(
    `SELECT id, source_id, version, status, active_flag, expiry_date
     FROM documents
     WHERE id = $1`,
    [documentId]
  );

  if (result.rowCount === 0) {
    throw new Error("Source document not found.");
  }

  const document = result.rows[0];
  if (document.status !== "approved" || document.active_flag !== true) {
    throw new Error("Mappings can only use active approved source documents.");
  }

  if (document.expiry_date && new Date(document.expiry_date) <= new Date()) {
    throw new Error("Mappings cannot use expired source documents.");
  }

  return document;
}

export async function upsertIcd10Master(entry) {
  const document = await assertApprovedSourceDocument(entry.documentId);
  const result = await query(
    `INSERT INTO icd10_master
       (code, description, category_chapter, active_flag, document_id, source_id,
        source_version, effective_date, expiry_date, last_updated)
     VALUES ($1, $2, $3, COALESCE($4, true), $5, $6, $7, COALESCE($8, now()), $9, now())
     ON CONFLICT (code, source_id, source_version) DO UPDATE
     SET description = EXCLUDED.description,
         category_chapter = EXCLUDED.category_chapter,
         active_flag = EXCLUDED.active_flag,
         effective_date = EXCLUDED.effective_date,
         expiry_date = EXCLUDED.expiry_date,
         last_updated = now()
     RETURNING *`,
    [
      entry.code.toUpperCase(),
      entry.description,
      entry.categoryChapter || null,
      entry.activeFlag ?? true,
      document.id,
      document.source_id,
      document.version,
      entry.effectiveDate || null,
      entry.expiryDate || null
    ]
  );
  return result.rows[0];
}

export async function lookupIcd10Master(text, limit = 5) {
  const result = await query(
    `SELECT m.code, m.description, m.category_chapter, m.document_id, m.source_id,
            m.source_version, m.effective_date, m.expiry_date,
            ts_rank(to_tsvector('english', m.description || ' ' || m.code), plainto_tsquery('english', $1)) AS confidence
     FROM icd10_master m
     JOIN documents d ON d.id = m.document_id
     WHERE m.active_flag = true
       AND m.approval_status = 'approved'
       AND d.status = 'approved'
       AND d.active_flag = true
       AND (m.expiry_date IS NULL OR m.expiry_date > now())
       AND (d.expiry_date IS NULL OR d.expiry_date > now())
       AND to_tsvector('english', m.description || ' ' || m.code) @@ plainto_tsquery('english', $1)
     ORDER BY confidence DESC, m.source_version DESC
     LIMIT $2`,
    [text, limit]
  );
  return result.rows;
}

export async function upsertMedicalAidRule(rule) {
  const document = await assertApprovedSourceDocument(rule.documentId);
  const result = await query(
    `INSERT INTO medical_aid_icd10_rules
       (medical_aid_name, plan_option, icd10_code, pmb_flag, authorisation_required_flag,
        formulary_notes, claim_notes, document_id, source_id, source_version,
        source_name, source_page_section_reference, reviewer, confidence_score,
        last_verified_date, active_flag, approval_status, rule_origin)
     VALUES ($1, $2, $3, COALESCE($4, false), COALESCE($5, false), $6, $7, $8, $9, $10,
             $11, $12, $13, COALESCE($14, 0), COALESCE($15, current_date), COALESCE($16, true), 'approved', 'imported')
     RETURNING *`,
    [
      rule.medicalAidName,
      rule.planOption || null,
      rule.icd10Code.toUpperCase(),
      rule.pmbFlag ?? false,
      rule.authorisationRequiredFlag ?? false,
      rule.formularyNotes || null,
      rule.claimNotes || null,
      document.id,
      document.source_id,
      document.version,
      rule.sourceName || null,
      rule.sourcePageSectionReference || null,
      rule.reviewer || null,
      rule.confidenceScore ?? 0,
      rule.lastVerifiedDate || null,
      rule.activeFlag ?? true
    ]
  );
  return result.rows[0];
}

export async function lookupMedicalAidRules({ medicalAidName, icd10Code }) {
  const result = await query(
    `SELECT *
     FROM medical_aid_icd10_rules
     WHERE active_flag = true
       AND approval_status = 'approved'
       AND ($1::text IS NULL OR lower(medical_aid_name) = lower($1))
       AND ($2::text IS NULL OR icd10_code = upper($2))
     ORDER BY last_verified_date DESC
     LIMIT 20`,
    [medicalAidName || null, icd10Code || null]
  );
  return result.rows;
}

export async function upsertMedicineIcd10Mapping(mapping) {
  const document = await assertApprovedSourceDocument(mapping.documentId);
  const result = await query(
    `INSERT INTO medicine_icd10_mappings
       (medicine_name, medicine_identifier, icd10_code, relationship_type,
        confidence_score, document_id, source_id, source_version, source_name,
        source_page_section_reference, reviewer, active_flag, approval_status, rule_origin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, true), 'approved', 'imported')
     RETURNING *`,
    [
      mapping.medicineName,
      mapping.medicineIdentifier || null,
      mapping.icd10Code.toUpperCase(),
      mapping.relationshipType,
      mapping.confidenceScore,
      document.id,
      document.source_id,
      document.version,
      mapping.sourceName || null,
      mapping.sourcePageSectionReference || null,
      mapping.reviewer || null,
      mapping.activeFlag ?? true
    ]
  );
  return result.rows[0];
}

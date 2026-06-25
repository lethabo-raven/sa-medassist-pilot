import { query } from "../db/pool.js";
import { assertApprovedSourceDocument, upsertIcd10Master, upsertMedicalAidRule, upsertMedicineIcd10Mapping } from "./medicalAidRules.js";
import { upsertMedicineRiskProfile } from "./medicineRiskProfiles.js";

export async function createExtractedRuleReview({ ruleType, payload, sourceDocumentId, sourcePageSectionReference, confidenceScore = 0 }) {
  const document = await assertApprovedSourceDocument(sourceDocumentId);
  const result = await query(
    `INSERT INTO extracted_rule_reviews
       (rule_type, extracted_payload, source_document_id, source_name, source_version,
        source_page_section_reference, confidence_score)
     SELECT $1, $2::jsonb, d.id, d.title, d.version, $3, $4
     FROM documents d
     WHERE d.id = $5
     RETURNING *`,
    [ruleType, JSON.stringify(payload), sourcePageSectionReference || null, confidenceScore, document.id]
  );
  return result.rows[0];
}

async function activateRule(review, reviewer) {
  const payload = review.edited_payload || review.extracted_payload;
  const common = {
    ...payload,
    documentId: review.source_document_id,
    sourceName: review.source_name,
    sourcePageSectionReference: review.source_page_section_reference,
    reviewer,
    confidenceScore: Number(review.confidence_score)
  };

  if (review.rule_type === "medicine_risk_profile") return upsertMedicineRiskProfile(common);
  if (review.rule_type === "icd10_code") return upsertIcd10Master(common);
  if (review.rule_type === "medical_aid_rule") return upsertMedicalAidRule(common);
  if (review.rule_type === "medicine_icd10_mapping") return upsertMedicineIcd10Mapping(common);

  if (review.rule_type === "allergy_mapping") {
    const document = await assertApprovedSourceDocument(review.source_document_id);
    const result = await query(
      `INSERT INTO medicine_allergy_risks
         (medicine, allergy_group_id, severity, warning, source_reference, last_reviewed_date,
          source_document_id, source_name, source_version, source_page_section_reference,
          approval_status, reviewer, confidence_score, rule_origin, active)
       SELECT $1, g.id, $2, $3, $4, COALESCE($5, current_date), $6, $7, $8, $9,
              'approved', $10, $11, 'imported', true
       FROM allergy_groups g
       WHERE g.name = $12
       RETURNING *`,
      [
        payload.medicine,
        payload.severity,
        payload.warning,
        payload.sourceReference || review.source_page_section_reference || "approved imported source",
        payload.lastReviewedDate || null,
        document.id,
        review.source_name,
        review.source_version,
        review.source_page_section_reference,
        reviewer,
        Number(review.confidence_score),
        payload.allergyGroup
      ]
    );
    return result.rows[0];
  }

  if (review.rule_type === "drug_interaction") {
    const document = await assertApprovedSourceDocument(review.source_document_id);
    const result = await query(
      `INSERT INTO medicine_interactions
         (medicine_a, medicine_b, severity, interaction_reason, action_required,
          source_document_id, source_name, source_version, source_page_section_reference,
          approval_status, reviewer, confidence_score, rule_origin, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved', $10, $11, 'imported', true)
       ON CONFLICT (medicine_a, medicine_b) DO UPDATE
       SET severity = EXCLUDED.severity,
           interaction_reason = EXCLUDED.interaction_reason,
           action_required = EXCLUDED.action_required,
           source_document_id = EXCLUDED.source_document_id,
           source_name = EXCLUDED.source_name,
           source_version = EXCLUDED.source_version,
           source_page_section_reference = EXCLUDED.source_page_section_reference,
           approval_status = 'approved',
           reviewer = EXCLUDED.reviewer,
           confidence_score = EXCLUDED.confidence_score,
           rule_origin = 'imported',
           active = true
       RETURNING *`,
      [
        payload.medicineA,
        payload.medicineB,
        payload.severity,
        payload.interactionReason,
        payload.actionRequired,
        document.id,
        review.source_name,
        review.source_version,
        review.source_page_section_reference,
        reviewer,
        Number(review.confidence_score)
      ]
    );
    return result.rows[0];
  }

  if (review.rule_type === "medicine_schedule") {
    const document = await assertApprovedSourceDocument(review.source_document_id);
    const result = await query(
      `INSERT INTO medicine_schedules
         (medicine_name, schedule, controlled_flag, source_document_id, source_name,
          source_version, source_page_section_reference, approval_status, reviewer,
          confidence_score, active_flag, rule_origin)
       VALUES ($1, $2, COALESCE($3, false), $4, $5, $6, $7, 'approved', $8, $9, true, 'imported')
       RETURNING *`,
      [
        payload.medicineName,
        payload.schedule,
        payload.controlledFlag || false,
        document.id,
        review.source_name,
        review.source_version,
        review.source_page_section_reference,
        reviewer,
        Number(review.confidence_score)
      ]
    );
    return result.rows[0];
  }

  if (review.rule_type === "nappi_mapping") {
    const document = await assertApprovedSourceDocument(review.source_document_id);
    const result = await query(
      `INSERT INTO nappi_mappings
         (nappi_code, medicine_name, medicine_identifier, source_document_id, source_name,
          source_version, source_page_section_reference, approval_status, reviewer,
          confidence_score, active_flag, rule_origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8, $9, true, 'imported')
       RETURNING *`,
      [
        payload.nappiCode,
        payload.medicineName,
        payload.medicineIdentifier || null,
        document.id,
        review.source_name,
        review.source_version,
        review.source_page_section_reference,
        reviewer,
        Number(review.confidence_score)
      ]
    );
    return result.rows[0];
  }

  throw new Error(`Unsupported rule type: ${review.rule_type}`);
}

export async function approveExtractedRule({ id, reviewer, editedPayload }) {
  const reviewResult = await query("SELECT * FROM extracted_rule_reviews WHERE id = $1", [id]);
  if (reviewResult.rowCount === 0) throw new Error("Extracted rule not found.");
  const review = reviewResult.rows[0];
  if (review.approval_status !== "pending") throw new Error("Only pending extracted rules can be approved.");

  if (editedPayload) {
    review.edited_payload = editedPayload;
  }

  const activated = await activateRule(review, reviewer);
  await query(
    `UPDATE extracted_rule_reviews
     SET approval_status = 'approved',
         edited_payload = COALESCE($2::jsonb, edited_payload),
         reviewer = $3,
         active_flag = true,
         activated_rule_id = $4,
         reviewed_at = now()
     WHERE id = $1`,
    [id, editedPayload ? JSON.stringify(editedPayload) : null, reviewer, activated.id]
  );
  return activated;
}

export async function rejectExtractedRule({ id, reviewer, reason }) {
  await query(
    `UPDATE extracted_rule_reviews
     SET approval_status = 'rejected',
         reviewer = $2,
         rejection_reason = $3,
         active_flag = false,
         reviewed_at = now()
     WHERE id = $1`,
    [id, reviewer, reason || "Rejected by reviewer"]
  );
}

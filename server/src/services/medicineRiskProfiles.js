import { query } from "../db/pool.js";
import { config } from "../config.js";
import { assertApprovedSourceDocument } from "./medicalAidRules.js";

export async function findMedicineRiskProfiles(text) {
  const value = String(text || "").toLowerCase();
  const result = await query(
    `SELECT p.id, p.medicine_name, p.aliases, p.risk_category, p.escalation_reason,
            p.related_safety_trigger, p.source_reference, p.last_reviewed_date,
            p.source_document_id, p.source_name, p.source_version,
            p.source_page_section_reference, p.approval_status, p.reviewer,
            p.confidence_score, p.rule_origin
     FROM medicine_risk_profiles
     p
     LEFT JOIN documents d ON d.id = p.source_document_id
     WHERE p.active_flag = true
       AND (
         (p.rule_origin = 'seed_demo' AND $1 = true)
         OR (
           p.rule_origin = 'imported'
           AND p.approval_status = 'approved'
           AND d.status = 'approved'
           AND d.active_flag = true
           AND (d.expiry_date IS NULL OR d.expiry_date > now())
         )
       )
     ORDER BY p.medicine_name`,
    [config.enableDemoRules]
  );

  return result.rows.filter((profile) => {
    const names = [profile.medicine_name, ...(profile.aliases || [])].map((item) => String(item).toLowerCase());
    return names.some((name) => value.includes(name));
  });
}

export function riskProfileCaution(profiles) {
  if (profiles.length === 0) return "";
  const lines = profiles.map((profile) => {
    return `${profile.medicine_name}: ${profile.risk_category}. ${profile.escalation_reason}`;
  });
  return `Medicine risk profile caution:\n${lines.join("\n")}`;
}

export async function upsertMedicineRiskProfile(profile) {
  const document = profile.documentId ? await assertApprovedSourceDocument(profile.documentId) : null;
  const result = await query(
    `INSERT INTO medicine_risk_profiles
       (medicine_name, aliases, risk_category, escalation_reason, related_safety_trigger,
        active_flag, source_reference, last_reviewed_date, source_document_id, source_name,
        source_version, source_page_section_reference, approval_status, reviewer,
        confidence_score, rule_origin, updated_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, true), $7, COALESCE($8, current_date),
             $9, $10, $11, $12, $13, $14, $15, $16, now())
     RETURNING *`,
    [
      profile.medicineName,
      profile.aliases || [],
      profile.riskCategory,
      profile.escalationReason,
      profile.relatedSafetyTrigger,
      profile.activeFlag ?? true,
      profile.sourceReference,
      profile.lastReviewedDate || null,
      document?.id || null,
      profile.sourceName || document?.title || null,
      document?.version || null,
      profile.sourcePageSectionReference || null,
      document ? "approved" : "seed_demo",
      profile.reviewer || null,
      profile.confidenceScore ?? 0,
      document ? "imported" : "seed_demo"
    ]
  );
  return result.rows[0];
}

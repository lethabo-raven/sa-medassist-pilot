import { query } from "../db/pool.js";
import { config } from "../config.js";

const FALLBACK_MEDICINES = [
  "amoxicillin",
  "ampicillin",
  "aspirin",
  "ibuprofen",
  "naproxen",
  "diclofenac",
  "warfarin",
  "methotrexate",
  "trimethoprim",
  "lithium",
  "digoxin",
  "insulin",
  "prednisone",
  "clarithromycin",
  "codeine",
  "morphine"
];

function listify(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesTerm(text, term) {
  return new RegExp(`\\b${String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

export async function resolveAllergyGroups(allergies = []) {
  const items = listify(allergies);
  if (items.length === 0) return [];

  const result = await query(
    `SELECT DISTINCT g.id, g.name
     FROM allergy_groups g
     LEFT JOIN allergy_terms t ON t.allergy_group_id = g.id AND t.active = true
     LEFT JOIN allergy_aliases a ON a.allergy_term_id = t.id AND a.active = true
     WHERE g.active = true
       AND (
         lower(g.name) = ANY($1::text[])
         OR lower(t.term) = ANY($1::text[])
         OR lower(a.alias) = ANY($1::text[])
       )`,
    [items.map((item) => String(item).toLowerCase())]
  );

  return result.rows;
}

export async function detectMentionedMedicines(text, patientContext = {}) {
  const value = String(text || "").toLowerCase();
  const chronic = listify(patientContext.chronicMedications || patientContext.chronicMedication || []);
  const candidates = new Set([...FALLBACK_MEDICINES, ...chronic.map((item) => String(item).toLowerCase())]);

  const dbMedicines = await query(
    `SELECT r.medicine
     FROM medicine_allergy_risks r
     LEFT JOIN documents d ON d.id = r.source_document_id
     WHERE r.active = true
       AND ((r.rule_origin = 'seed_demo' AND $1 = true)
         OR (r.rule_origin = 'imported' AND r.approval_status = 'approved' AND d.status = 'approved' AND d.active_flag = true AND (d.expiry_date IS NULL OR d.expiry_date > now())))
     UNION
     SELECT i.medicine_a AS medicine
     FROM medicine_interactions i
     LEFT JOIN documents d ON d.id = i.source_document_id
     WHERE i.active = true
       AND ((i.rule_origin = 'seed_demo' AND $1 = true)
         OR (i.rule_origin = 'imported' AND i.approval_status = 'approved' AND d.status = 'approved' AND d.active_flag = true AND (d.expiry_date IS NULL OR d.expiry_date > now())))
     UNION
     SELECT i.medicine_b AS medicine
     FROM medicine_interactions i
     LEFT JOIN documents d ON d.id = i.source_document_id
     WHERE i.active = true
       AND ((i.rule_origin = 'seed_demo' AND $1 = true)
         OR (i.rule_origin = 'imported' AND i.approval_status = 'approved' AND d.status = 'approved' AND d.active_flag = true AND (d.expiry_date IS NULL OR d.expiry_date > now())))`,
    [config.enableDemoRules]
  );
  for (const row of dbMedicines.rows) candidates.add(String(row.medicine).toLowerCase());

  return [...candidates].filter((medicine) => includesTerm(value, medicine) || chronic.map((item) => item.toLowerCase()).includes(medicine));
}

export async function detectAllergyConflicts({ question, patientContext }) {
  const allergyGroups = await resolveAllergyGroups(patientContext?.allergies || []);
  const medicines = await detectMentionedMedicines(question, patientContext);
  if (allergyGroups.length === 0 || medicines.length === 0) {
    return { conflicts: [], blocked: false };
  }

  const result = await query(
    `SELECT r.medicine, g.name AS allergy_group, r.severity, r.warning, r.source_reference,
            r.last_reviewed_date, r.source_document_id, r.source_name, r.source_version,
            r.source_page_section_reference, r.approval_status, r.confidence_score, r.rule_origin
     FROM medicine_allergy_risks r
     JOIN allergy_groups g ON g.id = r.allergy_group_id
     LEFT JOIN documents d ON d.id = r.source_document_id
     WHERE r.active = true
       AND lower(r.medicine) = ANY($1::text[])
       AND r.allergy_group_id = ANY($2::uuid[])
       AND (
         (r.rule_origin = 'seed_demo' AND $3 = true)
         OR (r.rule_origin = 'imported' AND r.approval_status = 'approved' AND d.status = 'approved' AND d.active_flag = true AND (d.expiry_date IS NULL OR d.expiry_date > now()))
       )`,
    [medicines.map((item) => item.toLowerCase()), allergyGroups.map((group) => group.id), config.enableDemoRules]
  );

  const conflicts = result.rows;
  return {
    conflicts,
    blocked: conflicts.some((conflict) => ["high", "contraindicated"].includes(conflict.severity))
  };
}

export async function detectInteractions({ question, patientContext }) {
  const medicines = await detectMentionedMedicines(question, patientContext);
  const conditions = listify(patientContext?.chronicConditions || []).map((item) => String(item).toLowerCase());
  if (medicines.length < 2 && conditions.length === 0) {
    return { interactions: [], contraindicated: false, major: false, moderate: false };
  }

  const terms = [...new Set([...medicines.map((item) => item.toLowerCase()), ...conditions])];
  const result = await query(
    `SELECT i.medicine_a, i.medicine_b, i.severity, i.interaction_reason, i.action_required,
            i.source_document_id, i.source_name, i.source_version, i.source_page_section_reference,
            i.approval_status, i.confidence_score, i.rule_origin
     FROM medicine_interactions i
     LEFT JOIN documents d ON d.id = i.source_document_id
     WHERE i.active = true
       AND lower(i.medicine_a) = ANY($1::text[])
       AND lower(i.medicine_b) = ANY($1::text[])
       AND ((i.rule_origin = 'seed_demo' AND $2 = true)
         OR (i.rule_origin = 'imported' AND i.approval_status = 'approved' AND d.status = 'approved' AND d.active_flag = true AND (d.expiry_date IS NULL OR d.expiry_date > now())))`,
    [terms, config.enableDemoRules]
  );

  const reverse = await query(
    `SELECT i.medicine_a, i.medicine_b, i.severity, i.interaction_reason, i.action_required,
            i.source_document_id, i.source_name, i.source_version, i.source_page_section_reference,
            i.approval_status, i.confidence_score, i.rule_origin
     FROM medicine_interactions i
     LEFT JOIN documents d ON d.id = i.source_document_id
     WHERE i.active = true
       AND lower(i.medicine_b) = ANY($1::text[])
       AND lower(i.medicine_a) = ANY($1::text[])
       AND ((i.rule_origin = 'seed_demo' AND $2 = true)
         OR (i.rule_origin = 'imported' AND i.approval_status = 'approved' AND d.status = 'approved' AND d.active_flag = true AND (d.expiry_date IS NULL OR d.expiry_date > now())))`,
    [terms, config.enableDemoRules]
  );

  const seen = new Set();
  const interactions = [...result.rows, ...reverse.rows].filter((item) => {
    const key = [item.medicine_a, item.medicine_b, item.severity].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    interactions,
    contraindicated: interactions.some((item) => item.severity === "contraindicated"),
    major: interactions.some((item) => item.severity === "major"),
    moderate: interactions.some((item) => item.severity === "moderate")
  };
}

export function formatInteractionWarning(interactions) {
  return interactions
    .map((item) => `${item.medicine_a} + ${item.medicine_b}: ${item.severity}. ${item.interaction_reason} ${item.action_required}`)
    .join("\n");
}

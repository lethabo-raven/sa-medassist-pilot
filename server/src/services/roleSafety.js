import { config } from "../config.js";
import { detectClinicalEscalation, detectHighRiskMedicine } from "./clinicalSafety.js";

const ROLE_MAP = new Map([
  ["pharmacist", "pharmacist"],
  ["doctor", "doctor"],
  ["pharmacist assistant", "pharmacy_assistant"],
  ["pharmacy assistant", "pharmacy_assistant"],
  ["assistant", "pharmacy_assistant"],
  ["pharmacy manager", "pharmacy_manager"],
  ["manager", "pharmacy_manager"],
  ["other", "other"]
]);

const CONSULTATION_PATTERNS = [
  { key: "drug_interactions", patterns: [/\binteract/i, /\binteraction/i, /\btogether\b/i] },
  { key: "contraindications", patterns: [/\bcontraindicat/i, /\bshould not\b/i, /\bavoid\b/i] },
  { key: "unclear_diagnosis", patterns: [/\bdiagnos/i, /\bnot sure what\b/i, /\bunknown condition\b/i, /\bunclear\b/i] },
  { key: "icd10_uncertainty", patterns: [/\bicd[-\s]?10\b/i, /\bdiagnosis code\b/i, /\bclaim code\b/i, /\bcode for\b/i] }
];

export const PHARMACY_ASSISTANT_FOOTER =
  "For pharmacist assistant use: confirm clinical decisions, scheduled medicines, pregnancy/breastfeeding cases, paediatric dosing, interactions, contraindications, and uncertain ICD-10 coding with the responsible pharmacist.";

export const MEDICAL_AID_DISCLAIMER =
  "Medical aid scheme rules, benefit options, PMB rules, formularies, authorisation requirements, and claim requirements may differ. Confirm with the relevant medical aid or scheme rules where required.";

export function normalizeChatRole(role) {
  const cleaned = String(role || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  return ROLE_MAP.get(cleaned) || "pharmacy_assistant";
}

export function isSupportOnlyRole(role) {
  return role === "pharmacy_assistant" || role === "other";
}

export function detectScheduledMedicine(text) {
  const value = String(text || "").toLowerCase();
  const matches = config.scheduledMedicineTerms.filter((term) => value.includes(String(term).toLowerCase()));
  return {
    scheduledMedicineTrigger: matches.length > 0,
    scheduledMedicineMatches: [...new Set(matches)]
  };
}

export function detectConsultationTriggers(text, role) {
  const clinical = detectClinicalEscalation(text);
  const highRisk = detectHighRiskMedicine(text);
  const scheduled = detectScheduledMedicine(text);
  const patternReasons = CONSULTATION_PATTERNS
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(String(text || ""))))
    .map((rule) => rule.key);

  const reasons = [
    ...clinical.escalationReasons,
    ...patternReasons,
    ...(highRisk.highRiskMedicine ? ["high_risk_medicine"] : []),
    ...(scheduled.scheduledMedicineTrigger ? ["scheduled_or_controlled_medicine"] : [])
  ];

  return {
    clinicalEscalation: clinical.clinicalEscalation,
    escalationReasons: clinical.escalationReasons,
    highRiskMedicine: highRisk.highRiskMedicine,
    highRiskMedicineMatches: highRisk.highRiskMedicineMatches,
    scheduledMedicineTrigger: scheduled.scheduledMedicineTrigger,
    scheduledMedicineMatches: scheduled.scheduledMedicineMatches,
    pharmacistConsultationRequired: isSupportOnlyRole(role) && reasons.length > 0,
    consultationReasons: [...new Set(reasons)]
  };
}

export function applyRoleSpecificWording(answer, role, safety) {
  const parts = [answer];

  if (role === "pharmacist" || role === "doctor") {
    if (!answer.includes("Clinical review recommended.") && (safety.clinicalEscalation || safety.highRiskMedicine)) {
      parts.push("Clinical caution: verify against patient-specific factors and current professional judgement.");
    }
  } else if (role === "pharmacy_manager") {
    parts.push("Operational support only. This response does not grant clinical authority.");
  } else {
    parts.unshift("Support information for responsible pharmacist review:");
    if (safety.pharmacistConsultationRequired) {
      parts.push("Pharmacist consultation required.");
    }
    parts.push("Support information only. Do not present this as a final clinical decision.");
    parts.push(PHARMACY_ASSISTANT_FOOTER);
  }

  parts.push(MEDICAL_AID_DISCLAIMER);
  return [...new Set(parts.filter(Boolean))].join("\n\n");
}

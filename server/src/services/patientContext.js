import { query } from "../db/pool.js";
import { isIcd10Query } from "./icd10.js";

const FIELD_LABELS = {
  age: "Patient age required.",
  weight: "Patient weight required.",
  gender: "Patient gender required.",
  pregnancyStatus: "Pregnancy status required.",
  breastfeedingStatus: "Breastfeeding status required.",
  allergies: "Allergy information required.",
  chronicConditions: "Chronic condition information required.",
  renalImpairment: "Kidney function information required.",
  hepaticImpairment: "Liver function information required."
};

const SENSITIVE_PATTERNS = [
  { queryType: "Dosage", fields: ["age", "weight"], patterns: [/\bpaediatric\b/i, /\bpediatric\b/i, /\bchild\b/i, /\binfant\b/i, /\bdose\b/i, /\bdosage\b/i] },
  { queryType: "Medicine suitability", fields: ["pregnancyStatus"], patterns: [/\bpregnan/i, /\btrimester\b/i] },
  { queryType: "Medicine suitability", fields: ["breastfeedingStatus"], patterns: [/\bbreast[-\s]?feed/i, /\blactat/i] },
  { queryType: "Dosage", fields: ["renalImpairment"], patterns: [/\brenal\b/i, /\bkidney\b/i, /\beGFR\b/i] },
  { queryType: "Dosage", fields: ["hepaticImpairment"], patterns: [/\bhepatic\b/i, /\bliver\b/i] },
  { queryType: "Contraindications", fields: ["allergies", "chronicConditions"], patterns: [/\bcontraindicat/i, /\bshould not\b/i, /\bavoid\b/i] },
  { queryType: "Drug interactions", fields: ["chronicConditions", "renalImpairment", "hepaticImpairment"], patterns: [/\binteract/i, /\binteraction/i, /\btogether\b/i] }
];

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizedSeverity(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizePatientContext(context = {}) {
  return {
    age: context.age,
    weight: context.weight,
    gender: context.gender,
    pregnancyStatus: context.pregnancyStatus,
    breastfeedingStatus: context.breastfeedingStatus,
    allergies: context.allergies,
    chronicConditions: context.chronicConditions,
    chronicMedications: context.chronicMedications,
    renalImpairment: context.renalImpairment,
    hepaticImpairment: context.hepaticImpairment
  };
}

export async function getRequiredContextFields(queryType) {
  const result = await query(
    "SELECT required_fields FROM patient_context_requirements WHERE query_type = $1 AND active_flag = true",
    [queryType]
  );
  return result.rowCount > 0 ? result.rows[0].required_fields : [];
}

export async function determineRequiredContext({ question, queryClassification }) {
  const baseType = isIcd10Query(question) ? "ICD-10" : queryClassification;
  const configured = new Set(await getRequiredContextFields(baseType));

  for (const rule of SENSITIVE_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(question))) {
      for (const field of rule.fields) configured.add(field);
    }
  }

  return {
    queryType: baseType,
    requiredFields: [...configured]
  };
}

export function validatePatientContext(requiredFields, patientContext = {}) {
  const normalized = normalizePatientContext(patientContext);
  const missingFields = requiredFields.filter((field) => !hasValue(normalized[field]));
  return {
    complete: missingFields.length === 0,
    missingFields,
    normalizedContext: normalized,
    followUpQuestions: missingFields.map((field) => FIELD_LABELS[field] || `${field} required.`)
  };
}

export function buildMissingContextAnswer(followUpQuestions, role) {
  const lines = [...new Set(followUpQuestions)];
  if (role === "pharmacy_assistant" || role === "other") {
    lines.push("Pharmacist consultation may be required.");
  }
  return lines.join("\n");
}

export function validateClinicalPlausibility({ patientContext = {}, question = "", requiredFields = [] }) {
  const context = normalizePatientContext(patientContext);
  const issues = [];
  const cautions = [];
  const followUpQuestions = [];
  const questionText = String(question || "");

  const age = toNumber(context.age);
  const weight = toNumber(context.weight);
  const needsDosageSafety = requiredFields.includes("weight") || /\bpaediatric\b|\bpediatric\b|\bchild\b|\binfant\b|\bdose\b|\bdosage\b/i.test(questionText);
  const pregnancySensitive = requiredFields.includes("pregnancyStatus") || /\bpregnan/i.test(questionText);
  const breastfeedingSensitive = requiredFields.includes("breastfeedingStatus") || /\bbreast[-\s]?feed|\blactat/i.test(questionText);

  if (hasValue(context.age) && (age === null || age < 0 || age > 120)) {
    issues.push({ field: "age", reason: "Age must be between 0 and 120 years." });
  }

  const neonatalHighRisk = age !== null && age < 28 / 365;
  if (neonatalHighRisk) {
    cautions.push("Neonatal high-risk patient. Pharmacist review required.");
  }

  if (hasValue(context.weight) && (weight === null || weight < 0.5 || weight > 350)) {
    issues.push({ field: "weight", reason: "Weight must be between 0.5kg and 350kg." });
  }

  if (needsDosageSafety && !hasValue(context.weight)) {
    followUpQuestions.push("Patient weight required.");
  }

  if (age !== null && weight !== null) {
    if (age < 1 && weight > 15) {
      cautions.push("Age and weight are clinically unusual together. Pharmacist review required.");
    }
    if (age >= 18 && weight < 20) {
      cautions.push("Adult age with very low weight is clinically unusual. Pharmacist review required.");
    }
    if (age < 12 && weight > 120) {
      cautions.push("Paediatric age with very high weight is clinically unusual. Pharmacist review required.");
    }
  }

  if (pregnancySensitive) {
    const pregnancy = normalizedSeverity(context.pregnancyStatus);
    if (!pregnancy) {
      followUpQuestions.push("Pregnancy status required.");
    } else if (pregnancy === "unknown") {
      followUpQuestions.push("Pregnancy status is unknown. Confirm pregnancy status before guidance.");
      cautions.push("Pregnancy status unknown. Pharmacist confirmation required.");
    }
  }

  if (breastfeedingSensitive) {
    const breastfeeding = normalizedSeverity(context.breastfeedingStatus);
    if (!breastfeeding) {
      followUpQuestions.push("Breastfeeding status required.");
    } else if (breastfeeding === "unknown") {
      followUpQuestions.push("Breastfeeding status is unknown. Confirm breastfeeding status before guidance.");
      cautions.push("Breastfeeding status unknown. Pharmacist confirmation required.");
    }
  }

  for (const field of ["renalImpairment", "hepaticImpairment"]) {
    if (!requiredFields.includes(field) && !hasValue(context[field])) continue;
    const value = normalizedSeverity(context[field]);
    const allowed = new Set(["none", "mild", "moderate", "severe", "unknown", "false", "true"]);
    if (value && !allowed.has(value)) {
      issues.push({ field, reason: `${field} must be none, mild, moderate, severe, or unknown.` });
    }
    if (value === "unknown") {
      const label = field === "renalImpairment" ? "Kidney function" : "Liver function";
      followUpQuestions.push(`${label} information is unknown. Confirm before guidance.`);
      cautions.push(`${label} unknown. Pharmacist review required.`);
    }
  }

  return {
    plausible: issues.length === 0 && followUpQuestions.length === 0,
    issues,
    cautions: [...new Set(cautions)],
    followUpQuestions: [...new Set(followUpQuestions)],
    neonatalHighRisk,
    pharmacistReviewRequired: neonatalHighRisk || cautions.length > 0 || issues.length > 0,
    implausiblePatientContext: issues.length > 0
  };
}

export function buildPlausibilityAnswer(validation, role) {
  const lines = [
    ...validation.issues.map((issue) => issue.reason),
    ...validation.followUpQuestions,
    ...validation.cautions
  ];
  if (role === "pharmacy_assistant" || role === "other") {
    lines.push("Pharmacist consultation may be required.");
  }
  return [...new Set(lines)].join("\n");
}

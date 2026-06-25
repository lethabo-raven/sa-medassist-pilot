import { config } from "../config.js";

const ESCALATION_RULES = [
  { key: "pregnancy", patterns: [/\bpregnan/i, /\btrimester\b/i] },
  { key: "breastfeeding", patterns: [/\bbreast[-\s]?feed/i, /\blactat/i] },
  { key: "paediatric_dosing", patterns: [/\bpaediatric\b/i, /\bpediatric\b/i, /\bchild\b/i, /\binfant\b/i, /\bbaby\b/i, /\bkg\b/i] },
  { key: "renal_impairment", patterns: [/\brenal\b/i, /\bkidney\b/i, /\beGFR\b/i, /\bcreatinine\b/i] },
  { key: "hepatic_impairment", patterns: [/\bhepatic\b/i, /\bliver\b/i, /\bcirrhosis\b/i] },
  { key: "overdose", patterns: [/\boverdose\b/i, /\btoo much\b/i, /\bexcess dose\b/i] },
  { key: "poisoning", patterns: [/\bpoison/i, /\bingestion\b/i, /\btoxic\b/i] },
  {
    key: "emergency_symptoms",
    patterns: [
      /\bchest pain\b/i,
      /\bshortness of breath\b/i,
      /\btrouble breathing\b/i,
      /\bstroke\b/i,
      /\bseizure\b/i,
      /\bunconscious\b/i,
      /\banaphylaxis\b/i,
      /\bsevere allergic\b/i,
      /\bsuicid/i
    ]
  }
];

export function detectClinicalEscalation(text) {
  const value = String(text || "");
  const matches = ESCALATION_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(value)))
    .map((rule) => rule.key);

  return {
    clinicalEscalation: matches.length > 0,
    escalationReasons: matches
  };
}

export function detectHighRiskMedicine(text) {
  const value = String(text || "").toLowerCase();
  const matches = config.highRiskMedicineTerms.filter((term) => value.includes(String(term).toLowerCase()));

  return {
    highRiskMedicine: matches.length > 0,
    highRiskMedicineMatches: [...new Set(matches)]
  };
}

export function appendClinicalReviewRecommendation(answer, safety) {
  if (!safety.clinicalEscalation && !safety.highRiskMedicine) return answer;
  if (answer.includes("Clinical review recommended.")) return answer;
  return `${answer}\n\nClinical review recommended.`;
}

const RED_FLAGS = [
  { key: "chest_pain", patterns: [/\bchest pain\b/i] },
  { key: "shortness_of_breath", patterns: [/\bshortness of breath\b/i, /\btrouble breathing\b/i, /\bdifficulty breathing\b/i] },
  { key: "stroke_symptoms", patterns: [/\bstroke\b/i, /\bface droop/i, /\bslurred speech\b/i, /\bone[-\s]?sided weakness\b/i] },
  { key: "severe_allergic_reaction", patterns: [/\bsevere allergic\b/i, /\ballergic reaction\b/i] },
  { key: "anaphylaxis", patterns: [/\banaphylaxis\b/i] },
  { key: "overdose", patterns: [/\boverdose\b/i, /\btoo much\b/i] },
  { key: "poisoning", patterns: [/\bpoison/i, /\btoxic ingestion\b/i] },
  { key: "suicidal_thoughts", patterns: [/\bsuicid/i, /\bself[-\s]?harm\b/i] },
  { key: "severe_bleeding", patterns: [/\bsevere bleeding\b/i, /\bheavy bleeding\b/i, /\buncontrolled bleeding\b/i] },
  { key: "loss_of_consciousness", patterns: [/\bloss of consciousness\b/i, /\bunconscious\b/i, /\bfainted and won't wake\b/i] },
  { key: "seizures", patterns: [/\bseizure\b/i, /\bconvulsion\b/i] }
];

export function detectEmergencyRedFlags(text) {
  const value = String(text || "");
  const matches = RED_FLAGS
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(value)))
    .map((rule) => rule.key);

  return {
    emergencyRedFlag: matches.length > 0,
    emergencyReasons: matches
  };
}

export function emergencyRedFlagAnswer() {
  return "Immediate medical assessment required.";
}

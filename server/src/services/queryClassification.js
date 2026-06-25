const CLASSIFIERS = [
  {
    label: "Dosage",
    patterns: [/\bdose\b/i, /\bdosage\b/i, /\bhow much\b/i, /\bmg\b/i, /\bmilligram/i]
  },
  {
    label: "Drug interactions",
    patterns: [/\binteract/i, /\binteraction/i, /\btogether\b/i, /\bwith .* medicine\b/i]
  },
  {
    label: "Contraindications",
    patterns: [/\bcontraindicat/i, /\bshould not\b/i, /\bavoid\b/i, /\bunsafe\b/i]
  },
  {
    label: "Side effects",
    patterns: [/\bside effect/i, /\badverse\b/i, /\breaction\b/i, /\bnausea\b/i, /\brash\b/i]
  },
  {
    label: "Counselling points",
    patterns: [/\bcounsel/i, /\badvice\b/i, /\btell the patient\b/i, /\bpatient should\b/i]
  },
  {
    label: "Administration guidance",
    patterns: [/\btake\b/i, /\badminister/i, /\bwith food\b/i, /\bbefore food\b/i, /\bafter food\b/i, /\broute\b/i]
  },
  {
    label: "General medicine information",
    patterns: [/\bwhat is\b/i, /\bused for\b/i, /\bindication/i, /\bmedicine information\b/i]
  }
];

export function classifyQuery(question) {
  const text = String(question || "");
  for (const classifier of CLASSIFIERS) {
    if (classifier.patterns.some((pattern) => pattern.test(text))) {
      return classifier.label;
    }
  }

  return "Unknown";
}

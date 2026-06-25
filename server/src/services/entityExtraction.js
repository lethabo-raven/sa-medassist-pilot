const ENTITY_PATTERNS = [
  { entityType: "icd10", pattern: /\b[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?\b/g, confidence: 0.84 },
  { entityType: "nappi", pattern: /\bNAPPI[:\s-]*([0-9]{6,9})\b/gi, confidence: 0.86 },
  { entityType: "medical_aid_name", pattern: /\b(GEMS|Discovery|Bonitas|Momentum|Medscheme|Fedhealth|Bestmed)\b/gi, confidence: 0.82 },
  { entityType: "schedule", pattern: /\bSchedule\s*[0-8]\b/gi, confidence: 0.78 },
  { entityType: "dosage", pattern: /\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|units?)\b/gi, confidence: 0.72 },
  { entityType: "pregnancy_warning", pattern: /\b(?:pregnancy|pregnant|trimester)\b[^.\n]{0,160}/gi, confidence: 0.74 },
  { entityType: "breastfeeding_warning", pattern: /\b(?:breastfeeding|lactation|breast-feed)\b[^.\n]{0,160}/gi, confidence: 0.74 },
  { entityType: "renal_warning", pattern: /\b(?:renal|kidney|eGFR|creatinine)\b[^.\n]{0,160}/gi, confidence: 0.74 },
  { entityType: "hepatic_warning", pattern: /\b(?:hepatic|liver|cirrhosis)\b[^.\n]{0,160}/gi, confidence: 0.74 },
  { entityType: "contraindication", pattern: /\bcontraindicat(?:ed|ion)?\b[^.\n]{0,180}/gi, confidence: 0.76 },
  { entityType: "drug_interaction", pattern: /\b(?:interaction|interacts with|avoid combination|concomitant use)\b[^.\n]{0,180}/gi, confidence: 0.72 },
  { entityType: "medicine", pattern: /\b(?:warfarin|aspirin|ibuprofen|amoxicillin|methotrexate|trimethoprim|insulin|digoxin|lithium|morphine|codeine)\b/gi, confidence: 0.7 }
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function extractEntitiesFromPages(pages) {
  const entities = [];
  for (const page of pages) {
    for (const extractor of ENTITY_PATTERNS) {
      const matches = page.text.matchAll(extractor.pattern);
      for (const match of matches) {
        const value = match[1] || match[0];
        entities.push({
          entityType: extractor.entityType,
          entityValue: String(value).trim(),
          normalizedValue: normalize(value),
          pageNumber: page.pageNumber,
          sectionHeading: page.sectionHeading,
          sourceText: String(match[0]).trim().slice(0, 500),
          confidenceScore: extractor.confidence
        });
      }
    }
  }

  const seen = new Set();
  return entities.filter((entity) => {
    const key = [entity.entityType, entity.normalizedValue, entity.pageNumber, entity.sectionHeading].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

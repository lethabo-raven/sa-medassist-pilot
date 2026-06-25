import { config } from "../config.js";

const CONTRADICTION_PATTERNS = [
  [/\bnot recommended\b/i, /\brecommended\b/i],
  [/\bcontraindicated\b/i, /\bindicated\b/i],
  [/\bmust not\b/i, /\bmay\b/i],
  [/\bavoid\b/i, /\buse\b/i],
  [/\bdo not use\b/i, /\bcan be used\b/i],
  [/\bunsafe\b/i, /\bsafe\b/i],
  [/\bnot indicated\b/i, /\bindicated\b/i]
];

function distinctSources(contexts) {
  return new Set(contexts.map((context) => `${context.source_id}:${context.version}`)).size;
}

export function detectContradictions(contexts) {
  if (distinctSources(contexts) < 2) return { hasConflict: false, conflicts: [] };

  const conflicts = [];
  for (let leftIndex = 0; leftIndex < contexts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < contexts.length; rightIndex += 1) {
      const left = contexts[leftIndex];
      const right = contexts[rightIndex];
      if (`${left.source_id}:${left.version}` === `${right.source_id}:${right.version}`) continue;

      const closeEnough =
        Math.abs(Number(left.relevance) - Number(right.relevance)) <= config.contradictionSimilarityDelta;
      if (!closeEnough) continue;

      const pairConflicts = CONTRADICTION_PATTERNS.some(([negative, positive]) => {
        return (
          (negative.test(left.content) && positive.test(right.content)) ||
          (positive.test(left.content) && negative.test(right.content))
        );
      });

      if (pairConflicts) {
        conflicts.push({ left, right });
      }
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
}

export function buildConflictWarning(conflicts) {
  const labels = [];
  for (const conflict of conflicts) {
    labels.push(conflict.left.citation_label);
    labels.push(conflict.right.citation_label);
  }
  const uniqueLabels = [...new Set(labels)].slice(0, 6);
  return `I found approved sources that may conflict, so I cannot give a definitive answer. Please review the cited sources: ${uniqueLabels.join("; ")}.`;
}

export function validateCitationCompleteness(citations) {
  return citations.every((citation) => {
    return (
      citation.title &&
      citation.version &&
      citation.label &&
      citation.documentIdentifier &&
      citation.approvalDate &&
      citation.approvalStatus === "approved" &&
      citation.active === true &&
      (!citation.expiryDate || new Date(citation.expiryDate) > new Date())
    );
  });
}

export function answerMentionsCitationMetadata(answer, citations, citedIndexes) {
  return citedIndexes.every((index) => {
    const citation = citations[index - 1];
    if (!citation) return false;
    const haystack = answer.toLowerCase();
    const approvalDate = String(citation.approvalDate).slice(0, 10).toLowerCase();
    return (
      haystack.includes(String(citation.title).toLowerCase()) &&
      (haystack.includes(`version ${citation.version}`.toLowerCase()) ||
        haystack.includes(`version: ${citation.version}`.toLowerCase())) &&
      haystack.includes(String(citation.label).toLowerCase()) &&
      haystack.includes(String(citation.approvalStatus).toLowerCase()) &&
      haystack.includes(String(citation.documentIdentifier).toLowerCase()) &&
      haystack.includes(approvalDate)
    );
  });
}

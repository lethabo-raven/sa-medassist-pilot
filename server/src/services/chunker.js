const MAX_CHARS = 1400;
const OVERLAP_CHARS = 180;

export function chunkText(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    const hardEnd = Math.min(start + MAX_CHARS, cleaned.length);
    let end = hardEnd;
    const sentenceBreak = cleaned.lastIndexOf(". ", hardEnd);

    if (sentenceBreak > start + MAX_CHARS * 0.55) {
      end = sentenceBreak + 1;
    }

    chunks.push(cleaned.slice(start, end).trim());
    if (end === cleaned.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }

  return chunks;
}

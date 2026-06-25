export function isPgvectorEnabled() {
  return String(process.env.ENABLE_PGVECTOR || "false").toLowerCase() === "true";
}

export function searchMode() {
  return isPgvectorEnabled() ? "pgvector" : "postgres_full_text";
}

export function assertVectorOptional() {
  return {
    pgvectorEnabled: isPgvectorEnabled(),
    fallbackSearch: !isPgvectorEnabled(),
    searchMode: searchMode(),
  };
}

import fs from "node:fs";
import dotenv from "dotenv";

const productionEnvPath = process.env.DOTENV_CONFIG_PATH || "/etc/sa-medassist/sa-medassist.env";

if (fs.existsSync(productionEnvPath)) {
  dotenv.config({ path: productionEnvPath });
}
dotenv.config();

function csv(value, fallback = []) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .concat(fallback)
    .filter((item, index, all) => all.indexOf(item) === index);
}

const defaultHighRiskMedicines = [
  "warfarin",
  "heparin",
  "rivaroxaban",
  "apixaban",
  "dabigatran",
  "insulin",
  "morphine",
  "oxycodone",
  "fentanyl",
  "tramadol",
  "methotrexate",
  "cyclophosphamide",
  "carbamazepine",
  "valproate",
  "phenytoin",
  "tacrolimus",
  "cyclosporine",
  "azathioprine"
];

const defaultScheduledMedicineTerms = [
  "schedule 2",
  "schedule 3",
  "schedule 4",
  "schedule 5",
  "schedule 6",
  "schedule 7",
  "scheduled medicine",
  "controlled medicine",
  "controlled substance",
  "benzodiazepine",
  "codeine",
  "morphine",
  "fentanyl",
  "oxycodone",
  "methylphenidate",
  "zolpidem",
  "tramadol"
];

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 4100),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  allowedOrigins: csv(process.env.ALLOWED_ORIGINS, [process.env.CLIENT_ORIGIN || "http://localhost:5173"]),
  databaseUrl: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/sa_medassist",
  adminToken: process.env.ADMIN_TOKEN || "change-me",
  adminTokenSha256: process.env.ADMIN_TOKEN_SHA256 || "",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || "llama3.1",
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 10),
  maxUrlBytes: Number(process.env.MAX_URL_BYTES || 5_000_000),
  urlFetchTimeoutMs: Number(process.env.URL_FETCH_TIMEOUT_MS || 12_000),
  minCitationConfidence: Number(process.env.MIN_CITATION_CONFIDENCE || 0.35),
  contradictionSimilarityDelta: Number(process.env.CONTRADICTION_SIMILARITY_DELTA || 0.08),
  highRiskMedicineTerms: csv(process.env.HIGH_RISK_MEDICINE_TERMS, defaultHighRiskMedicines),
  scheduledMedicineTerms: csv(process.env.SCHEDULED_MEDICINE_TERMS, defaultScheduledMedicineTerms),
  icd10MinConfidence: Number(process.env.ICD10_MIN_CONFIDENCE || 0.5),
  enableDemoRules: (process.env.ENABLE_DEMO_RULES || "true").toLowerCase() === "true",
  approvedSourceDomains: csv(process.env.APPROVED_SOURCE_DOMAINS, [
    "sahpra.org.za",
    "health.gov.za",
    "nicd.ac.za",
    "hpcsa.co.za",
    "who.int"
  ])
};

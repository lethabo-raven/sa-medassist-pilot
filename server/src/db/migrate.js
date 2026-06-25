import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.sql");

try {
  const sql = await fs.readFile(schemaPath, "utf8");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  let vectorAvailable = false;
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    vectorAvailable = true;
  } catch (error) {
    console.warn("pgvector/vector is not available; continuing with JSONB + PostgreSQL full-text search fallback.");
  }
  const extensions = await pool.query("SELECT extname FROM pg_extension WHERE extname = ANY($1::text[])", [
    ["pgcrypto"]
  ]);
  const enabled = new Set(extensions.rows.map((row) => row.extname));
  const missing = ["pgcrypto"].filter((name) => !enabled.has(name));
  if (missing.length > 0) {
    throw new Error(`PostgreSQL extension(s) not enabled: ${missing.join(", ")}`);
  }
  if (!vectorAvailable) {
    await pool.query("SET app.enable_pgvector = 'false'");
  }
  await pool.query(sql);
  console.log("Database schema is ready.");
} catch (error) {
  const message = error.message || "";
  if (message.includes("pgcrypto")) {
    console.error("Migration failed: PostgreSQL extension pgcrypto must be installed and enabled for this database before migrations run.");
  } else {
    console.error("Migration failed:", message);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}

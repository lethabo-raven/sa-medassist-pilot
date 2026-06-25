import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.sql");

try {
  const sql = await fs.readFile(schemaPath, "utf8");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  const extensions = await pool.query("SELECT extname FROM pg_extension WHERE extname = ANY($1::text[])", [
    ["vector", "pgcrypto"]
  ]);
  const enabled = new Set(extensions.rows.map((row) => row.extname));
  const missing = ["vector", "pgcrypto"].filter((name) => !enabled.has(name));
  if (missing.length > 0) {
    throw new Error(`PostgreSQL extension(s) not enabled: ${missing.join(", ")}`);
  }
  await pool.query(sql);
  console.log("Database schema is ready.");
} catch (error) {
  const message = error.message || "";
  if (message.includes("extension") || message.includes("vector") || message.includes("pgcrypto")) {
    console.error("Migration failed: PostgreSQL extensions vector and pgcrypto must be installed and enabled for this database before migrations run.");
  } else {
    console.error("Migration failed:", message);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}

import pg from "pg";
import { config } from "../config.js";

export const pool = new pg.Pool({
  connectionString: config.databaseUrl
});

export async function query(text, params) {
  const startedAt = Date.now();
  try {
    return await pool.query(text, params);
  } catch (error) {
    error.query = text;
    error.durationMs = Date.now() - startedAt;
    throw error;
  }
}

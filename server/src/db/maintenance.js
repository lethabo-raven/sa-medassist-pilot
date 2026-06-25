import { query, pool } from "./pool.js";

const retentionDays = Number(process.env.AUDIT_RETENTION_DAYS || 365);

try {
  const result = await query(
    "DELETE FROM audit_logs WHERE created_at < now() - ($1::text || ' days')::interval RETURNING id",
    [retentionDays]
  );
  console.log(`Removed ${result.rowCount} audit rows older than ${retentionDays} days.`);
} finally {
  await pool.end();
}

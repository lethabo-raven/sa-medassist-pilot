import crypto from "node:crypto";
import { query } from "../db/pool.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_HOURS = 12;

export function normalizeJobTitle(value) {
  const title = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (title === "pharmacist") return "pharmacist";
  if (title === "pharmacist assistant" || title === "pharmacy assistant") return "pharmacy_assistant";
  if (title === "pharmacy manager") return "pharmacy_manager";
  if (title === "doctor") return "doctor";
  return "other";
}

export function validatePin(pin) {
  return typeof pin === "string" && /^\d{6}$/.test(pin);
}

export function hashSecret(secret, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifySecret(secret, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, expected] = storedHash.split(":");
  const actual = crypto.scryptSync(secret, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createEmployeeSession(employeeId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await query(
    "INSERT INTO employee_sessions (employee_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [employeeId, tokenHash, expiresAt]
  );
  return { token, expiresAt };
}

export async function recordLoginAttempt({ pharmacyId = null, employeeId = null, success, reason, ipAddress, userAgent }) {
  await query(
    `INSERT INTO employee_login_audit
       (pharmacy_id, employee_id, success, reason, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pharmacyId, employeeId, success, reason, ipAddress || null, userAgent || null]
  );
}

export async function authenticateEmployee({ pharmacyCode, employeeNumber, pin, ipAddress, userAgent }) {
  if (!validatePin(pin)) {
    await recordLoginAttempt({ success: false, reason: "invalid_pin_format", ipAddress, userAgent });
    return { ok: false, status: 400, error: "PIN must be 6 digits." };
  }

  const result = await query(
    `SELECT e.*, p.status AS pharmacy_status
     FROM pharmacy_employees e
     JOIN pharmacies p ON p.id = e.pharmacy_id
     WHERE lower(p.pharmacy_code) = lower($1)
       AND lower(e.employee_number) = lower($2)`,
    [pharmacyCode, employeeNumber]
  );

  if (result.rowCount === 0) {
    await recordLoginAttempt({ success: false, reason: "employee_not_found", ipAddress, userAgent });
    return { ok: false, status: 401, error: "Invalid credentials." };
  }

  const employee = result.rows[0];
  if (employee.pharmacy_status !== "active" || employee.status !== "active") {
    await recordLoginAttempt({ pharmacyId: employee.pharmacy_id, employeeId: employee.id, success: false, reason: "inactive", ipAddress, userAgent });
    return { ok: false, status: 403, error: "Account inactive." };
  }

  if (employee.locked_until && new Date(employee.locked_until) > new Date()) {
    await recordLoginAttempt({ pharmacyId: employee.pharmacy_id, employeeId: employee.id, success: false, reason: "locked", ipAddress, userAgent });
    return { ok: false, status: 423, error: "Account locked." };
  }

  if (!verifySecret(pin, employee.pin_hash)) {
    const failed = Number(employee.failed_login_attempts || 0) + 1;
    const lockedUntil = failed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : null;
    await query(
      "UPDATE pharmacy_employees SET failed_login_attempts = $2, locked_until = $3 WHERE id = $1",
      [employee.id, failed, lockedUntil]
    );
    await recordLoginAttempt({
      pharmacyId: employee.pharmacy_id,
      employeeId: employee.id,
      success: false,
      reason: lockedUntil ? "locked_after_failed_attempts" : "invalid_pin",
      ipAddress,
      userAgent
    });
    return { ok: false, status: 401, error: "Invalid credentials." };
  }

  await query(
    "UPDATE pharmacy_employees SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1",
    [employee.id]
  );
  await recordLoginAttempt({
    pharmacyId: employee.pharmacy_id,
    employeeId: employee.id,
    success: true,
    reason: employee.pin_reset_required ? "pin_reset_required" : "login_success",
    ipAddress,
    userAgent
  });

  const session = await createEmployeeSession(employee.id);
  return {
    ok: true,
    employee: {
      id: employee.id,
      pharmacyId: employee.pharmacy_id,
      employeeNumber: employee.employee_number,
      displayName: employee.display_name,
      jobTitle: employee.job_title,
      chatRole: normalizeJobTitle(employee.job_title),
      systemRole: employee.system_role,
      pinResetRequired: employee.pin_reset_required
    },
    session
  };
}

export async function resolveEmployeeSession(token) {
  if (!token) return null;
  const result = await query(
    `SELECT e.*, p.pharmacy_code, p.pharmacy_name, p.status AS pharmacy_status
     FROM employee_sessions s
     JOIN pharmacy_employees e ON e.id = s.employee_id
     JOIN pharmacies p ON p.id = e.pharmacy_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()`,
    [hashToken(token)]
  );
  if (result.rowCount === 0) return null;
  return result.rows[0];
}

export async function resetEmployeePin({ employeeId, newPin, resetBy }) {
  if (!validatePin(newPin)) throw new Error("PIN must be 6 digits.");
  const result = await query(
    `UPDATE pharmacy_employees
     SET pin_hash = $2,
         pin_reset_required = true,
         failed_login_attempts = 0,
         locked_until = NULL,
         updated_at = now()
     WHERE id = $1
     RETURNING id, pharmacy_id`,
    [employeeId, hashSecret(newPin)]
  );
  if (result.rowCount === 0) throw new Error("Employee not found.");
  await query(
    `INSERT INTO audit_logs (pharmacy_id, event_type, actor, metadata)
     VALUES ($1, 'employee.pin_reset', $2, $3::jsonb)`,
    [result.rows[0].pharmacy_id, resetBy, JSON.stringify({ employeeId })]
  );
  return result.rows[0];
}

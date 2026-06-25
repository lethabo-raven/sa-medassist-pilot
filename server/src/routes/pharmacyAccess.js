import express from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { hashSecret, resetEmployeePin, validatePin } from "../services/auth.js";

const router = express.Router();

const pharmacySchema = z.object({
  pharmacyCode: z.string().trim().min(2),
  pharmacyName: z.string().trim().min(2),
  branchName: z.string().trim().optional(),
  contactPerson: z.string().trim().optional()
});

const employeeSchema = z.object({
  employeeNumber: z.string().trim().min(1),
  displayName: z.string().trim().min(2),
  jobTitle: z.enum(["pharmacist", "pharmacy_assistant", "pharmacy_manager", "doctor", "other"]),
  systemRole: z.enum(["pharmacy_manager", "pharmacist", "pharmacy_assistant", "doctor", "other"]).default("pharmacist"),
  pin: z.string().trim().length(6)
});

function scopedPharmacyId(req, requestedId) {
  if (req.actor?.permissions?.has("*")) return requestedId;
  return req.pharmacyId;
}

router.post("/pharmacies", requirePermission("pharmacies.create"), async (req, res, next) => {
  try {
    const input = pharmacySchema.parse(req.body);
    const result = await query(
      `INSERT INTO pharmacies (pharmacy_code, pharmacy_name, branch_name, contact_person)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.pharmacyCode, input.pharmacyName, input.branchName || null, input.contactPerson || null]
    );
    await query(
      `INSERT INTO audit_logs (pharmacy_id, event_type, actor, metadata)
       VALUES ($1, 'pharmacy.created', $2, $3::jsonb)`,
      [result.rows[0].id, req.actor.externalId, JSON.stringify({ pharmacyId: result.rows[0].id })]
    );
    res.status(201).json({ pharmacy: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/pharmacies/:id/status", requirePermission("pharmacies.suspend"), async (req, res, next) => {
  try {
    const status = req.body.status === "active" ? "active" : "suspended";
    const result = await query("UPDATE pharmacies SET status = $2 WHERE id = $1 RETURNING *", [req.params.id, status]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Pharmacy not found." });
    await query(
      `INSERT INTO audit_logs (pharmacy_id, event_type, actor, metadata)
       VALUES ($1, 'pharmacy.status_changed', $2, $3::jsonb)`,
      [req.params.id, req.actor.externalId, JSON.stringify({ status })]
    );
    res.json({ pharmacy: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/pharmacies/:pharmacyId/employees", requirePermission("employees.manage"), async (req, res, next) => {
  try {
    const pharmacyId = scopedPharmacyId(req, req.params.pharmacyId);
    if (!pharmacyId || (req.pharmacyId && pharmacyId !== req.pharmacyId)) return res.status(403).json({ error: "Wrong pharmacy." });
    const input = employeeSchema.parse(req.body);
    if (!validatePin(input.pin)) return res.status(400).json({ error: "PIN must be 6 digits." });
    const result = await query(
      `INSERT INTO pharmacy_employees
         (pharmacy_id, employee_number, display_name, job_title, system_role, pin_hash, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, pharmacy_id, employee_number, display_name, job_title, system_role, status, pin_reset_required`,
      [pharmacyId, input.employeeNumber, input.displayName, input.jobTitle, input.systemRole, hashSecret(input.pin), req.actor.externalId]
    );
    await query(
      `INSERT INTO audit_logs (pharmacy_id, event_type, actor, metadata)
       VALUES ($1, 'employee.created', $2, $3::jsonb)`,
      [pharmacyId, req.actor.externalId, JSON.stringify({ employeeId: result.rows[0].id })]
    );
    res.status(201).json({ employee: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/employees/:id", requirePermission("employees.manage"), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE pharmacy_employees
       SET display_name = COALESCE($2, display_name),
           job_title = COALESCE($3, job_title),
           system_role = COALESCE($4, system_role),
           status = COALESCE($5, status),
           updated_at = now()
       WHERE id = $1
         AND ($6::uuid IS NULL OR pharmacy_id = $6)
       RETURNING id, pharmacy_id, employee_number, display_name, job_title, system_role, status`,
      [req.params.id, req.body.displayName, req.body.jobTitle, req.body.systemRole, req.body.status, req.actor?.permissions?.has("*") ? null : req.pharmacyId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Employee not found." });
    await query(
      `INSERT INTO audit_logs (pharmacy_id, event_type, actor, metadata)
       VALUES ($1, 'employee.updated', $2, $3::jsonb)`,
      [result.rows[0].pharmacy_id, req.actor.externalId, JSON.stringify({ employeeId: result.rows[0].id })]
    );
    res.json({ employee: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/employees/:id/reset-pin", requirePermission("employees.reset_pin"), async (req, res, next) => {
  try {
    const pin = String(req.body.pin || "");
    if (!validatePin(pin)) return res.status(400).json({ error: "PIN must be 6 digits." });
    if (!req.actor?.permissions?.has("*")) {
      const target = await query("SELECT pharmacy_id FROM pharmacy_employees WHERE id = $1", [req.params.id]);
      if (target.rowCount === 0 || target.rows[0].pharmacy_id !== req.pharmacyId) return res.status(403).json({ error: "Wrong pharmacy." });
    }
    const result = await resetEmployeePin({ employeeId: req.params.id, newPin: pin, resetBy: req.actor.externalId });
    res.json({ status: "reset", employeeId: result.id });
  } catch (error) {
    next(error);
  }
});

router.get("/pharmacy-audits", requirePermission("pharmacy_audits.view"), async (req, res, next) => {
  try {
    const pharmacyId = req.actor?.permissions?.has("*") ? req.query.pharmacyId || null : req.pharmacyId;
    const result = await query(
      `SELECT *
       FROM audit_logs
       WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
       ORDER BY created_at DESC
       LIMIT 200`,
      [pharmacyId]
    );
    res.json({ logs: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;

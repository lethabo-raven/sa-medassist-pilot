import express from "express";
import * as db from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { hashSecret, resetEmployeePin, validatePin } from "../services/auth.js";
import { audit } from "../services/audit.js";

const router = express.Router();
const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

function requirePharmacyScope(req, res) {
  const pharmacyId = req.actor?.role === "system_owner" ? req.query.pharmacyId || req.body?.pharmacyId : req.pharmacyId;
  if (!pharmacyId) {
    res.status(403).json({ error: "Pharmacy scope is required" });
    return null;
  }
  return pharmacyId;
}

function normalizeEmployeeRole(role) {
  const value = String(role || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["pharmacist", "pharmacy_assistant", "pharmacy_manager"].includes(value)) return value;
  if (value === "pharmacist_assistant") return "pharmacy_assistant";
  return "pharmacy_assistant";
}

function jobTitleForRole(role) {
  if (role === "pharmacist") return "Pharmacist";
  if (role === "pharmacy_manager") return "Pharmacy Manager";
  return "Pharmacy Assistant";
}

router.get("/dashboard", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const pharmacyId = requirePharmacyScope(req, res);
    if (!pharmacyId) return;

    const [{ rows: employeeRows }, { rows: questionRows }, { rows: escalationRows }, { rows: approvalRows }] = await Promise.all([
      query(
        `
        SELECT COUNT(*)::int AS active_employees
        FROM pharmacy_employees
        WHERE pharmacy_id = $1 AND status = 'active'
        `,
        [pharmacyId],
      ),
      query(
        `
        SELECT COUNT(*)::int AS questions_today
        FROM audit_logs
        WHERE pharmacy_id = $1
          AND event_type IN ('query_received', 'answer_answered', 'answer_refused')
          AND created_at >= date_trunc('day', now())
        `,
        [pharmacyId],
      ),
      query(
        `
        SELECT
          COUNT(*) FILTER (WHERE pharmacist_review_required OR event_type = 'pharmacist_consultation_required')::int AS escalations,
          COUNT(*) FILTER (WHERE interaction_detected OR event_type = 'interaction_detected')::int AS interaction_warnings,
          COUNT(*) FILTER (WHERE allergy_conflict OR event_type = 'allergy_conflict')::int AS allergy_warnings
        FROM audit_logs
        WHERE pharmacy_id = $1
          AND created_at >= date_trunc('day', now())
        `,
        [pharmacyId],
      ),
      query(
        `
        SELECT COUNT(*)::int AS pending_approvals
        FROM documents
        WHERE pharmacy_id = $1
          AND approval_status = 'pending'
        `,
        [pharmacyId],
      ),
    ]);

    res.json({
      dashboard: {
        activeEmployees: employeeRows[0]?.active_employees || 0,
        questionsAskedToday: questionRows[0]?.questions_today || 0,
        escalations: escalationRows[0]?.escalations || 0,
        interactionWarnings: escalationRows[0]?.interaction_warnings || 0,
        allergyWarnings: escalationRows[0]?.allergy_warnings || 0,
        pendingApprovals: approvalRows[0]?.pending_approvals || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/employees", requirePermission("employees.manage"), async (req, res, next) => {
  try {
    const pharmacyId = requirePharmacyScope(req, res);
    if (!pharmacyId) return;

    const { rows } = await query(
      `
      SELECT
        id,
        employee_number,
        full_name,
        job_title,
        role,
        status,
        must_reset_pin,
        failed_login_count,
        locked_until,
        last_login_at,
        created_at,
        updated_at
      FROM pharmacy_employees
      WHERE pharmacy_id = $1
        AND role IN ('pharmacist', 'pharmacy_assistant', 'pharmacy_manager')
      ORDER BY created_at DESC
      `,
      [pharmacyId],
    );

    res.json({ employees: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/employees", requirePermission("employees.manage"), async (req, res, next) => {
  try {
    const pharmacyId = requirePharmacyScope(req, res);
    if (!pharmacyId) return;

    const { employeeNumber, fullName, role, pin } = req.body || {};
    if (!employeeNumber || !fullName || !pin) {
      return res.status(400).json({ error: "employeeNumber, fullName, and pin are required" });
    }
    if (!validatePin(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 6 digits" });
    }

    const normalizedRole = normalizeEmployeeRole(role);
    const { rows } = await query(
      `
      INSERT INTO pharmacy_employees (
        pharmacy_id,
        employee_number,
        full_name,
        job_title,
        role,
        pin_hash,
        must_reset_pin,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, 'active')
      RETURNING id, employee_number, full_name, job_title, role, status, must_reset_pin, created_at
      `,
      [pharmacyId, employeeNumber, fullName, jobTitleForRole(normalizedRole), normalizedRole, hashSecret(pin)],
    );

    await audit({
      eventType: "employee_created",
      actor: req.actor?.id || "pharmacy_manager",
      metadata: { employeeId: rows[0].id, role: normalizedRole },
      pharmacyId,
    });

    res.status(201).json({ employee: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/employees/:id", requirePermission("employees.manage"), async (req, res, next) => {
  try {
    const pharmacyId = requirePharmacyScope(req, res);
    if (!pharmacyId) return;

    const { employeeNumber, fullName, role, status } = req.body || {};
    const normalizedRole = role ? normalizeEmployeeRole(role) : null;
    const { rows } = await query(
      `
      UPDATE pharmacy_employees
      SET
        employee_number = COALESCE($3, employee_number),
        full_name = COALESCE($4, full_name),
        role = COALESCE($5, role),
        job_title = COALESCE($6, job_title),
        status = COALESCE($7, status),
        updated_at = now()
      WHERE id = $1
        AND pharmacy_id = $2
      RETURNING id, employee_number, full_name, job_title, role, status, must_reset_pin, updated_at
      `,
      [
        req.params.id,
        pharmacyId,
        employeeNumber || null,
        fullName || null,
        normalizedRole,
        normalizedRole ? jobTitleForRole(normalizedRole) : null,
        status || null,
      ],
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Employee not found" });
    }

    await audit({
      eventType: "employee_updated",
      actor: req.actor?.id || "pharmacy_manager",
      metadata: { employeeId: req.params.id, role: normalizedRole, status },
      pharmacyId,
    });

    res.json({ employee: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/employees/:id/reset-pin", requirePermission("employees.reset_pin"), async (req, res, next) => {
  try {
    const pharmacyId = requirePharmacyScope(req, res);
    if (!pharmacyId) return;

    const { rows } = await query(
      "SELECT id FROM pharmacy_employees WHERE id = $1 AND pharmacy_id = $2",
      [req.params.id, pharmacyId],
    );
    if (!rows[0]) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const employee = await resetEmployeePin({
      employeeId: req.params.id,
      pin: req.body?.pin,
      actorId: req.actor?.id || "pharmacy_manager",
      reason: "pharmacy_manager_reset",
    });

    res.json({ employee });
  } catch (error) {
    next(error);
  }
});

router.get("/employees/:id/history", requirePermission("pharmacy_audits.view"), async (req, res, next) => {
  try {
    const pharmacyId = requirePharmacyScope(req, res);
    if (!pharmacyId) return;

    const { rows } = await query(
      `
      SELECT id, event_type, actor, metadata, created_at
      FROM audit_logs
      WHERE pharmacy_id = $1
        AND (
          actor = $2
          OR metadata->>'employeeId' = $2
        )
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [pharmacyId, req.params.id],
    );

    res.json({ history: rows });
  } catch (error) {
    next(error);
  }
});

export default router;

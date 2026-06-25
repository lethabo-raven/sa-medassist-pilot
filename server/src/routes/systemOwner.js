import express from "express";
import * as db from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { resetEmployeePin } from "../services/auth.js";
import { audit } from "../services/audit.js";

const router = express.Router();
const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

router.get("/pharmacies", requirePermission("pharmacies.create"), async (_req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT
        p.id,
        p.pharmacy_code,
        p.pharmacy_name,
        p.branch_name,
        p.contact_person,
        p.registration_number,
        p.province,
        p.address,
        p.status,
        p.created_at,
        manager.full_name AS manager
      FROM pharmacies p
      LEFT JOIN LATERAL (
        SELECT pe.full_name
        FROM pharmacy_employees pe
        WHERE pe.pharmacy_id = p.id
          AND pe.role = 'pharmacy_manager'
          AND pe.status = 'active'
        ORDER BY pe.created_at DESC
        LIMIT 1
      ) manager ON true
      ORDER BY p.created_at DESC
      `,
    );
    res.json({ pharmacies: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/pharmacies", requirePermission("pharmacies.create"), async (req, res, next) => {
  try {
    const {
      pharmacyName,
      pharmacyCode,
      branchName,
      contactPerson,
      registrationNumber,
      province,
      address,
      manager,
      status = "active",
    } = req.body || {};

    if (!pharmacyName || !pharmacyCode) {
      return res.status(400).json({ error: "pharmacyName and pharmacyCode are required" });
    }

    const { rows } = await query(
      `
      INSERT INTO pharmacies (
        pharmacy_name,
        pharmacy_code,
        branch_name,
        contact_person,
        registration_number,
        province,
        address,
        manager_name,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        pharmacyName,
        pharmacyCode,
        branchName || null,
        contactPerson || null,
        registrationNumber || null,
        province || null,
        address || null,
        manager || null,
        status,
      ],
    );

    await audit({
      eventType: "pharmacy_created",
      actor: req.actor?.id || "system_owner",
      metadata: { pharmacyId: rows[0].id, pharmacyCode },
      pharmacyId: rows[0].id,
    });

    res.status(201).json({ pharmacy: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/pharmacies/:id", requirePermission("pharmacies.create"), async (req, res, next) => {
  try {
    const {
      pharmacyName,
      pharmacyCode,
      branchName,
      contactPerson,
      registrationNumber,
      province,
      address,
      manager,
      status,
    } = req.body || {};

    const { rows } = await query(
      `
      UPDATE pharmacies
      SET
        pharmacy_name = COALESCE($2, pharmacy_name),
        pharmacy_code = COALESCE($3, pharmacy_code),
        branch_name = COALESCE($4, branch_name),
        contact_person = COALESCE($5, contact_person),
        registration_number = COALESCE($6, registration_number),
        province = COALESCE($7, province),
        address = COALESCE($8, address),
        manager_name = COALESCE($9, manager_name),
        status = COALESCE($10, status),
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        req.params.id,
        pharmacyName || null,
        pharmacyCode || null,
        branchName || null,
        contactPerson || null,
        registrationNumber || null,
        province || null,
        address || null,
        manager || null,
        status || null,
      ],
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Pharmacy not found" });
    }

    await audit({
      eventType: "pharmacy_updated",
      actor: req.actor?.id || "system_owner",
      metadata: { pharmacyId: req.params.id },
      pharmacyId: req.params.id,
    });

    res.json({ pharmacy: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/pharmacies/:id/status", requirePermission("pharmacies.suspend"), async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!["active", "disabled", "suspended"].includes(status)) {
      return res.status(400).json({ error: "status must be active, disabled, or suspended" });
    }

    const { rows } = await query(
      `
      UPDATE pharmacies
      SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id, status],
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Pharmacy not found" });
    }

    await audit({
      eventType: status === "active" ? "pharmacy_reactivated" : "pharmacy_disabled",
      actor: req.actor?.id || "system_owner",
      metadata: { pharmacyId: req.params.id, status },
      pharmacyId: req.params.id,
    });

    res.json({ pharmacy: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/managers", requirePermission("pharmacy_managers.manage"), async (_req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT
        pe.id,
        pe.pharmacy_id,
        pe.employee_number,
        pe.full_name,
        pe.email,
        pe.cellphone,
        pe.role,
        pe.job_title,
        pe.status,
        pe.created_at,
        p.pharmacy_name
      FROM pharmacy_employees pe
      JOIN pharmacies p ON p.id = pe.pharmacy_id
      WHERE pe.role = 'pharmacy_manager'
      ORDER BY pe.created_at DESC
      `,
    );
    res.json({ managers: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/pharmacies/:pharmacyId/managers", requirePermission("pharmacy_managers.manage"), async (req, res, next) => {
  try {
    const { employeeNumber, fullName, email, cellphone, pin } = req.body || {};
    if (!employeeNumber || !fullName || !pin) {
      return res.status(400).json({ error: "employeeNumber, fullName, and pin are required" });
    }

    const { hashSecret, validatePin } = await import("../services/auth.js");
    if (!validatePin(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 6 digits" });
    }

    const { rows } = await query(
      `
      INSERT INTO pharmacy_employees (
        pharmacy_id,
        employee_number,
        full_name,
        email,
        cellphone,
        job_title,
        role,
        pin_hash,
        must_reset_pin,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'Pharmacy Manager', 'pharmacy_manager', $6, true, 'active')
      RETURNING id, pharmacy_id, employee_number, full_name, email, cellphone, job_title, role, status, created_at
      `,
      [req.params.pharmacyId, employeeNumber, fullName, email || null, cellphone || null, hashSecret(pin)],
    );

    await audit({
      eventType: "manager_created",
      actor: req.actor?.id || "system_owner",
      metadata: { employeeId: rows[0].id, pharmacyId: req.params.pharmacyId },
      pharmacyId: req.params.pharmacyId,
    });

    res.status(201).json({ manager: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/managers/:id", requirePermission("pharmacy_managers.manage"), async (req, res, next) => {
  try {
    const { employeeNumber, fullName, email, cellphone, status } = req.body || {};
    const { rows } = await query(
      `
      UPDATE pharmacy_employees
      SET
        employee_number = COALESCE($2, employee_number),
        full_name = COALESCE($3, full_name),
        email = COALESCE($4, email),
        cellphone = COALESCE($5, cellphone),
        status = COALESCE($6, status),
        updated_at = now()
      WHERE id = $1
        AND role = 'pharmacy_manager'
      RETURNING id, pharmacy_id, employee_number, full_name, email, cellphone, job_title, role, status, created_at
      `,
      [req.params.id, employeeNumber || null, fullName || null, email || null, cellphone || null, status || null],
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Manager not found" });
    }

    await audit({
      eventType: "manager_updated",
      actor: req.actor?.id || "system_owner",
      metadata: { employeeId: req.params.id, status },
      pharmacyId: rows[0].pharmacy_id,
    });

    res.json({ manager: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/managers/:id/reset-pin", requirePermission("employees.reset_pin"), async (req, res, next) => {
  try {
    const { pin } = req.body || {};
    const employee = await resetEmployeePin({
      employeeId: req.params.id,
      pin,
      actorId: req.actor?.id || "system_owner",
      reason: "system_owner_manager_reset",
    });
    res.json({ employee });
  } catch (error) {
    next(error);
  }
});

router.get("/knowledge/documents", requirePermission("sources.view"), async (_req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT
        d.*,
        latest_run.status AS processing_status,
        latest_run.created_at AS processing_started_at
      FROM documents d
      LEFT JOIN LATERAL (
        SELECT status, created_at
        FROM document_processing_runs
        WHERE document_id = d.id
        ORDER BY created_at DESC
        LIMIT 1
      ) latest_run ON true
      ORDER BY d.created_at DESC
      `,
    );
    res.json({ documents: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/knowledge/approval-queue", requirePermission("sources.approve"), async (_req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT *
      FROM source_backed_rules
      WHERE approval_status = 'pending'
      ORDER BY import_date DESC
      LIMIT 200
      `,
    );
    res.json({ queue: rows });
  } catch (error) {
    next(error);
  }
});

router.post("/knowledge/rules/:id/:decision", requirePermission("sources.approve"), async (req, res, next) => {
  try {
    const { decision } = req.params;
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ error: "decision must be approve or reject" });
    }

    const approvalStatus = decision === "approve" ? "approved" : "rejected";
    const active = decision === "approve";
    const { rows } = await query(
      `
      UPDATE source_backed_rules
      SET approval_status = $2,
          active = $3,
          reviewer = $4,
          reviewed_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id, approvalStatus, active, req.actor?.id || "system_owner"],
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Rule not found" });
    }

    await audit({
      eventType: decision === "approve" ? "rule_approved" : "rule_rejected",
      actor: req.actor?.id || "system_owner",
      metadata: { ruleId: req.params.id, reviewerNote: req.body?.reviewerNote || null },
      pharmacyId: rows[0].pharmacy_id || null,
    });

    res.json({ rule: rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;

import express from "express";
import { query } from "../db/pool.js";
import { requireAdmin } from "../middleware/admin.js";
import { requirePermission } from "../middleware/rbac.js";

const router = express.Router();

router.get("/", requireAdmin, requirePermission("audits.view"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, event_type, actor, question, answer, citations, metadata, created_at
       FROM audit_logs
       WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.actor?.permissions?.has("*") ? null : req.pharmacyId]
    );
    res.json({ logs: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;

import express from "express";
import * as db from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";

const router = express.Router();
const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

router.post("/", requirePermission("assistant.query"), async (req, res, next) => {
  try {
    const { answerId, response, rating, comment } = req.body || {};
    if (!["thumbs_up", "thumbs_down", "helpful", "not_helpful"].includes(rating)) {
      return res.status(400).json({ error: "rating must be thumbs_up or thumbs_down" });
    }
    const pharmacyId = req.pharmacyId || null;
    const { rows } = await query(
      `
      INSERT INTO answer_feedback (pharmacy_id, answer_id, actor, rating, comment, response_snapshot, user_role)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [pharmacyId, answerId || null, req.actor?.id || "anonymous", rating, comment || null, response || null, req.actor?.role || req.actor?.chatRole || "unknown"],
    );

    await audit({
      eventType: "answer_feedback_submitted",
      actor: req.actor?.id || "anonymous",
      metadata: { answerId: answerId || null, rating },
      pharmacyId,
    });

    res.status(201).json({ feedback: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const pharmacyId = req.actor?.role === "system_owner" ? req.query.pharmacyId || null : req.pharmacyId || null;
    const { rows } = await query(
      `
      SELECT *
      FROM answer_feedback
      WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
      ORDER BY created_at DESC
      LIMIT 250
      `,
      [pharmacyId],
    );
    res.json({ feedback: rows });
  } catch (error) {
    next(error);
  }
});

export default router;

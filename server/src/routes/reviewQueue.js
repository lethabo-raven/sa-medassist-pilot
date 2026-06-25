import express from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";

const router = express.Router();

const statusSchema = z.object({
  status: z.enum(["open", "in_review", "resolved"])
});

router.get("/", requirePermission("review_queue.view"), async (req, res, next) => {
  try {
    const status = req.query.status || "open";
    const result = await query(
      `SELECT id, answer_id, reason, status, question, answer, actor, metadata, created_at, resolved_at, resolved_by
       FROM review_queue
       WHERE status = $1
         AND ($2::uuid IS NULL OR pharmacy_id = $2)
       ORDER BY created_at DESC
       LIMIT 200`,
      [status, req.actor?.permissions?.has("*") ? null : req.pharmacyId]
    );
    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requirePermission("review_queue.manage"), async (req, res, next) => {
  try {
    const input = statusSchema.parse(req.body);
    const result = await query(
      `UPDATE review_queue
       SET status = $2,
           resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
           resolved_by = CASE WHEN $2 = 'resolved' THEN $3 ELSE resolved_by END
       WHERE id = $1
         AND ($4::uuid IS NULL OR pharmacy_id = $4)
       RETURNING id, answer_id, status`,
      [req.params.id, input.status, req.actor?.externalId || "anonymous", req.actor?.permissions?.has("*") ? null : req.pharmacyId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Review item not found." });
    }

    await audit("review_queue.updated", {
      actor: req.actor?.externalId || "anonymous",
      answerId: result.rows[0].answer_id,
      metadata: { reviewQueueId: result.rows[0].id, status: result.rows[0].status }
    });

    res.json({ item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;

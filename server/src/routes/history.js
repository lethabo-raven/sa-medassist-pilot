import express from "express";
import { query } from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";

const router = express.Router();

router.get("/answers", requirePermission("answer_history.view"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, answer_id, question, answer, citations, created_at
       FROM audit_logs
       WHERE actor = $1
         AND event_type = 'chat.answered'
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.actor.externalId]
    );
    res.json({ answers: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;

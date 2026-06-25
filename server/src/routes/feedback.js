import express from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";
import { enqueueReview } from "../services/reviewQueue.js";

const router = express.Router();

const feedbackSchema = z.object({
  answerId: z.string().uuid(),
  rating: z.enum(["helpful", "not_helpful", "needs_review"]),
  comment: z.string().trim().max(1000).optional()
});

router.post("/", requirePermission("answers.feedback"), async (req, res, next) => {
  try {
    const input = feedbackSchema.parse(req.body);
    const actor = req.actor?.externalId || "anonymous";

    await query(
      `INSERT INTO answer_feedback (pharmacy_id, answer_id, actor, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (answer_id, actor) DO UPDATE
       SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()`,
      [req.pharmacyId || null, input.answerId, actor, input.rating, input.comment || null]
    );

    await audit("answer.feedback_submitted", {
      actor,
      answerId: input.answerId,
      metadata: { rating: input.rating, comment: input.comment || null }
    });

    if (input.rating === "needs_review") {
      const answerResult = await query(
        "SELECT question, answer FROM audit_logs WHERE answer_id = $1 AND event_type = 'chat.answered' ORDER BY created_at DESC LIMIT 1",
        [input.answerId]
      );
      await enqueueReview({
        pharmacyId: req.pharmacyId || null,
        answerId: input.answerId,
        reason: "user_flagged",
        question: answerResult.rows[0]?.question || null,
        answer: answerResult.rows[0]?.answer || null,
        actor,
        metadata: { rating: input.rating, comment: input.comment || null }
      });
    }

    res.status(201).json({ status: "recorded" });
  } catch (error) {
    next(error);
  }
});

export default router;

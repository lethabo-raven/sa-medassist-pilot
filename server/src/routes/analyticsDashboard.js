import express from "express";
import * as db from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";

const router = express.Router();
const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

router.get("/", requirePermission("reports.view"), async (req, res, next) => {
  try {
    const pharmacyId = req.actor?.role === "system_owner" ? req.query.pharmacyId || null : req.pharmacyId || null;
    const [
      { rows: usage },
      { rows: safety },
      { rows: knowledge },
      { rows: roles },
    ] = await Promise.all([
      query(
        `
        SELECT
          COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()) AND event_type IN ('query_received', 'answer_answered', 'answer_refused'))::int AS questions_today,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()) AND event_type IN ('query_received', 'answer_answered', 'answer_refused'))::int AS questions_this_month,
          COUNT(DISTINCT actor) FILTER (WHERE created_at >= now() - interval '30 days')::int AS active_users
        FROM audit_logs
        WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
        `,
        [pharmacyId],
      ),
      query(
        `
        SELECT
          COUNT(*) FILTER (WHERE allergy_conflict OR event_type = 'allergy_conflict')::int AS allergy_warnings,
          COUNT(*) FILTER (WHERE interaction_detected OR event_type = 'interaction_detected')::int AS interaction_warnings,
          COUNT(*) FILTER (WHERE pharmacist_review_required OR event_type = 'pharmacist_consultation_required')::int AS pharmacist_escalations,
          COUNT(*) FILTER (WHERE emergency_red_flag OR event_type = 'emergency_red_flag')::int AS emergency_escalations
        FROM audit_logs
        WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
        `,
        [pharmacyId],
      ),
      query(
        `
        SELECT
          COUNT(*)::int AS documents_uploaded,
          COUNT(*) FILTER (WHERE approval_status = 'approved')::int AS documents_approved,
          COUNT(*) FILTER (WHERE approval_status = 'rejected')::int AS documents_rejected,
          COUNT(*) FILTER (WHERE COALESCE(active_flag, false) = true)::int AS active_rules
        FROM documents
        WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
        `,
        [pharmacyId],
      ),
      query(
        `
        SELECT COALESCE(selected_role, 'unknown') AS role, COUNT(*)::int AS usage_count
        FROM audit_logs
        WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
          AND event_type IN ('query_received', 'answer_answered', 'answer_refused')
        GROUP BY COALESCE(selected_role, 'unknown')
        ORDER BY usage_count DESC
        `,
        [pharmacyId],
      ),
    ]);

    res.json({
      usage: usage[0] || {},
      safety: safety[0] || {},
      knowledge: knowledge[0] || {},
      userMetrics: roles,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

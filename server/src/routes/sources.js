import express from "express";
import { query } from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";

const router = express.Router();

router.get("/approved", requirePermission("sources.view_approved"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, source_id, version, title, source_url, authority, source_type,
              upload_date, approval_date, approver, active_flag
       FROM documents
       WHERE status = 'approved' AND active_flag = true
       ORDER BY title`
    );
    res.json({ sources: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requirePermission("source_details.view"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, source_id, version, title, source_url, authority, source_type,
              status, active_flag, upload_date, approval_date, approver
       FROM documents
       WHERE id = $1 AND status = 'approved' AND active_flag = true`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Active approved source not found." });
    }

    res.json({ source: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;

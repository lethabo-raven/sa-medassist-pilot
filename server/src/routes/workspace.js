import express from "express";
import * as db from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";

const router = express.Router();
const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

function sectionsForRole(role) {
  if (role === "system_owner" || role === "super_admin") {
    return ["chat", "pharmacies", "managers", "documents", "knowledgeReview", "staff", "analytics", "audit", "connectors", "account"];
  }
  if (role === "pharmacy_manager") {
    return ["chat", "documents", "sopUploads", "knowledgeReview", "staff", "analytics", "audit", "account"];
  }
  return ["chat", "account"];
}

router.get("/me", requirePermission("assistant.query"), async (req, res, next) => {
  try {
  const actor = req.actor || {};
  const role = actor.role || actor.chatRole || "pharmacy_assistant";
  let pharmacy = null;
  if (req.pharmacyId && query) {
    const { rows } = await query(
      `
      SELECT id, pharmacy_id, pharmacy_name, trading_name, province, city, country, status
      FROM pharmacies
      WHERE id = $1
      LIMIT 1
      `,
      [req.pharmacyId],
    );
    pharmacy = rows[0] || null;
  }
  res.json({
    profile: {
      id: actor.id,
      role,
      chatRole: actor.chatRole || role,
      pharmacyId: pharmacy?.pharmacy_id || req.pharmacyId || null,
      pharmacyUuid: req.pharmacyId || null,
      pharmacyName: pharmacy?.pharmacy_name || null,
      pharmacy,
      employeeNumber: req.employee?.employee_number || null,
      fullName: req.employee?.full_name || actor.id || null,
    },
    sections: sectionsForRole(role),
  });
  } catch (error) {
    next(error);
  }
});

router.post("/unauthorized-attempt", async (req, res, next) => {
  try {
    await audit({
      eventType: "workspace_unauthorized_attempt",
      actor: req.actor?.id || "anonymous",
      metadata: {
        section: req.body?.section || null,
        role: req.actor?.role || null,
      },
      pharmacyId: req.pharmacyId || null,
    });
    res.status(403).json({ error: "Unauthorized" });
  } catch (error) {
    next(error);
  }
});

export default router;

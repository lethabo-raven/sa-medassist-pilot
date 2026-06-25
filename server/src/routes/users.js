import express from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAdmin } from "../middleware/admin.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";

const router = express.Router();

const userSchema = z.object({
  externalId: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(160),
  roles: z.array(z.string().trim().min(2)).default([])
});

router.get("/", requireAdmin, requirePermission("users.manage"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.external_id, u.display_name, u.active, u.created_at,
              COALESCE(json_agg(r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles
       FROM app_users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAdmin, requirePermission("users.manage"), async (req, res, next) => {
  try {
    const input = userSchema.parse(req.body);
    const client = await query(
      `INSERT INTO app_users (external_id, display_name, active)
       VALUES ($1, $2, true)
       ON CONFLICT (external_id) DO UPDATE SET display_name = EXCLUDED.display_name, active = true
       RETURNING id, external_id, display_name, active`,
      [input.externalId, input.displayName]
    );

    await query("DELETE FROM user_roles WHERE user_id = $1", [client.rows[0].id]);
    for (const roleName of input.roles) {
      await query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by)
         SELECT $1, id, $2 FROM roles WHERE name = $3
         ON CONFLICT DO NOTHING`,
        [client.rows[0].id, req.actor?.externalId || "admin", roleName]
      );
    }

    await audit("users.upserted", {
      actor: req.actor?.externalId || "admin",
      metadata: { userId: client.rows[0].id, externalId: input.externalId, roles: input.roles }
    });

    res.status(201).json({ user: client.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireAdmin, requirePermission("users.manage"), async (req, res, next) => {
  try {
    const result = await query(
      "UPDATE app_users SET active = false WHERE id = $1 RETURNING id, external_id",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    await audit("users.deactivated", {
      actor: req.actor?.externalId || "admin",
      metadata: { userId: result.rows[0].id, externalId: result.rows[0].external_id }
    });

    res.json({ status: "deactivated" });
  } catch (error) {
    next(error);
  }
});

export default router;

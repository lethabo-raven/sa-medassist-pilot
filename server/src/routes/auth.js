import express from "express";
import { z } from "zod";
import { authenticateEmployee, hashSecret, validatePin } from "../services/auth.js";
import { query } from "../db/pool.js";

const router = express.Router();

const loginSchema = z.object({
  pharmacyCode: z.string().trim().min(1),
  employeeNumber: z.string().trim().min(1),
  pin: z.string().trim().length(6)
});

const resetOwnPinSchema = z.object({
  currentPin: z.string().trim().length(6),
  newPin: z.string().trim().length(6)
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await authenticateEmployee({
      ...input,
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post("/reset-own-pin", async (req, res, next) => {
  try {
    if (!req.employee) return res.status(401).json({ error: "Login required." });
    const input = resetOwnPinSchema.parse(req.body);
    if (!validatePin(input.newPin)) return res.status(400).json({ error: "PIN must be 6 digits." });

    const employee = await query("SELECT pin_hash FROM pharmacy_employees WHERE id = $1", [req.employee.id]);
    const { verifySecret } = await import("../services/auth.js");
    if (!verifySecret(input.currentPin, employee.rows[0].pin_hash)) {
      return res.status(401).json({ error: "Current PIN is incorrect." });
    }

    await query(
      "UPDATE pharmacy_employees SET pin_hash = $2, pin_reset_required = false, updated_at = now() WHERE id = $1",
      [req.employee.id, hashSecret(input.newPin)]
    );
    await query(
      `INSERT INTO audit_logs (pharmacy_id, event_type, actor, metadata)
       VALUES ($1, 'employee.pin_changed', $2, $3::jsonb)`,
      [req.employee.pharmacyId, req.actor.externalId, JSON.stringify({ employeeId: req.employee.id })]
    );
    res.json({ status: "updated" });
  } catch (error) {
    next(error);
  }
});

export default router;

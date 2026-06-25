import express from "express";
import { z } from "zod";
import { query } from "../db/pool.js";
import { requireAdmin } from "../middleware/admin.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";

const router = express.Router();

const icd10Schema = z.object({
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().min(3).max(500),
  documentId: z.string().uuid(),
  effectiveDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional()
});

router.post("/", requireAdmin, requirePermission("sources.approve"), async (req, res, next) => {
  try {
    const input = icd10Schema.parse(req.body);
    const document = await query(
      `SELECT id, source_id, version, status, active_flag, expiry_date
       FROM documents
       WHERE id = $1`,
      [input.documentId]
    );

    if (document.rowCount === 0) {
      return res.status(404).json({ error: "Source document not found." });
    }

    const source = document.rows[0];
    if (source.status !== "approved" || source.active_flag !== true) {
      return res.status(400).json({ error: "ICD-10 codes can only be linked to active approved source documents." });
    }

    if (source.expiry_date && new Date(source.expiry_date) <= new Date()) {
      return res.status(400).json({ error: "ICD-10 codes cannot be linked to expired source documents." });
    }

    const result = await query(
      `INSERT INTO icd10_codes
         (code, description, document_id, source_id, source_version, approval_status, effective_date, expiry_date)
       VALUES ($1, $2, $3, $4, $5, 'approved', COALESCE($6, now()), $7)
       ON CONFLICT (code, source_id, source_version) DO UPDATE
       SET description = EXCLUDED.description,
           document_id = EXCLUDED.document_id,
           approval_status = 'approved',
           effective_date = EXCLUDED.effective_date,
           expiry_date = EXCLUDED.expiry_date
       RETURNING id, code, description, document_id, source_id, source_version, approval_status, effective_date, expiry_date`,
      [
        input.code.toUpperCase(),
        input.description,
        source.id,
        source.source_id,
        source.version,
        input.effectiveDate || null,
        input.expiryDate || null
      ]
    );

    await audit("icd10.code_upserted", {
      actor: req.actor?.externalId || "admin",
      metadata: result.rows[0]
    });

    res.status(201).json({ icd10: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/lookup", requirePermission("source_details.view"), async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required." });

    const result = await query(
      `SELECT c.code, c.description, c.document_id, c.source_id, c.source_version,
              c.approval_status, c.effective_date, c.expiry_date
       FROM icd10_codes c
       JOIN documents d ON d.id = c.document_id
       WHERE c.approval_status = 'approved'
         AND d.status = 'approved'
         AND d.active_flag = true
         AND (c.expiry_date IS NULL OR c.expiry_date > now())
         AND (d.expiry_date IS NULL OR d.expiry_date > now())
         AND (c.code ILIKE $1 OR c.description ILIKE $2)
       ORDER BY c.source_version DESC, c.code
       LIMIT 20`,
      [q, `%${q}%`]
    );

    await audit("icd10.lookup_manual", {
      actor: req.actor?.externalId || "anonymous",
      icd10Lookup: true,
      metadata: { query: q, results: result.rowCount }
    });

    res.json({ matches: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;

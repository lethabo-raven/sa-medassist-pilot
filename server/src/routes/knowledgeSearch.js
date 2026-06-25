import express from "express";
import * as db from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";

const router = express.Router();
const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

const TYPES = new Set(["medicine", "icd10", "nappi", "interaction", "guideline"]);

router.get("/", requirePermission("assistant.query"), async (req, res, next) => {
  try {
    const search = String(req.query.q || "").trim();
    const type = String(req.query.type || "medicine").toLowerCase();
    if (!search) return res.status(400).json({ error: "q is required" });
    if (!TYPES.has(type)) return res.status(400).json({ error: "Unsupported search type" });

    const pharmacyId = req.actor?.role === "system_owner" ? req.query.pharmacyId || null : req.pharmacyId || null;
    const entityPattern = {
      medicine: "%medicine%",
      icd10: "%icd%",
      nappi: "%nappi%",
      interaction: "%interaction%",
      guideline: "%guideline%",
    }[type];

    const { rows } = await query(
      `
      SELECT
        de.id,
        de.entity_type,
        COALESCE(de.extracted_value, de.entity_value, de.value) AS match_text,
        de.confidence_score,
        de.page_number,
        de.section_heading,
        d.id AS document_id,
        d.title AS document_title,
        d.source_organization,
        d.version,
        d.source_url,
        d.approval_status,
        d.active_flag
      FROM document_entities de
      JOIN documents d ON d.id = de.document_id
      WHERE ($1::uuid IS NULL OR d.pharmacy_id = $1)
        AND d.approval_status = 'approved'
        AND COALESCE(d.active_flag, true) = true
        AND COALESCE(de.active, true) = true
        AND COALESCE(de.approval_status, 'approved') = 'approved'
        AND (LOWER(de.entity_type) LIKE $2 OR ($4 = 'guideline' AND LOWER(d.document_category) IN ('clinical guidelines', 'sops', 'dispensing rules')))
        AND (
          COALESCE(de.extracted_value, de.entity_value, de.value, '') ILIKE '%' || $3 || '%'
          OR d.title ILIKE '%' || $3 || '%'
        )
      ORDER BY de.confidence_score DESC NULLS LAST, d.approval_date DESC NULLS LAST
      LIMIT 50
      `,
      [pharmacyId, entityPattern, search, type],
    );

    await audit({
      eventType: "knowledge_search",
      actor: req.actor?.id || "anonymous",
      metadata: { search, type, resultCount: rows.length },
      pharmacyId,
    });

    res.json({ results: rows });
  } catch (error) {
    next(error);
  }
});

export default router;

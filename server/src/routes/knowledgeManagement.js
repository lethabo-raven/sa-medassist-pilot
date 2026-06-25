import express from "express";
import multer from "multer";
import * as db from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024) } });
const query = db.query || db.default?.query || db.pool?.query?.bind(db.pool);

const ALLOWED_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "application/csv"]);

router.post("/documents", requirePermission("sources.upload"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    if (!ALLOWED_TYPES.has(req.file.mimetype)) return res.status(400).json({ error: "Only PDF, DOCX, XLSX, and CSV uploads are supported" });

    const pharmacyId = req.actor?.role === "system_owner" ? req.body.pharmacyId || null : req.pharmacyId || null;
    const { title, category, sourceOrganization, version, publicationDate, expiryDate } = req.body || {};
    const { rows } = await query(
      `
      INSERT INTO documents (
        pharmacy_id,
        title,
        document_category,
        source_organization,
        version,
        publication_date,
        expiry_date,
        file_name,
        mime_type,
        file_size,
        approval_status,
        processing_status,
        uploader
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'uploaded', $11)
      RETURNING *
      `,
      [
        pharmacyId,
        title || req.file.originalname,
        category || "Clinical Guidelines",
        sourceOrganization || null,
        version || null,
        publicationDate || null,
        expiryDate || null,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.actor?.id || "unknown",
      ],
    );

    await audit({
      eventType: "knowledge_document_uploaded",
      actor: req.actor?.id || "unknown",
      metadata: { documentId: rows[0].id, title: rows[0].title, category: rows[0].document_category },
      pharmacyId,
    });

    res.status(201).json({ document: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/documents", requirePermission("sources.view"), async (req, res, next) => {
  try {
    const pharmacyId = req.actor?.role === "system_owner" ? req.query.pharmacyId || null : req.pharmacyId || null;
    const { rows } = await query(
      `
      SELECT *
      FROM documents
      WHERE ($1::uuid IS NULL OR pharmacy_id = $1)
      ORDER BY created_at DESC
      LIMIT 250
      `,
      [pharmacyId],
    );
    res.json({ documents: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/documents/:id/extractions", requirePermission("sources.view"), async (req, res, next) => {
  try {
    const { rows } = await query(
      `
      SELECT *
      FROM document_entities
      WHERE document_id = $1
      ORDER BY entity_type, confidence_score DESC NULLS LAST
      LIMIT 500
      `,
      [req.params.id],
    );
    res.json({ extractions: rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/documents/:id/extractions/:entityId", requirePermission("sources.approve"), async (req, res, next) => {
  try {
    const { extractedValue, confidenceScore, status = "pending" } = req.body || {};
    const { rows } = await query(
      `
      UPDATE document_entities
      SET
        extracted_value = COALESCE($3, extracted_value),
        confidence_score = COALESCE($4, confidence_score),
        approval_status = COALESCE($5, approval_status),
        reviewed_by = $6,
        reviewed_at = now()
      WHERE id = $1 AND document_id = $2
      RETURNING *
      `,
      [req.params.entityId, req.params.id, extractedValue || null, confidenceScore ?? null, status, req.actor?.id || "reviewer"],
    );
    if (!rows[0]) return res.status(404).json({ error: "Extraction not found" });
    res.json({ extraction: rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/documents/:id/review", requirePermission("sources.approve"), async (req, res, next) => {
  try {
    const { decision, note } = req.body || {};
    if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "decision must be approve or reject" });
    const status = decision === "approve" ? "approved" : "rejected";
    const processingStatus = decision === "approve" ? "active" : "rejected";
    const { rows } = await query(
      `
      UPDATE documents
      SET approval_status = $2,
          processing_status = $3,
          reviewer = $4,
          approval_date = CASE WHEN $2 = 'approved' THEN now() ELSE approval_date END,
          active_flag = CASE WHEN $2 = 'approved' THEN true ELSE false END,
          updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id, status, processingStatus, req.actor?.id || "reviewer"],
    );
    if (!rows[0]) return res.status(404).json({ error: "Document not found" });

    await query(
      `
      UPDATE document_entities
      SET approval_status = $2,
          active = $3,
          reviewed_by = $4,
          reviewed_at = now()
      WHERE document_id = $1
        AND approval_status <> 'rejected'
      `,
      [req.params.id, status, decision === "approve", req.actor?.id || "reviewer"],
    );

    await audit({
      eventType: decision === "approve" ? "knowledge_document_approved" : "knowledge_document_rejected",
      actor: req.actor?.id || "reviewer",
      metadata: { documentId: req.params.id, note: note || null },
      pharmacyId: rows[0].pharmacy_id || null,
    });

    res.json({ document: rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;

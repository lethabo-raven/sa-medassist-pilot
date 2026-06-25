import express from "express";
import multer from "multer";
import { config } from "../config.js";
import { query } from "../db/pool.js";
import { requireAdmin } from "../middleware/admin.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";
import {
  extractUploadText,
  fetchUrlText,
  getApprovedSourceDomains,
  indexApprovedDocument,
  isRecognisedMedicalUrlFromSettings,
  rejectDocument
} from "../services/documentIngestion.js";
import {
  activateApprovedDocumentKnowledge,
  processUploadedClinicalDocument
} from "../services/clinicalIngestionPipeline.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadMb * 1024 * 1024
  }
});

async function getVersionInfo(replacesDocumentId) {
  if (!replacesDocumentId) {
    return { sourceId: null, version: 1, replacedDocument: null };
  }

  const result = await query(
    "SELECT id, source_id, version, title FROM documents WHERE id = $1",
    [replacesDocumentId]
  );

  if (result.rowCount === 0) {
    throw new Error("Replacement target document not found.");
  }

  const sourceId = result.rows[0].source_id;
  const latest = await query(
    "SELECT COALESCE(max(version), 0)::int AS version FROM documents WHERE source_id = $1",
    [sourceId]
  );

  return {
    sourceId,
    version: latest.rows[0].version + 1,
    replacedDocument: result.rows[0]
  };
}

router.post("/documents", requireAdmin, requirePermission("sources.upload"), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Upload a PDF or text file." });
    }

    const title = req.body.title?.trim() || req.file.originalname;
    const authority = req.body.authority?.trim() || "admin-verified";
    const sourceUrl = req.body.sourceUrl?.trim() || null;
    const expiryDate = req.body.expiryDate?.trim() || null;
    const replacementTarget = req.body.replacesDocumentId?.trim();
    if (replacementTarget && !req.actor?.permissions?.has("sources.replace")) {
      await audit("access.unauthorized", {
        actor: req.actor?.externalId || "anonymous",
        metadata: { permission: "sources.replace", method: req.method, path: req.originalUrl }
      });
      return res.status(403).json({ error: "You do not have permission to replace source versions." });
    }
    const versionInfo = await getVersionInfo(replacementTarget);
    let text;
    try {
      text = await extractUploadText(req.file);
    } catch (error) {
      await audit("admin.upload_ingestion_failed", {
        actor: "admin",
        metadata: { title, sourceUrl, authority, fileName: req.file.originalname, reason: error.message }
      });
      throw error;
    }

    if (!text.trim()) {
      await audit("admin.upload_ingestion_failed", {
        actor: "admin",
        metadata: { title, sourceUrl, authority, fileName: req.file.originalname, reason: "No readable text found" }
      });
      return res.status(400).json({ error: "No readable text found in this document." });
    }

    const doc = await query(
      `INSERT INTO documents (source_id, version, title, source_url, authority, source_type, status, active_flag, raw_text, uploaded_by, upload_date, expiry_date)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, 'upload', 'pending', false, $6, $7, now(), $8)
       RETURNING id, source_id, version, title, status, uploaded_at, upload_date`,
      [versionInfo.sourceId, versionInfo.version, title, sourceUrl, authority, text, "admin", expiryDate]
    );

    await query(
      `UPDATE documents
       SET pharmacy_id = $2,
           source_organization = $3,
           document_category = $4,
           publication_date = $5,
           file_name = $6,
           file_mime_type = $7,
           file_size_bytes = $8
       WHERE id = $1`,
      [
        doc.rows[0].id,
        req.pharmacyId || null,
        req.body.sourceOrganization?.trim() || authority,
        req.body.documentCategory?.trim() || "Clinical Guidelines",
        req.body.publicationDate?.trim() || null,
        req.file.originalname,
        req.file.mimetype,
        req.file.size
      ]
    );

    const processing = await processUploadedClinicalDocument(doc.rows[0].id, req.file);

    await audit(versionInfo.replacedDocument ? "admin.document_replacement_submitted" : "admin.document_submitted", {
      actor: req.actor?.externalId || "admin",
      metadata: {
        documentId: doc.rows[0].id,
        sourceId: doc.rows[0].source_id,
        version: doc.rows[0].version,
        replacesDocumentId: versionInfo.replacedDocument?.id,
        title,
        sourceUrl,
        expiryDate,
        processing,
        authority,
        sourceType: "upload"
      }
    });

    res.status(201).json({ document: doc.rows[0], status: "pending" });
  } catch (error) {
    next(error);
  }
});

router.post("/documents/url", requireAdmin, requirePermission("sources.upload"), async (req, res, next) => {
  try {
    const sourceUrl = req.body.sourceUrl?.trim();
    const title = req.body.title?.trim() || sourceUrl;
    const authority = req.body.authority?.trim() || "approved-medical-url";
    const expiryDate = req.body.expiryDate?.trim() || null;
    const replacementTarget = req.body.replacesDocumentId?.trim();
    if (replacementTarget && !req.actor?.permissions?.has("sources.replace")) {
      await audit("access.unauthorized", {
        actor: req.actor?.externalId || "anonymous",
        metadata: { permission: "sources.replace", method: req.method, path: req.originalUrl }
      });
      return res.status(403).json({ error: "You do not have permission to replace source versions." });
    }
    const versionInfo = await getVersionInfo(replacementTarget);

    if (!sourceUrl) {
      return res.status(400).json({ error: "sourceUrl is required." });
    }

    if (!(await isRecognisedMedicalUrlFromSettings(sourceUrl)) && req.body.overrideApprovedSource !== true) {
      return res.status(400).json({
        error: "URL is not on the recognised SAHPRA, NDoH, NICD, HPCSA, or WHO source list. Admin override is required."
      });
    }

    let text;
    try {
      text = await fetchUrlText(sourceUrl);
    } catch (error) {
      await audit("admin.url_ingestion_failed", {
        actor: "admin",
        metadata: { sourceUrl, title, authority, reason: error.message }
      });
      throw error;
    }
    if (!text.trim()) {
      await audit("admin.url_ingestion_failed", {
        actor: "admin",
        metadata: { sourceUrl, title, authority, reason: "No readable text found" }
      });
      return res.status(400).json({ error: "No readable text found at this URL." });
    }

    const doc = await query(
      `INSERT INTO documents (source_id, version, title, source_url, authority, source_type, status, active_flag, raw_text, uploaded_by, upload_date, expiry_date)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, 'url', 'pending', false, $6, $7, now(), $8)
       RETURNING id, source_id, version, title, source_url, status, uploaded_at, upload_date`,
      [versionInfo.sourceId, versionInfo.version, title, sourceUrl, authority, text, "admin", expiryDate]
    );

    await audit(versionInfo.replacedDocument ? "admin.url_replacement_submitted" : "admin.url_submitted", {
      actor: req.actor?.externalId || "admin",
      metadata: {
        documentId: doc.rows[0].id,
        sourceId: doc.rows[0].source_id,
        version: doc.rows[0].version,
        replacesDocumentId: versionInfo.replacedDocument?.id,
        title,
        sourceUrl,
        expiryDate,
        authority
      }
    });

    res.status(201).json({ document: doc.rows[0], status: "pending" });
  } catch (error) {
    next(error);
  }
});

router.get("/ingestion-config", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    res.json({ approvedSourceDomains: await getApprovedSourceDomains() });
  } catch (error) {
    next(error);
  }
});

router.put("/ingestion-config", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const domains = Array.isArray(req.body.approvedSourceDomains) ? req.body.approvedSourceDomains : [];
    const cleaned = domains
      .map((domain) => String(domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter(Boolean);

    if (cleaned.length === 0) {
      return res.status(400).json({ error: "At least one approved source domain is required." });
    }

    await query(
      `INSERT INTO ingestion_settings (key, value, updated_by, updated_at)
       VALUES ('approved_source_domains', $1::jsonb, $2, now())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JSON.stringify([...new Set(cleaned)]), req.actor?.externalId || "admin"]
    );

    await audit("admin.ingestion_config_updated", {
      actor: req.actor?.externalId || "admin",
      metadata: { approvedSourceDomains: [...new Set(cleaned)] }
    });

    res.json({ approvedSourceDomains: [...new Set(cleaned)] });
  } catch (error) {
    next(error);
  }
});

router.get("/patient-context-requirements", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT query_type, required_fields, active_flag, updated_at
       FROM patient_context_requirements
       ORDER BY query_type`
    );
    res.json({ requirements: result.rows });
  } catch (error) {
    next(error);
  }
});

router.put("/patient-context-requirements/:queryType", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const requiredFields = Array.isArray(req.body.requiredFields) ? req.body.requiredFields : [];
    const activeFlag = req.body.activeFlag !== false;
    const result = await query(
      `INSERT INTO patient_context_requirements (query_type, required_fields, active_flag, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (query_type) DO UPDATE
       SET required_fields = EXCLUDED.required_fields,
           active_flag = EXCLUDED.active_flag,
           updated_at = now()
       RETURNING query_type, required_fields, active_flag, updated_at`,
      [req.params.queryType, requiredFields, activeFlag]
    );

    await audit("admin.patient_context_requirements_updated", {
      actor: req.actor?.externalId || "admin",
      metadata: result.rows[0]
    });

    res.json({ requirement: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/documents/:id/approve", requireAdmin, requirePermission("sources.approve"), async (req, res, next) => {
  try {
    const result = await indexApprovedDocument(req.params.id, req.actor?.externalId || "admin");
    await activateApprovedDocumentKnowledge(req.params.id, req.actor?.externalId || "admin");
    res.json({ status: "approved", ...result });
  } catch (error) {
    await audit("admin.document_indexing_failed", {
      actor: "admin",
      metadata: { documentId: req.params.id, reason: error.message }
    });
    next(error);
  }
});

router.post("/documents/:id/reject", requireAdmin, requirePermission("sources.reject"), async (req, res, next) => {
  try {
    await rejectDocument(req.params.id, req.body.reason, req.actor?.externalId || "admin");
    res.json({ status: "rejected" });
  } catch (error) {
    next(error);
  }
});

router.delete("/documents/:id", requireAdmin, requirePermission("sources.archive"), async (req, res, next) => {
  try {
    await query("DELETE FROM document_chunks WHERE document_id = $1", [req.params.id]);
    const result = await query(
      `UPDATE documents
       SET status = 'archived', active_flag = false
       WHERE id = $1
       RETURNING id, source_id, version`,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Document not found." });
    }

    await audit("admin.document_deleted", {
      actor: req.actor?.externalId || "admin",
      metadata: {
        documentId: result.rows[0].id,
        sourceId: result.rows[0].source_id,
        version: result.rows[0].version,
        deletionMode: "archived"
      }
    });

    res.json({ status: "archived" });
  } catch (error) {
    next(error);
  }
});

router.get("/documents/:id/entities", requireAdmin, requirePermission("sources.view_approved"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, entity_type, entity_value, normalized_value, page_number, section_heading,
              source_text, confidence_score, review_status, active_flag, extraction_timestamp
       FROM document_entities
       WHERE document_id = $1
       ORDER BY entity_type, page_number, entity_value`,
      [req.params.id]
    );
    res.json({ entities: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/entities/:id/approve", requireAdmin, requirePermission("sources.approve"), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE document_entities
       SET review_status = 'approved',
           active_flag = true,
           reviewed_by = $2,
           reviewed_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, req.actor?.externalId || "admin"]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Entity not found." });
    res.json({ entity: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/entities/:id/reject", requireAdmin, requirePermission("sources.reject"), async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE document_entities
       SET review_status = 'rejected',
           active_flag = false,
           reviewed_by = $2,
           reviewed_at = now()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, req.actor?.externalId || "admin"]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Entity not found." });
    res.json({ entity: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/documents", requireAdmin, requirePermission("sources.view_approved"), async (req, res, next) => {
  try {
    const result = await query(
      `SELECT d.id, d.source_id, d.version, d.title, d.source_url, d.authority, d.source_type, d.status,
              d.active_flag, d.upload_date, d.expiry_date, d.approver, d.approval_date,
              d.uploaded_at, d.approved_by, d.approved_at, d.rejected_by,
              d.rejected_at, d.rejection_reason,
              count(dc.id)::int AS chunks
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       WHERE ($1::uuid IS NULL OR d.pharmacy_id = $1)
       GROUP BY d.id
       ORDER BY d.uploaded_at DESC`,
      [req.actor?.permissions?.has("*") ? null : req.pharmacyId]
    );
    res.json({ documents: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;

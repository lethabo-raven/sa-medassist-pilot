import express from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/admin.js";
import { requirePermission } from "../middleware/rbac.js";
import { audit } from "../services/audit.js";
import { upsertMedicineRiskProfile } from "../services/medicineRiskProfiles.js";
import {
  lookupMedicalAidRules,
  upsertIcd10Master,
  upsertMedicalAidRule,
  upsertMedicineIcd10Mapping
} from "../services/medicalAidRules.js";
import { query } from "../db/pool.js";
import {
  approveExtractedRule,
  createExtractedRuleReview,
  rejectExtractedRule
} from "../services/sourceBackedImports.js";

const router = express.Router();

const riskProfileSchema = z.object({
  medicineName: z.string().trim().min(1),
  aliases: z.array(z.string().trim()).default([]),
  riskCategory: z.enum([
    "pregnancy risk",
    "breastfeeding caution",
    "high-risk medicine",
    "scheduled/controlled medicine",
    "interaction risk",
    "monitoring required",
    "pharmacist review required"
  ]),
  escalationReason: z.string().trim().min(1),
  relatedSafetyTrigger: z.string().trim().min(1),
  activeFlag: z.boolean().optional(),
  sourceReference: z.string().trim().min(1),
  lastReviewedDate: z.string().optional(),
  documentId: z.string().uuid().optional(),
  sourceName: z.string().optional(),
  sourcePageSectionReference: z.string().optional(),
  reviewer: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional()
});

const icd10MasterSchema = z.object({
  code: z.string().trim().min(1),
  description: z.string().trim().min(1),
  categoryChapter: z.string().trim().optional(),
  activeFlag: z.boolean().optional(),
  documentId: z.string().uuid(),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  sourceName: z.string().optional(),
  sourcePageSectionReference: z.string().optional(),
  reviewer: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional()
});

const medicalAidRuleSchema = z.object({
  medicalAidName: z.string().trim().min(1),
  planOption: z.string().trim().optional(),
  icd10Code: z.string().trim().min(1),
  pmbFlag: z.boolean().optional(),
  authorisationRequiredFlag: z.boolean().optional(),
  formularyNotes: z.string().optional(),
  claimNotes: z.string().optional(),
  documentId: z.string().uuid(),
  lastVerifiedDate: z.string().optional(),
  activeFlag: z.boolean().optional(),
  sourceName: z.string().optional(),
  sourcePageSectionReference: z.string().optional(),
  reviewer: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).optional()
});

const medicineIcd10Schema = z.object({
  medicineName: z.string().trim().min(1),
  medicineIdentifier: z.string().trim().optional(),
  icd10Code: z.string().trim().min(1),
  relationshipType: z.string().trim().min(1),
  confidenceScore: z.number().min(0).max(1),
  documentId: z.string().uuid(),
  activeFlag: z.boolean().optional(),
  sourceName: z.string().optional(),
  sourcePageSectionReference: z.string().optional(),
  reviewer: z.string().optional()
});

const extractedRuleSchema = z.object({
  ruleType: z.enum([
    "medicine_risk_profile",
    "allergy_mapping",
    "drug_interaction",
    "icd10_code",
    "medical_aid_rule",
    "medicine_schedule",
    "nappi_mapping",
    "medicine_icd10_mapping"
  ]),
  payload: z.record(z.any()),
  sourceDocumentId: z.string().uuid(),
  sourcePageSectionReference: z.string().optional(),
  confidenceScore: z.number().min(0).max(1).default(0)
});

const reviewDecisionSchema = z.object({
  editedPayload: z.record(z.any()).optional(),
  reason: z.string().optional()
});

router.post("/medicine-risk-profiles", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const input = riskProfileSchema.parse(req.body);
    const profile = await upsertMedicineRiskProfile(input);
    await audit("medicine_risk_profile.upserted", {
      actor: req.actor?.externalId || "admin",
      metadata: { profileId: profile.id, medicineName: profile.medicine_name, riskCategory: profile.risk_category }
    });
    res.status(201).json({ profile });
  } catch (error) {
    next(error);
  }
});

router.post("/extracted-rules", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const input = extractedRuleSchema.parse(req.body);
    const review = await createExtractedRuleReview(input);
    await audit("rules.extracted_for_review", {
      actor: req.actor?.externalId || "admin",
      metadata: { reviewId: review.id, ruleType: review.rule_type, sourceDocumentId: review.source_document_id }
    });
    res.status(201).json({ review });
  } catch (error) {
    next(error);
  }
});

router.get("/extracted-rules", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const status = req.query.status || "pending";
    const result = await query(
      `SELECT *
       FROM extracted_rule_reviews
       WHERE approval_status = $1
       ORDER BY import_date DESC
       LIMIT 200`,
      [status]
    );
    res.json({ reviews: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/extracted-rules/:id/approve", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const input = reviewDecisionSchema.parse(req.body);
    const activated = await approveExtractedRule({
      id: req.params.id,
      reviewer: req.actor?.externalId || "admin",
      editedPayload: input.editedPayload
    });
    await audit("rules.extracted_approved", {
      actor: req.actor?.externalId || "admin",
      metadata: { reviewId: req.params.id, activatedRuleId: activated.id }
    });
    res.json({ activated });
  } catch (error) {
    next(error);
  }
});

router.post("/extracted-rules/:id/reject", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const input = reviewDecisionSchema.parse(req.body);
    await rejectExtractedRule({
      id: req.params.id,
      reviewer: req.actor?.externalId || "admin",
      reason: input.reason
    });
    await audit("rules.extracted_rejected", {
      actor: req.actor?.externalId || "admin",
      metadata: { reviewId: req.params.id, reason: input.reason || "Rejected by reviewer" }
    });
    res.json({ status: "rejected" });
  } catch (error) {
    next(error);
  }
});

router.post("/icd10-master", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const input = icd10MasterSchema.parse(req.body);
    const entry = await upsertIcd10Master(input);
    await audit("icd10.master_upserted", {
      actor: req.actor?.externalId || "admin",
      icd10Lookup: true,
      metadata: { code: entry.code, documentId: entry.document_id, sourceVersion: entry.source_version }
    });
    res.status(201).json({ icd10: entry });
  } catch (error) {
    next(error);
  }
});

router.post("/medical-aid-rules", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const input = medicalAidRuleSchema.parse(req.body);
    const rule = await upsertMedicalAidRule(input);
    await audit("medical_aid_rule.upserted", {
      actor: req.actor?.externalId || "admin",
      medicalAidDisclaimerShown: true,
      metadata: { ruleId: rule.id, medicalAidName: rule.medical_aid_name, icd10Code: rule.icd10_code }
    });
    res.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
});

router.get("/medical-aid-rules", requireAdmin, requirePermission("reports.view"), async (req, res, next) => {
  try {
    const rules = await lookupMedicalAidRules({
      medicalAidName: req.query.medicalAidName,
      icd10Code: req.query.icd10Code
    });
    await audit("medical_aid_rule.lookup", {
      actor: req.actor?.externalId || "admin",
      medicalAidDisclaimerShown: true,
      metadata: { medicalAidName: req.query.medicalAidName || null, icd10Code: req.query.icd10Code || null, results: rules.length }
    });
    res.json({ rules });
  } catch (error) {
    next(error);
  }
});

router.post("/medicine-icd10-mappings", requireAdmin, requirePermission("sources.configure_ingestion"), async (req, res, next) => {
  try {
    const input = medicineIcd10Schema.parse(req.body);
    const mapping = await upsertMedicineIcd10Mapping(input);
    await audit("medicine_icd10_mapping.upserted", {
      actor: req.actor?.externalId || "admin",
      metadata: { mappingId: mapping.id, medicineName: mapping.medicine_name, icd10Code: mapping.icd10_code }
    });
    res.status(201).json({ mapping });
  } catch (error) {
    next(error);
  }
});

export default router;

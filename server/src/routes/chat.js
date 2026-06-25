import express from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { audit } from "../services/audit.js";
import { generateAnswer } from "../services/ollama.js";
import { retrieveContexts, toCitations, topConfidence } from "../services/retrieval.js";
import {
  answerMentionsCitationMetadata,
  buildConflictWarning,
  detectContradictions,
  validateCitationCompleteness
} from "../services/qualityControls.js";
import { classifyQuery } from "../services/queryClassification.js";
import { enqueueReview } from "../services/reviewQueue.js";
import {
  appendClinicalReviewRecommendation,
  detectClinicalEscalation,
  detectHighRiskMedicine
} from "../services/clinicalSafety.js";
import {
  applyRoleSpecificWording,
  detectConsultationTriggers,
  MEDICAL_AID_DISCLAIMER,
  normalizeChatRole
} from "../services/roleSafety.js";
import { formatIcd10Support, isIcd10Query, lookupIcd10 } from "../services/icd10.js";
import { detectEmergencyRedFlags, emergencyRedFlagAnswer } from "../services/emergencyRedFlags.js";
import { findMedicineRiskProfiles, riskProfileCaution } from "../services/medicineRiskProfiles.js";
import { lookupIcd10Master, MEDICAL_AID_CLAIM_DISCLAIMER } from "../services/medicalAidRules.js";
import {
  buildPlausibilityAnswer,
  buildMissingContextAnswer,
  determineRequiredContext,
  validateClinicalPlausibility,
  validatePatientContext
} from "../services/patientContext.js";
import {
  detectAllergyConflicts,
  detectInteractions,
  formatInteractionWarning
} from "../services/allergyInteractionSafety.js";
import { structuredLookup } from "../services/structuredRetrieval.js";
import { query } from "../db/pool.js";
import { requirePermission } from "../middleware/rbac.js";
import { config } from "../config.js";

const router = express.Router();

const chatSchema = z.object({
  message: z.string().trim().min(3).max(1200),
  actor: z.string().trim().max(120).optional(),
  role: z.string().trim().max(80).optional(),
  patientContext: z.object({
    age: z.union([z.number(), z.string()]).optional(),
    weight: z.union([z.number(), z.string()]).optional(),
    gender: z.string().optional(),
    pregnancyStatus: z.string().optional(),
    breastfeedingStatus: z.string().optional(),
    allergies: z.union([z.array(z.string()), z.string()]).optional(),
    chronicConditions: z.union([z.array(z.string()), z.string()]).optional(),
    chronicMedications: z.union([z.array(z.string()), z.string()]).optional(),
    renalImpairment: z.union([z.boolean(), z.string()]).optional(),
    hepaticImpairment: z.union([z.boolean(), z.string()]).optional()
  }).optional(),
  contextBypass: z.boolean().optional()
});

function getCitationIndexes(answer) {
  return [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
}

async function recordAnswerProvenance(answerId, citations, citedIndexes) {
  const cited = [...new Set(citedIndexes)].map((index) => citations[index - 1]).filter(Boolean);
  for (const citation of cited) {
    await query(
      `INSERT INTO answer_source_provenance
       (answer_id, document_id, source_id, document_version, citation_index)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [answerId, citation.documentId, citation.sourceId, citation.version, citation.index]
    );
  }
}

router.post("/", requirePermission("assistant.query"), requirePermission("citations.view"), async (req, res, next) => {
  try {
    const input = chatSchema.parse(req.body);
    const actorId = req.actor?.externalId || input.actor;
    const auditPharmacyId = req.pharmacyId || null;
    const authenticatedRole = req.actor?.chatRole;
    const roleMissing = !input.role && !authenticatedRole;
    const selectedRole = authenticatedRole || normalizeChatRole(input.role);
    const queryClassification = classifyQuery(input.message);
    const contextRequirement = await determineRequiredContext({
      question: input.message,
      queryClassification
    });
    const contextValidation = validatePatientContext(contextRequirement.requiredFields, input.patientContext);
    const escalation = detectClinicalEscalation(input.message);
    const highRisk = detectHighRiskMedicine(input.message);
    const roleSafety = detectConsultationTriggers(input.message, selectedRole);
    const emergency = detectEmergencyRedFlags(input.message);
    const riskProfiles = await findMedicineRiskProfiles(input.message);
    const riskProfileTriggered = riskProfiles.length > 0;
    const riskProfileReasons = riskProfiles.map((profile) => profile.related_safety_trigger || profile.risk_category);
    const riskProfileHighRisk = riskProfiles.some((profile) => profile.risk_category === "high-risk medicine");
    const riskProfileScheduled = riskProfiles.some((profile) => profile.risk_category === "scheduled/controlled medicine");
    const safety = {
      ...escalation,
      ...highRisk,
      ...roleSafety,
      emergencyRedFlag: emergency.emergencyRedFlag,
      emergencyReasons: emergency.emergencyReasons,
      medicineRiskProfiles: riskProfiles,
      medicineRiskProfileTriggered: riskProfileTriggered,
      highRiskMedicine: highRisk.highRiskMedicine || riskProfileHighRisk,
      scheduledMedicineTrigger: roleSafety.scheduledMedicineTrigger || riskProfileScheduled,
      pharmacistConsultationRequired:
        roleSafety.pharmacistConsultationRequired ||
        ((selectedRole === "pharmacy_assistant" || selectedRole === "other") && riskProfileTriggered),
      consultationReasons: [...new Set([...(roleSafety.consultationReasons || []), ...riskProfileReasons])]
    };
    const answerId = crypto.randomUUID();
    if (input.role) {
      await audit("chat.role_selected", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        answerId,
        selectedRole,
        metadata: { suppliedRole: input.role }
      });
    } else {
      await audit("chat.role_defaulted", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        answerId,
        selectedRole,
        metadata: { defaultedTo: "pharmacy_assistant" }
      });
    }
    await audit("chat.query_received", {
      actor: actorId,
      pharmacyId: auditPharmacyId,
      question: input.message,
      answerId,
      queryClassification,
      clinicalEscalation: safety.clinicalEscalation,
      highRiskMedicine: safety.highRiskMedicine,
      selectedRole,
      pharmacistConsultationRequired: safety.pharmacistConsultationRequired,
      scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
      emergencyRedFlag: safety.emergencyRedFlag,
      medicineRiskEscalation: riskProfileTriggered,
      medicalAidDisclaimerShown: true,
      metadata: {
        escalationReasons: safety.escalationReasons,
        highRiskMedicineMatches: safety.highRiskMedicineMatches,
        scheduledMedicineMatches: safety.scheduledMedicineMatches,
        consultationReasons: safety.consultationReasons,
        emergencyReasons: safety.emergencyReasons,
        medicineRiskProfiles: riskProfiles.map((profile) => ({
          medicineName: profile.medicine_name,
          riskCategory: profile.risk_category,
          escalationReason: profile.escalation_reason
        })),
        roleMissing
      }
    });

    if (emergency.emergencyRedFlag) {
      const answer = applyRoleSpecificWording(emergencyRedFlagAnswer(), selectedRole, {
        ...safety,
        clinicalEscalation: true,
        pharmacistConsultationRequired: selectedRole === "pharmacy_assistant" || selectedRole === "other"
      });
      await audit("chat.emergency_red_flag_escalation", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        answerId,
        selectedRole,
        clinicalEscalation: true,
        pharmacistConsultationRequired: selectedRole === "pharmacy_assistant" || selectedRole === "other",
        highRiskMedicine: safety.highRiskMedicine,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        emergencyRedFlag: true,
        medicineRiskEscalation: riskProfileTriggered,
        medicalAidDisclaimerShown: answer.includes(MEDICAL_AID_CLAIM_DISCLAIMER) || answer.includes(MEDICAL_AID_DISCLAIMER),
        metadata: { emergencyReasons: emergency.emergencyReasons }
      });
      await enqueueReview({
        pharmacyId: auditPharmacyId,
        answerId,
        reason: "refused_answer",
        question: input.message,
        answer,
        actor: actorId,
        metadata: { reason: "emergency_red_flag", emergencyReasons: emergency.emergencyReasons }
      });
      return res.json({ answerId, answer, citations: [], emergencyEscalation: true });
    }

    if (riskProfileTriggered) {
      await audit("chat.medicine_risk_escalation", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answerId,
        selectedRole,
        pharmacistConsultationRequired: safety.pharmacistConsultationRequired,
        highRiskMedicine: true,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        medicineRiskEscalation: true,
        metadata: {
          riskProfiles: riskProfiles.map((profile) => ({
            medicineName: profile.medicine_name,
            riskCategory: profile.risk_category,
            escalationReason: profile.escalation_reason,
            relatedSafetyTrigger: profile.related_safety_trigger
          }))
        }
      });
    }

    if (input.contextBypass && !contextValidation.complete) {
      await audit("chat.context_bypass_attempt", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answerId,
        selectedRole,
        queryClassification,
        missingPatientContext: true,
        contextBypassAttempt: true,
        pharmacistConsultationRequired: selectedRole === "pharmacy_assistant" || selectedRole === "other",
        metadata: {
          queryType: contextRequirement.queryType,
          requiredFields: contextRequirement.requiredFields,
          missingFields: contextValidation.missingFields
        }
      });
    }

    if (!contextValidation.complete) {
      const answer = buildMissingContextAnswer(contextValidation.followUpQuestions, selectedRole);
      await audit("chat.missing_patient_context", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        answerId,
        selectedRole,
        queryClassification,
        missingPatientContext: true,
        pharmacistConsultationRequired: selectedRole === "pharmacy_assistant" || selectedRole === "other",
        metadata: {
          queryType: contextRequirement.queryType,
          requiredFields: contextRequirement.requiredFields,
          missingFields: contextValidation.missingFields,
          followUpQuestions: contextValidation.followUpQuestions
        }
      });
      await audit("chat.context_questions_asked", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        answerId,
        selectedRole,
        queryClassification,
        missingPatientContext: true,
        metadata: {
          followUpQuestions: contextValidation.followUpQuestions
        }
      });
      return res.json({
        answerId,
        answer,
        citations: [],
        missingPatientContext: true,
        requiredFields: contextRequirement.requiredFields,
        missingFields: contextValidation.missingFields
      });
    }

    if (contextRequirement.requiredFields.length > 0) {
      await audit("chat.context_completed", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answerId,
        selectedRole,
        queryClassification,
        contextCompleted: true,
        metadata: {
          queryType: contextRequirement.queryType,
          providedFields: contextRequirement.requiredFields
        }
      });
    }

    const plausibility = validateClinicalPlausibility({
      patientContext: input.patientContext,
      question: input.message,
      requiredFields: contextRequirement.requiredFields
    });

    if (!plausibility.plausible) {
      const answer = buildPlausibilityAnswer(plausibility, selectedRole);
      await audit("chat.implausible_patient_context", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        answerId,
        selectedRole,
        queryClassification,
        implausiblePatientContext: plausibility.implausiblePatientContext,
        neonatalHighRisk: plausibility.neonatalHighRisk,
        pharmacistReviewRequired: plausibility.pharmacistReviewRequired,
        pharmacistConsultationRequired: selectedRole === "pharmacy_assistant" || selectedRole === "other",
        metadata: {
          issues: plausibility.issues,
          cautions: plausibility.cautions,
          followUpQuestions: plausibility.followUpQuestions
        }
      });
      if (plausibility.neonatalHighRisk) {
        await audit("chat.neonatal_high_risk", {
          actor: actorId,
          pharmacyId: auditPharmacyId,
          question: input.message,
          answer,
          answerId,
          selectedRole,
          neonatalHighRisk: true,
          pharmacistReviewRequired: true,
          metadata: { cautions: plausibility.cautions }
        });
      }
      return res.json({
        answerId,
        answer,
        citations: [],
        implausiblePatientContext: plausibility.implausiblePatientContext,
        neonatalHighRisk: plausibility.neonatalHighRisk,
        pharmacistReviewRequired: plausibility.pharmacistReviewRequired,
        issues: plausibility.issues,
        followUpQuestions: plausibility.followUpQuestions
      });
    }

    const allergySafety = await detectAllergyConflicts({
      question: input.message,
      patientContext: input.patientContext || {}
    });

    if (allergySafety.blocked) {
      const answer = [
        "Potential allergy conflict detected.",
        ...(selectedRole === "pharmacy_assistant" || selectedRole === "other"
          ? ["Pharmacist review required before dispensing."]
          : ["Pharmacist review required before proceeding."])
      ].join("\n");
      await audit("chat.allergy_conflict_blocked", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        answerId,
        selectedRole,
        allergyConflict: true,
        pharmacistReviewRequired: true,
        pharmacistConsultationRequired: selectedRole === "pharmacy_assistant" || selectedRole === "other",
        blockedRecommendation: true,
        metadata: { conflicts: allergySafety.conflicts }
      });
      return res.json({
        answerId,
        answer,
        citations: allergySafety.conflicts.map((conflict, index) => ({
          index: index + 1,
          sourceName: conflict.source_name || "Seed/demo rule - not production verified",
          sourceVersion: conflict.source_version,
          sourceDocumentId: conflict.source_document_id,
          sourceReference: conflict.source_page_section_reference || conflict.source_reference,
          approvalStatus: conflict.approval_status,
          ruleOrigin: conflict.rule_origin
        })),
        allergyConflict: true,
        blockedRecommendation: true
      });
    }

    const interactionSafety = await detectInteractions({
      question: input.message,
      patientContext: input.patientContext || {}
    });

    if (interactionSafety.contraindicated) {
      const answer = [
        "Potentially unsafe medicine combination detected.",
        ...(selectedRole === "pharmacy_assistant" || selectedRole === "other"
          ? ["Pharmacist review required."]
          : ["Pharmacist review required before proceeding."]),
        formatInteractionWarning(interactionSafety.interactions)
      ].join("\n");
      await audit("chat.contraindicated_interaction_blocked", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        answerId,
        selectedRole,
        interactionDetected: true,
        contraindicatedInteraction: true,
        pharmacistReviewRequired: true,
        pharmacistConsultationRequired: selectedRole === "pharmacy_assistant" || selectedRole === "other",
        blockedRecommendation: true,
        metadata: { interactions: interactionSafety.interactions }
      });
      return res.json({
        answerId,
        answer,
        citations: interactionSafety.interactions.map((interaction, index) => ({
          index: index + 1,
          sourceName: interaction.source_name || "Seed/demo rule - not production verified",
          sourceVersion: interaction.source_version,
          sourceDocumentId: interaction.source_document_id,
          sourceReference: interaction.source_page_section_reference,
          approvalStatus: interaction.approval_status,
          ruleOrigin: interaction.rule_origin
        })),
        interactionDetected: true,
        contraindicatedInteraction: true,
        blockedRecommendation: true
      });
    }

    if (interactionSafety.interactions.length > 0) {
      await audit("chat.interaction_detected", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answerId,
        selectedRole,
        interactionDetected: true,
        pharmacistReviewRequired: interactionSafety.major,
        pharmacistConsultationRequired: (selectedRole === "pharmacy_assistant" || selectedRole === "other") && (interactionSafety.major || interactionSafety.moderate),
        metadata: { interactions: interactionSafety.interactions }
      });
    }

    if (safety.pharmacistConsultationRequired) {
      await audit("chat.pharmacist_consultation_triggered", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answerId,
        selectedRole,
        pharmacistConsultationRequired: true,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        highRiskMedicine: safety.highRiskMedicine,
        medicalAidDisclaimerShown: true,
        metadata: {
          consultationReasons: safety.consultationReasons,
          scheduledMedicineMatches: safety.scheduledMedicineMatches,
          highRiskMedicineMatches: safety.highRiskMedicineMatches
        }
      });
    }

    if (safety.scheduledMedicineTrigger) {
      await audit("chat.scheduled_medicine_triggered", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answerId,
        selectedRole,
        pharmacistConsultationRequired: safety.pharmacistConsultationRequired,
        scheduledMedicineTrigger: true,
        medicalAidDisclaimerShown: true,
        metadata: {
          scheduledMedicineMatches: safety.scheduledMedicineMatches
        }
      });
    }

    let icd10 = null;
    if (isIcd10Query(input.message)) {
      icd10 = await lookupIcd10(input.message);
      const masterMatches = await lookupIcd10Master(input.message);
      if (masterMatches.length > 0) {
        icd10.matches = [...icd10.matches, ...masterMatches.map((match) => ({
          code: match.code,
          description: match.description,
          document_id: match.document_id,
          source_id: match.source_id,
          source_version: match.source_version,
          approval_status: "approved",
          effective_date: match.effective_date,
          expiry_date: match.expiry_date,
          confidence: match.confidence
        }))];
        icd10.confidence = Math.max(icd10.confidence, Number(masterMatches[0].confidence || 0));
        icd10.lowConfidence = icd10.matches.length === 0 || icd10.confidence < config.icd10MinConfidence;
      }
      await audit("chat.icd10_lookup", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answerId,
        selectedRole,
        icd10Lookup: true,
        icd10Uncertainty: icd10.lowConfidence,
        pharmacistConsultationRequired: safety.pharmacistConsultationRequired || icd10.lowConfidence,
        medicalAidDisclaimerShown: true,
        metadata: {
          confidence: icd10.confidence,
          matches: icd10.matches.map((match) => ({
            code: match.code,
            documentId: match.document_id,
            sourceVersion: match.source_version,
            approvalStatus: match.approval_status
          }))
        }
      });
      if (icd10.lowConfidence) {
        await audit("chat.icd10_uncertainty", {
          actor: actorId,
          pharmacyId: auditPharmacyId,
          question: input.message,
          answerId,
          selectedRole,
          pharmacistConsultationRequired: true,
          icd10Lookup: true,
          icd10Uncertainty: true,
          medicalAidDisclaimerShown: true,
          metadata: { confidence: icd10.confidence }
        });
      }
    }

    const approved = await query(
      `SELECT
         count(*) FILTER (WHERE status = 'approved' AND active_flag = true AND (expiry_date IS NULL OR expiry_date > now()))::int AS usable_count,
         count(*) FILTER (WHERE status = 'approved' AND active_flag = true AND expiry_date <= now())::int AS expired_count
       FROM documents`
    );
    const expiredSourceAttempt = approved.rows[0].usable_count === 0 && approved.rows[0].expired_count > 0;
    if (approved.rows[0].usable_count === 0) {
      const baseAnswer = expiredSourceAttempt
        ? "I cannot answer because available approved sources are expired and cannot be cited. Clinical review recommended."
        : "I cannot answer yet because no approved medical sources are available. Please ask an administrator to approve verified South African medical sources first.";
      const answer = applyRoleSpecificWording(appendClinicalReviewRecommendation(baseAnswer, safety), selectedRole, safety);
      await audit("chat.refused_no_approved_sources", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        citations: [],
        answerId,
        queryClassification,
        retrievalConfidence: 0,
        clinicalEscalation: safety.clinicalEscalation,
        highRiskMedicine: safety.highRiskMedicine,
        expiredSourceAttempt,
        selectedRole,
        pharmacistConsultationRequired: safety.pharmacistConsultationRequired,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        emergencyRedFlag: safety.emergencyRedFlag,
        medicineRiskEscalation: riskProfileTriggered,
        medicalAidDisclaimerShown: true,
        metadata: {
          escalationReasons: safety.escalationReasons,
          highRiskMedicineMatches: safety.highRiskMedicineMatches,
          scheduledMedicineMatches: safety.scheduledMedicineMatches,
          consultationReasons: safety.consultationReasons
        }
      });
      await enqueueReview({
        pharmacyId: auditPharmacyId,
        answerId,
        reason: "refused_answer",
        question: input.message,
        answer,
        actor: actorId,
        metadata: { queryClassification, retrievalConfidence: 0, expiredSourceAttempt, ...safety }
      });
      return res.json({ answerId, answer, citations: [] });
    }

    if (icd10?.lowConfidence) {
      const icd10Safety = {
        ...safety,
        pharmacistConsultationRequired: true,
        consultationReasons: [...new Set([...(safety.consultationReasons || []), "icd10_uncertainty"])]
      };
      const answer = applyRoleSpecificWording(formatIcd10Support(icd10), selectedRole, icd10Safety);
      await audit("chat.refused_icd10_uncertainty", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        citations: [],
        answerId,
        queryClassification,
        retrievalConfidence: icd10.confidence,
        selectedRole,
        pharmacistConsultationRequired: true,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        highRiskMedicine: safety.highRiskMedicine,
        icd10Lookup: true,
        icd10Uncertainty: true,
        medicalAidDisclaimerShown: answer.includes(MEDICAL_AID_DISCLAIMER),
        metadata: {
          consultationReasons: icd10Safety.consultationReasons,
          icd10Matches: icd10.matches.map((match) => ({
            code: match.code,
            documentId: match.document_id,
            sourceVersion: match.source_version,
            approvalStatus: match.approval_status
          }))
        }
      });
      await enqueueReview({
        pharmacyId: auditPharmacyId,
        answerId,
        reason: "refused_answer",
        question: input.message,
        answer,
        actor: actorId,
        metadata: { queryClassification, reason: "icd10_uncertainty", icd10Confidence: icd10.confidence }
      });
      return res.json({ answerId, answer, citations: [] });
    }

    const contexts = await retrieveContexts(input.message);
    const structuredRows = await structuredLookup(input.message);
    const structuredContexts = structuredRows.map((row) => ({
      id: row.id,
      content: row.source_text || `${row.entity_type}: ${row.entity_value}`,
      citation_label: `${row.title}, ${row.section_heading || "structured entity"}, page ${row.page_number || "n/a"}`,
      document_id: row.document_id,
      source_id: row.source_id,
      version: row.version,
      title: row.title,
      source_url: row.source_url,
      authority: row.source_organization,
      active_flag: row.active_flag,
      status: row.status,
      approval_date: row.approval_date,
      relevance: row.confidence_score
    }));
    const allContexts = [...structuredContexts, ...contexts];
    const citations = toCitations(allContexts);
    const confidence = topConfidence(allContexts);

    if (allContexts.length === 0) {
      const answer = applyRoleSpecificWording(appendClinicalReviewRecommendation(
        `I do not have an approved source with enough citation confidence to answer that question. Minimum confidence is ${config.minCitationConfidence}.`,
        safety
      ), selectedRole, safety);
      await audit("chat.refused_no_citation", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        citations,
        answerId,
        queryClassification,
        retrievalConfidence: confidence,
        clinicalEscalation: safety.clinicalEscalation,
        highRiskMedicine: safety.highRiskMedicine,
        selectedRole,
        pharmacistConsultationRequired: safety.pharmacistConsultationRequired,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        emergencyRedFlag: safety.emergencyRedFlag,
        medicineRiskEscalation: riskProfileTriggered,
        medicalAidDisclaimerShown: true,
        metadata: { confidence, minCitationConfidence: config.minCitationConfidence }
      });
      await enqueueReview({
        pharmacyId: auditPharmacyId,
        answerId,
        reason: "refused_answer",
        question: input.message,
        answer,
        actor: actorId,
        metadata: { queryClassification, retrievalConfidence: confidence, minCitationConfidence: config.minCitationConfidence, ...safety }
      });
      return res.json({ answerId, answer, citations: [] });
    }

    if (!validateCitationCompleteness(citations)) {
      const answer = applyRoleSpecificWording(appendClinicalReviewRecommendation(
        "I found retrieval results, but the citations were incomplete or not active approved sources. I cannot answer safely.",
        safety
      ), selectedRole, safety);
      await audit("chat.refused_incomplete_citations", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        citations: [],
        answerId,
        queryClassification,
        retrievalConfidence: confidence,
        clinicalEscalation: safety.clinicalEscalation,
        highRiskMedicine: safety.highRiskMedicine,
        selectedRole,
        pharmacistConsultationRequired: safety.pharmacistConsultationRequired,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        emergencyRedFlag: safety.emergencyRedFlag,
        medicineRiskEscalation: riskProfileTriggered,
        medicalAidDisclaimerShown: true,
        metadata: { confidence, minCitationConfidence: config.minCitationConfidence }
      });
      await enqueueReview({
        pharmacyId: auditPharmacyId,
        answerId,
        reason: "refused_answer",
        question: input.message,
        answer,
        actor: actorId,
        metadata: { queryClassification, retrievalConfidence: confidence, reason: "incomplete_citations", ...safety }
      });
      return res.json({ answerId, answer, citations: [] });
    }

    const contradiction = detectContradictions(allContexts);
    if (contradiction.hasConflict) {
      const answer = applyRoleSpecificWording(appendClinicalReviewRecommendation(buildConflictWarning(contradiction.conflicts), safety), selectedRole, safety);
      await audit("chat.refused_conflicting_sources", {
        actor: actorId,
        pharmacyId: auditPharmacyId,
        question: input.message,
        answer,
        citations,
        answerId,
        queryClassification,
        retrievalConfidence: confidence,
        clinicalEscalation: safety.clinicalEscalation,
        highRiskMedicine: safety.highRiskMedicine,
        selectedRole,
        pharmacistConsultationRequired: safety.pharmacistConsultationRequired,
        scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
        emergencyRedFlag: safety.emergencyRedFlag,
        medicineRiskEscalation: riskProfileTriggered,
        medicalAidDisclaimerShown: true,
        metadata: {
          confidence,
          escalationReasons: safety.escalationReasons,
          highRiskMedicineMatches: safety.highRiskMedicineMatches,
          conflicts: contradiction.conflicts.map((conflict) => ({
            leftDocumentId: conflict.left.document_id,
            leftVersion: conflict.left.version,
            rightDocumentId: conflict.right.document_id,
            rightVersion: conflict.right.version
          }))
        }
      });
      await enqueueReview({
        pharmacyId: auditPharmacyId,
        answerId,
        reason: "conflicting_sources",
        question: input.message,
        answer,
        actor: actorId,
        metadata: { queryClassification, retrievalConfidence: confidence, ...safety }
      });
      return res.json({ answerId, answer, citations });
    }

    const answer = await generateAnswer({ question: input.message, contexts: allContexts });
    const citationIndexes = getCitationIndexes(answer);
    const citationsAreValid =
      citationIndexes.length > 0 &&
      citationIndexes.every((index) => Number.isInteger(index) && index >= 1 && index <= citations.length);
    const metadataIsComplete = citationsAreValid && answerMentionsCitationMetadata(answer, citations, citationIndexes);
    const icd10Text = icd10 ? `\n\n${formatIcd10Support(icd10)}` : "";
    const riskText = riskProfileTriggered ? `\n\n${riskProfileCaution(riskProfiles)}` : "";
    const interactionText = interactionSafety.major
      ? `\n\nWarning: major interaction detected.\n${formatInteractionWarning(interactionSafety.interactions)}`
      : interactionSafety.moderate
        ? `\n\nCaution: moderate interaction detected.\n${formatInteractionWarning(interactionSafety.interactions)}`
        : "";
    const safeAnswer = citationsAreValid && metadataIsComplete
      ? `${answer}${icd10Text}${riskText}${interactionText}`
      : "I found potentially relevant sources, but I could not produce an answer with complete citation metadata. Please rephrase or ask an administrator to review the source documents.";
    const icd10Safety = icd10?.lowConfidence
      ? { ...safety, pharmacistConsultationRequired: true, consultationReasons: [...(safety.consultationReasons || []), "icd10_uncertainty"] }
      : safety;
    const finalAnswer = applyRoleSpecificWording(appendClinicalReviewRecommendation(safeAnswer, icd10Safety), selectedRole, icd10Safety);

    await audit(citationsAreValid && metadataIsComplete ? "chat.answered" : "chat.refused_incomplete_citation_metadata", {
      actor: actorId,
      pharmacyId: auditPharmacyId,
      question: input.message,
      answer: finalAnswer,
      citations: citationsAreValid && metadataIsComplete ? citations : [],
      answerId,
      queryClassification,
      retrievalConfidence: confidence,
      clinicalEscalation: safety.clinicalEscalation,
      highRiskMedicine: safety.highRiskMedicine,
      selectedRole,
      pharmacistConsultationRequired: icd10Safety.pharmacistConsultationRequired,
      scheduledMedicineTrigger: safety.scheduledMedicineTrigger,
      emergencyRedFlag: safety.emergencyRedFlag,
      medicineRiskEscalation: riskProfileTriggered,
      icd10Lookup: Boolean(icd10),
      icd10Uncertainty: Boolean(icd10?.lowConfidence),
      medicalAidDisclaimerShown: finalAnswer.includes(MEDICAL_AID_DISCLAIMER),
      metadata: {
        confidence,
        minCitationConfidence: config.minCitationConfidence,
        metadataIsComplete,
        escalationReasons: safety.escalationReasons,
        highRiskMedicineMatches: safety.highRiskMedicineMatches,
        scheduledMedicineMatches: safety.scheduledMedicineMatches,
        consultationReasons: icd10Safety.consultationReasons,
        icd10Confidence: icd10?.confidence
      }
    });

    if (!(citationsAreValid && metadataIsComplete)) {
      await enqueueReview({
        pharmacyId: auditPharmacyId,
        answerId,
        reason: "refused_answer",
        question: input.message,
        answer: finalAnswer,
        actor: actorId,
        metadata: { queryClassification, retrievalConfidence: confidence, reason: "incomplete_citation_metadata", ...safety }
      });
    }

    if (citationsAreValid && metadataIsComplete) {
      await recordAnswerProvenance(answerId, citations, citationIndexes);
    }

    res.json({ answerId, answer: finalAnswer, citations: citationsAreValid && metadataIsComplete ? citations : [] });
  } catch (error) {
    next(error);
  }
});

export default router;

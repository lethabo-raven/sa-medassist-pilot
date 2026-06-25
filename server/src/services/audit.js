import { query } from "../db/pool.js";

export async function audit(
  eventType,
  {
    actor = "anonymous",
    pharmacyId = null,
    question = null,
    answer = null,
    citations = [],
    metadata = {},
    answerId = null,
    queryClassification = null,
    retrievalConfidence = null,
    clinicalEscalation = false,
    highRiskMedicine = false,
    expiredSourceAttempt = false,
    selectedRole = null,
    pharmacistConsultationRequired = false,
    scheduledMedicineTrigger = false,
    icd10Lookup = false,
    icd10Uncertainty = false,
    medicalAidDisclaimerShown = false,
    emergencyRedFlag = false,
    medicineRiskEscalation = false,
    missingPatientContext = false,
    contextCompleted = false,
    contextBypassAttempt = false,
    implausiblePatientContext = false,
    neonatalHighRisk = false,
    pharmacistReviewRequired = false,
    allergyConflict = false,
    interactionDetected = false,
    contraindicatedInteraction = false,
    blockedRecommendation = false
  } = {}
) {
  const result = await query(
    `INSERT INTO audit_logs
       (pharmacy_id, event_type, actor, question, answer, citations, metadata, answer_id, query_classification,
        retrieval_confidence, clinical_escalation, high_risk_medicine, expired_source_attempt,
        selected_role, pharmacist_consultation_required, scheduled_medicine_trigger, icd10_lookup,
        icd10_uncertainty, medical_aid_disclaimer_shown, emergency_red_flag, medicine_risk_escalation,
        missing_patient_context, context_completed, context_bypass_attempt,
        implausible_patient_context, neonatal_high_risk, pharmacist_review_required,
        allergy_conflict, interaction_detected, contraindicated_interaction, blocked_recommendation)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
     RETURNING id`,
    [
      pharmacyId,
      eventType,
      actor,
      question,
      answer,
      JSON.stringify(citations),
      JSON.stringify(metadata),
      answerId,
      queryClassification,
      retrievalConfidence,
      clinicalEscalation,
      highRiskMedicine,
      expiredSourceAttempt,
      selectedRole,
      pharmacistConsultationRequired,
      scheduledMedicineTrigger,
      icd10Lookup,
      icd10Uncertainty,
      medicalAidDisclaimerShown,
      emergencyRedFlag,
      medicineRiskEscalation,
      missingPatientContext,
      contextCompleted,
      contextBypassAttempt,
      implausiblePatientContext,
      neonatalHighRisk,
      pharmacistReviewRequired,
      allergyConflict,
      interactionDetected,
      contraindicatedInteraction,
      blockedRecommendation
    ]
  );
  return result.rows[0];
}

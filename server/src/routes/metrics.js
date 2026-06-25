import express from "express";
import { query } from "../db/pool.js";
import { requireAdmin } from "../middleware/admin.js";
import { requirePermission } from "../middleware/rbac.js";

const router = express.Router();

const medicineTerms = [
  "paracetamol",
  "ibuprofen",
  "amoxicillin",
  "azithromycin",
  "metformin",
  "insulin",
  "amlodipine",
  "warfarin",
  "aspirin",
  "prednisone",
  "salbutamol",
  "atorvastatin",
  "omeprazole",
  "fluconazole",
  "doxycycline"
];

function countMedicineMentions(questions) {
  const counts = new Map();
  for (const question of questions) {
    const text = String(question || "").toLowerCase();
    for (const term of medicineTerms) {
      if (text.includes(term)) {
        counts.set(term, (counts.get(term) || 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([medicine, count]) => ({ medicine, count }));
}

router.get("/", requireAdmin, requirePermission("reports.view"), async (req, res, next) => {
  try {
    const pharmacyId = req.actor?.permissions?.has("*") ? null : req.pharmacyId;
    const summary = await query(
      `SELECT
         count(*) FILTER (WHERE event_type LIKE 'chat.%')::int AS questions_asked,
         count(*) FILTER (WHERE event_type = 'chat.query_received' AND created_at::date = current_date)::int AS questions_today,
         count(*) FILTER (WHERE event_type LIKE 'chat.refused%')::int AS refused_questions,
         count(DISTINCT actor) FILTER (WHERE event_type LIKE 'chat.%')::int AS active_users
       FROM audit_logs
       WHERE ($1::uuid IS NULL OR pharmacy_id = $1)`,
      [pharmacyId]
    );

    const daily = await query(
      `SELECT date_trunc('day', created_at)::date AS day,
              count(*) FILTER (WHERE event_type LIKE 'chat.%')::int AS questions,
              count(*) FILTER (WHERE event_type LIKE 'chat.refused%')::int AS refusals
       FROM audit_logs
       WHERE created_at >= now() - interval '30 days'
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       GROUP BY day
       ORDER BY day`,
      [pharmacyId]
    );

    const referenced = await query(
      `SELECT citation->>'title' AS title,
              citation->>'sourceUrl' AS source_url,
              count(*)::int AS references
       FROM audit_logs,
            jsonb_array_elements(citations) AS citation
       WHERE event_type = 'chat.answered'
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       GROUP BY title, source_url
       ORDER BY references DESC, title
       LIMIT 10`,
      [pharmacyId]
    );

    const questionRows = await query(
      `SELECT question
       FROM audit_logs
       WHERE event_type LIKE 'chat.%' AND question IS NOT NULL
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       ORDER BY created_at DESC
       LIMIT 1000`,
      [pharmacyId]
    );

    res.json({
      summary: summary.rows[0],
      dailyUsage: daily.rows,
      mostReferencedDocuments: referenced.rows,
      mostSearchedMedicines: countMedicineMentions(questionRows.rows.map((row) => row.question))
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", requireAdmin, requirePermission("reports.view"), async (req, res, next) => {
  try {
    const pharmacyId = req.actor?.permissions?.has("*") ? null : req.pharmacyId;
    const summary = await query(
      `SELECT
         count(*) FILTER (WHERE event_type = 'chat.query_received')::int AS total_questions,
         count(*) FILTER (WHERE event_type = 'chat.query_received' AND created_at::date = current_date)::int AS questions_today,
         count(*) FILTER (WHERE event_type LIKE 'chat.refused%')::int AS refused_questions,
         count(DISTINCT actor) FILTER (WHERE event_type = 'chat.query_received')::int AS active_users
       FROM audit_logs`
       + ` WHERE ($1::uuid IS NULL OR pharmacy_id = $1)`,
      [pharmacyId]
    );

    const questionRows = await query(
      `SELECT question
       FROM audit_logs
       WHERE event_type = 'chat.query_received' AND question IS NOT NULL
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       ORDER BY created_at DESC
       LIMIT 1000`,
      [pharmacyId]
    );

    const referenced = await query(
      `SELECT citation->>'title' AS title,
              citation->>'sourceUrl' AS source_url,
              count(*)::int AS references
       FROM audit_logs,
            jsonb_array_elements(citations) AS citation
       WHERE event_type = 'chat.answered'
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       GROUP BY title, source_url
       ORDER BY references DESC, title
       LIMIT 10`,
      [pharmacyId]
    );

    res.json({
      summary: summary.rows[0],
      mostSearchedMedicines: countMedicineMentions(questionRows.rows.map((row) => row.question)),
      mostReferencedDocuments: referenced.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/analytics", requireAdmin, requirePermission("reports.view"), async (req, res, next) => {
  try {
    const pharmacyId = req.actor?.permissions?.has("*") ? null : req.pharmacyId;
    const questions = await query(
      `SELECT question
       FROM audit_logs
       WHERE event_type = 'chat.query_received' AND question IS NOT NULL
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       ORDER BY created_at DESC
       LIMIT 2000`,
      [pharmacyId]
    );

    const failedSearches = await query(
      `SELECT question, count(*)::int AS failures
       FROM audit_logs
       WHERE event_type LIKE 'chat.refused%' AND question IS NOT NULL
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       GROUP BY question
       ORDER BY failures DESC, question
       LIMIT 20`,
      [pharmacyId]
    );

    const citedSources = await query(
      `SELECT citation->>'title' AS title,
              citation->>'sourceUrl' AS source_url,
              count(*)::int AS citations
       FROM audit_logs,
            jsonb_array_elements(citations) AS citation
       WHERE event_type = 'chat.answered'
         AND ($1::uuid IS NULL OR pharmacy_id = $1)
       GROUP BY title, source_url
       ORDER BY citations DESC, title
       LIMIT 20`,
      [pharmacyId]
    );

    const confidenceDistribution = await query(
      `SELECT bucket,
              count(*)::int AS count
       FROM (
         SELECT width_bucket(retrieval_confidence, 0, 1, 10) AS bucket
         FROM audit_logs
         WHERE retrieval_confidence IS NOT NULL
       ) confidence_values
       GROUP BY bucket
       ORDER BY bucket`
    );

    const classifications = await query(
      `SELECT query_classification, count(*)::int AS count
       FROM audit_logs
       WHERE event_type = 'chat.query_received'
       GROUP BY query_classification
       ORDER BY count DESC`
    );

    const safety = await query(
      `SELECT
         count(*) FILTER (WHERE clinical_escalation = true)::int AS escalated_answers,
         count(*) FILTER (WHERE event_type LIKE 'chat.refused%')::int AS refused_answers,
         count(*) FILTER (WHERE expired_source_attempt = true)::int AS expired_source_attempts,
         count(*) FILTER (WHERE high_risk_medicine = true)::int AS high_risk_medicine_queries,
         count(*) FILTER (WHERE pharmacist_consultation_required = true)::int AS pharmacist_consultation_required,
         count(*) FILTER (WHERE scheduled_medicine_trigger = true)::int AS scheduled_medicine_triggers,
         count(*) FILTER (WHERE icd10_lookup = true)::int AS icd10_lookups,
         count(*) FILTER (WHERE icd10_uncertainty = true)::int AS icd10_uncertainty,
         count(*) FILTER (WHERE medical_aid_disclaimer_shown = true)::int AS medical_aid_disclaimer_shown,
         count(*) FILTER (WHERE emergency_red_flag = true)::int AS emergency_red_flags,
         count(*) FILTER (WHERE medicine_risk_escalation = true)::int AS medicine_risk_escalations,
         count(*) FILTER (WHERE allergy_conflict = true)::int AS allergy_conflicts,
         count(*) FILTER (WHERE interaction_detected = true)::int AS interaction_detections,
         count(*) FILTER (WHERE contraindicated_interaction = true)::int AS contraindicated_attempts,
         count(*) FILTER (WHERE pharmacist_review_required = true OR pharmacist_consultation_required = true)::int AS pharmacist_escalations
       FROM audit_logs
       WHERE event_type LIKE 'chat.%'`
    );

    res.json({
      topMedicinesSearched: countMedicineMentions(questions.rows.map((row) => row.question)),
      topFailedSearches: failedSearches.rows,
      topCitedSources: citedSources.rows,
      retrievalConfidenceDistribution: confidenceDistribution.rows,
      queryClassifications: classifications.rows,
      safety: safety.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

router.get("/safety", requireAdmin, requirePermission("reports.view"), async (req, res, next) => {
  try {
    const summary = await query(
      `SELECT
         count(*) FILTER (WHERE clinical_escalation = true)::int AS escalated_answers,
         count(*) FILTER (WHERE event_type LIKE 'chat.refused%')::int AS refused_answers,
         count(*) FILTER (WHERE expired_source_attempt = true)::int AS expired_source_attempts,
         count(*) FILTER (WHERE high_risk_medicine = true)::int AS high_risk_medicine_queries,
         count(*) FILTER (WHERE pharmacist_consultation_required = true)::int AS pharmacist_consultation_required,
         count(*) FILTER (WHERE scheduled_medicine_trigger = true)::int AS scheduled_medicine_triggers,
         count(*) FILTER (WHERE icd10_lookup = true)::int AS icd10_lookups,
         count(*) FILTER (WHERE icd10_uncertainty = true)::int AS icd10_uncertainty,
         count(*) FILTER (WHERE medical_aid_disclaimer_shown = true)::int AS medical_aid_disclaimer_shown,
         count(*) FILTER (WHERE emergency_red_flag = true)::int AS emergency_red_flags,
         count(*) FILTER (WHERE medicine_risk_escalation = true)::int AS medicine_risk_escalations,
         count(*) FILTER (WHERE allergy_conflict = true)::int AS allergy_conflicts,
         count(*) FILTER (WHERE interaction_detected = true)::int AS interaction_detections,
         count(*) FILTER (WHERE contraindicated_interaction = true)::int AS contraindicated_attempts,
         count(*) FILTER (WHERE pharmacist_review_required = true OR pharmacist_consultation_required = true)::int AS pharmacist_escalations
       FROM audit_logs
       WHERE event_type LIKE 'chat.%'`
    );

    const recent = await query(
      `SELECT answer_id, actor, question, event_type, clinical_escalation,
              high_risk_medicine, expired_source_attempt, metadata, created_at
       FROM audit_logs
       WHERE clinical_escalation = true
          OR high_risk_medicine = true
          OR expired_source_attempt = true
          OR pharmacist_consultation_required = true
          OR scheduled_medicine_trigger = true
          OR icd10_uncertainty = true
          OR emergency_red_flag = true
          OR medicine_risk_escalation = true
          OR allergy_conflict = true
          OR interaction_detected = true
          OR contraindicated_interaction = true
          OR event_type LIKE 'chat.refused%'
       ORDER BY created_at DESC
       LIMIT 100`
    );

    res.json({ summary: summary.rows[0], recent: recent.rows });
  } catch (error) {
    next(error);
  }
});

export default router;

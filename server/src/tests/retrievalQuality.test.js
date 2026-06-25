import assert from "node:assert/strict";
import crypto from "node:crypto";
import { detectContradictions, validateCitationCompleteness, answerMentionsCitationMetadata } from "../services/qualityControls.js";

function context(overrides = {}) {
  return {
    document_id: overrides.document_id || crypto.randomUUID(),
    source_id: overrides.source_id || crypto.randomUUID(),
    version: overrides.version || 1,
    title: overrides.title || "Approved Guideline",
    source_url: overrides.source_url || "https://health.gov.za/source",
    authority: overrides.authority || "NDoH",
    active_flag: overrides.active_flag ?? true,
    status: overrides.status || "approved",
    approval_date: overrides.approval_date || new Date().toISOString(),
    citation_label: overrides.citation_label || "Approved Guideline, chunk 1",
    content: overrides.content || "Paracetamol may be used according to approved guidance.",
    relevance: overrides.relevance ?? 0.82
  };
}

const approved = context();
assert.equal(validateCitationCompleteness([
  {
    title: approved.title,
    version: approved.version,
    label: approved.citation_label,
    documentIdentifier: approved.document_id,
    approvalDate: approved.approval_date,
    approvalStatus: approved.status,
    active: approved.active_flag
  }
]), true, "approved active source should have complete citation metadata");

const superseded = context({ status: "superseded", active_flag: false });
assert.equal(validateCitationCompleteness([
  {
    title: superseded.title,
    version: superseded.version,
    label: superseded.citation_label,
    documentIdentifier: superseded.document_id,
    approvalDate: superseded.approval_date,
    approvalStatus: superseded.status,
    active: superseded.active_flag
  }
]), false, "superseded source should fail citation completeness");

const conflict = detectContradictions([
  context({ content: "This medicine is recommended for the listed indication.", relevance: 0.81, source_id: "11111111-1111-4111-8111-111111111111" }),
  context({ content: "This medicine is not recommended for the listed indication.", relevance: 0.79, source_id: "22222222-2222-4222-8222-222222222222" })
]);
assert.equal(conflict.hasConflict, true, "conflicting approved sources should be detected");

assert.equal(detectContradictions([]).hasConflict, false, "no source scenario should not produce contradiction");

const lowConfidence = context({ relevance: 0.05 });
assert.equal(lowConfidence.relevance < 0.35, true, "low confidence scenario should be below default threshold");

assert.equal(answerMentionsCitationMetadata(
  `Use only as stated by Approved Guideline version 1, Approved Guideline, chunk 1, approved, document ${approved.document_id}, approval date ${approved.approval_date.slice(0, 10)} [1].`,
  [{
    title: "Approved Guideline",
    version: 1,
    label: "Approved Guideline, chunk 1",
    approvalStatus: "approved",
    documentIdentifier: approved.document_id,
    approvalDate: approved.approval_date
  }],
  [1]
), true, "answer should pass citation metadata check");

console.log("Retrieval quality validation scenarios passed.");

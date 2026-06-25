import assert from "node:assert/strict";
import {
  appendClinicalReviewRecommendation,
  detectClinicalEscalation,
  detectHighRiskMedicine
} from "../services/clinicalSafety.js";
import { validateCitationCompleteness } from "../services/qualityControls.js";

const escalation = detectClinicalEscalation("Patient is pregnant and asks about overdose symptoms.");
assert.equal(escalation.clinicalEscalation, true, "pregnancy and overdose should trigger escalation");
assert.ok(escalation.escalationReasons.includes("pregnancy"));
assert.ok(escalation.escalationReasons.includes("overdose"));

const highRisk = detectHighRiskMedicine("Can I take warfarin with this medicine?");
assert.equal(highRisk.highRiskMedicine, true, "warfarin should be high risk");

const answer = appendClinicalReviewRecommendation("Use cited information only.", {
  clinicalEscalation: true,
  highRiskMedicine: false
});
assert.ok(answer.includes("Clinical review recommended."));

assert.equal(validateCitationCompleteness([
  {
    title: "Guideline",
    version: 2,
    label: "Guideline, chunk 1",
    documentIdentifier: "11111111-1111-4111-8111-111111111111",
    approvalDate: new Date().toISOString(),
    approvalStatus: "approved",
    active: true,
    expiryDate: new Date(Date.now() + 86_400_000).toISOString()
  }
]), true, "active non-expired approved citation should pass");

assert.equal(validateCitationCompleteness([
  {
    title: "Guideline",
    version: 2,
    label: "Guideline, chunk 1",
    documentIdentifier: "11111111-1111-4111-8111-111111111111",
    approvalDate: new Date().toISOString(),
    approvalStatus: "approved",
    active: true,
    expiryDate: new Date(Date.now() - 86_400_000).toISOString()
  }
]), false, "expired citation should fail");

console.log("Clinical safety validation scenarios passed.");

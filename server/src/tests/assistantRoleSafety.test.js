import assert from "node:assert/strict";
import {
  applyRoleSpecificWording,
  detectConsultationTriggers,
  detectScheduledMedicine,
  normalizeChatRole,
  PHARMACY_ASSISTANT_FOOTER,
  MEDICAL_AID_DISCLAIMER
} from "../services/roleSafety.js";

assert.equal(normalizeChatRole("Pharmacist Assistant"), "pharmacy_assistant");
assert.equal(normalizeChatRole(undefined), "pharmacy_assistant");
assert.equal(normalizeChatRole("Doctor"), "doctor");

const scheduled = detectScheduledMedicine("Patient asks about codeine schedule 5 medicine.");
assert.equal(scheduled.scheduledMedicineTrigger, true, "scheduled medicine should trigger");

const assistantSafety = detectConsultationTriggers(
  "Pregnant patient asks about warfarin interaction and ICD-10 uncertainty.",
  "pharmacy_assistant"
);
assert.equal(assistantSafety.pharmacistConsultationRequired, true);
assert.ok(assistantSafety.consultationReasons.includes("pregnancy"));
assert.ok(assistantSafety.consultationReasons.includes("drug_interactions"));
assert.ok(assistantSafety.consultationReasons.includes("high_risk_medicine"));
assert.ok(assistantSafety.consultationReasons.includes("icd10_uncertainty"));

const pharmacistSafety = detectConsultationTriggers("Pregnant patient asks about warfarin.", "pharmacist");
assert.equal(pharmacistSafety.pharmacistConsultationRequired, false);

const assistantAnswer = applyRoleSpecificWording("Approved-source support text.", "pharmacy_assistant", assistantSafety);
assert.ok(assistantAnswer.includes("Pharmacist consultation required."));
assert.ok(assistantAnswer.includes(PHARMACY_ASSISTANT_FOOTER));
assert.ok(assistantAnswer.includes(MEDICAL_AID_DISCLAIMER));
assert.ok(assistantAnswer.includes("Support information for responsible pharmacist review:"));

const pharmacistAnswer = applyRoleSpecificWording("Approved-source support text.", "pharmacist", {
  clinicalEscalation: true,
  highRiskMedicine: false
});
assert.ok(pharmacistAnswer.includes("Clinical caution:"));

console.log("Assistant role safety validation scenarios passed.");

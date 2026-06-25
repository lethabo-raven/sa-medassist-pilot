import assert from "node:assert/strict";
import { detectEmergencyRedFlags, emergencyRedFlagAnswer } from "../services/emergencyRedFlags.js";
import { riskProfileCaution } from "../services/medicineRiskProfiles.js";
import { formatIcd10Support } from "../services/icd10.js";
import { applyRoleSpecificWording, MEDICAL_AID_DISCLAIMER } from "../services/roleSafety.js";

const riskProfiles = [
  {
    medicine_name: "Warfarin",
    risk_category: "high-risk medicine",
    escalation_reason: "Anticoagulant monitoring and interaction risk.",
    related_safety_trigger: "high_risk_medicine"
  }
];
const riskText = riskProfileCaution(riskProfiles);
assert.ok(riskText.includes("Warfarin"));
assert.ok(riskText.includes("high-risk medicine"));

const emergency = detectEmergencyRedFlags("Patient has chest pain and shortness of breath.");
assert.equal(emergency.emergencyRedFlag, true, "emergency red flag should be detected");
assert.equal(emergencyRedFlagAnswer(), "Immediate medical assessment required.");

const icd10Approved = formatIcd10Support({
  lowConfidence: false,
  matches: [
    {
      code: "I10",
      description: "Essential hypertension",
      document_id: "11111111-1111-4111-8111-111111111111",
      source_version: 2,
      approval_status: "approved"
    }
  ]
});
assert.ok(icd10Approved.includes("Possible ICD-10 matches include"));
assert.ok(!icd10Approved.includes("Use ICD-10 code"));

const icd10LowConfidence = formatIcd10Support({
  lowConfidence: true,
  matches: [
    {
      code: "E11",
      description: "Type 2 diabetes mellitus",
      document_id: "22222222-2222-4222-8222-222222222222",
      source_version: 1,
      approval_status: "approved"
    }
  ]
});
assert.ok(icd10LowConfidence.includes("cannot state an ICD-10 code with certainty"));

const assistantAnswer = applyRoleSpecificWording(icd10LowConfidence, "pharmacy_assistant", {
  pharmacistConsultationRequired: true,
  clinicalEscalation: false,
  highRiskMedicine: false
});
assert.ok(assistantAnswer.includes("Pharmacist consultation required."));
assert.ok(assistantAnswer.includes(MEDICAL_AID_DISCLAIMER));

console.log("Medicine risk and ICD-10 validation scenarios passed.");

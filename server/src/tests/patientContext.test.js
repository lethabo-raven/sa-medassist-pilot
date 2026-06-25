import assert from "node:assert/strict";
import {
  buildPlausibilityAnswer,
  buildMissingContextAnswer,
  normalizePatientContext,
  validateClinicalPlausibility,
  validatePatientContext
} from "../services/patientContext.js";

const paediatric = validatePatientContext(["age", "weight"], {});
assert.equal(paediatric.complete, false);
assert.deepEqual(paediatric.missingFields, ["age", "weight"]);
assert.ok(buildMissingContextAnswer(paediatric.followUpQuestions, "pharmacy_assistant").includes("Patient age required."));
assert.ok(buildMissingContextAnswer(paediatric.followUpQuestions, "pharmacy_assistant").includes("Patient weight required."));
assert.ok(buildMissingContextAnswer(paediatric.followUpQuestions, "pharmacy_assistant").includes("Pharmacist consultation may be required."));

const pregnancy = validatePatientContext(["pregnancyStatus"], { age: 32 });
assert.equal(pregnancy.complete, false);
assert.deepEqual(pregnancy.missingFields, ["pregnancyStatus"]);
assert.ok(buildMissingContextAnswer(pregnancy.followUpQuestions, "pharmacist").includes("Pregnancy status required."));

const renal = validatePatientContext(["renalImpairment"], { renalImpairment: "" });
assert.equal(renal.complete, false);
assert.ok(buildMissingContextAnswer(renal.followUpQuestions, "pharmacist").includes("Kidney function information required."));

const completed = validatePatientContext(["age", "weight", "renalImpairment"], {
  age: 8,
  weight: 24,
  renalImpairment: false
});
assert.equal(completed.complete, true);
assert.deepEqual(completed.missingFields, []);

const normalized = normalizePatientContext({
  age: "45",
  allergies: ["penicillin"],
  chronicConditions: "hypertension"
});
assert.equal(normalized.age, "45");
assert.deepEqual(normalized.allergies, ["penicillin"]);
assert.equal(normalized.chronicConditions, "hypertension");

const invalidAge = validateClinicalPlausibility({
  patientContext: { age: 140 },
  question: "Can this medicine be used?",
  requiredFields: ["age"]
});
assert.equal(invalidAge.implausiblePatientContext, true);
assert.ok(buildPlausibilityAnswer(invalidAge, "pharmacist").includes("Age must be between 0 and 120 years."));

const invalidWeight = validateClinicalPlausibility({
  patientContext: { age: 8, weight: 0.2 },
  question: "What is the paediatric dose?",
  requiredFields: ["age", "weight"]
});
assert.equal(invalidWeight.implausiblePatientContext, true);
assert.ok(buildPlausibilityAnswer(invalidWeight, "pharmacist").includes("Weight must be between 0.5kg and 350kg."));

const neonatal = validateClinicalPlausibility({
  patientContext: { age: 0.03, weight: 3.4 },
  question: "What dose can be used?",
  requiredFields: ["age", "weight"]
});
assert.equal(neonatal.neonatalHighRisk, true);
assert.equal(neonatal.pharmacistReviewRequired, true);

const missingPaediatricWeight = validateClinicalPlausibility({
  patientContext: { age: 6 },
  question: "What is the paediatric dose?",
  requiredFields: ["age", "weight"]
});
assert.equal(missingPaediatricWeight.plausible, false);
assert.ok(missingPaediatricWeight.followUpQuestions.includes("Patient weight required."));

const pregnancyUnknown = validateClinicalPlausibility({
  patientContext: { pregnancyStatus: "unknown" },
  question: "Is this medicine safe in pregnancy?",
  requiredFields: ["pregnancyStatus"]
});
assert.equal(pregnancyUnknown.plausible, false);
assert.ok(buildPlausibilityAnswer(pregnancyUnknown, "pharmacy_assistant").includes("Pharmacist consultation may be required."));

const renalUnknown = validateClinicalPlausibility({
  patientContext: { renalImpairment: "unknown" },
  question: "Renal dose adjustment?",
  requiredFields: ["renalImpairment"]
});
assert.equal(renalUnknown.plausible, false);
assert.ok(buildPlausibilityAnswer(renalUnknown, "pharmacist").includes("Kidney function information is unknown."));

console.log("Patient context validation scenarios passed.");

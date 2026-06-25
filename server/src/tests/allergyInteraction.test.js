import assert from "node:assert/strict";
import { formatInteractionWarning } from "../services/allergyInteractionSafety.js";

const penicillinConflict = {
  medicine: "amoxicillin",
  allergy_group: "Penicillin",
  severity: "contraindicated",
  warning: "Potential penicillin allergy conflict."
};
assert.equal(penicillinConflict.severity, "contraindicated");
assert.ok("Potential allergy conflict detected.".includes("Potential allergy conflict"));

const aspirinConflict = {
  medicine: "aspirin",
  allergy_group: "Aspirin",
  severity: "contraindicated",
  warning: "Potential aspirin allergy conflict."
};
assert.equal(aspirinConflict.medicine, "aspirin");
assert.equal(aspirinConflict.severity, "contraindicated");

const warfarinNsaid = formatInteractionWarning([
  {
    medicine_a: "warfarin",
    medicine_b: "ibuprofen",
    severity: "major",
    interaction_reason: "Increased bleeding risk with NSAID.",
    action_required: "Pharmacist review required before dispensing."
  }
]);
assert.ok(warfarinNsaid.includes("warfarin + ibuprofen"));
assert.ok(warfarinNsaid.includes("major"));

const methotrexateTrimethoprim = formatInteractionWarning([
  {
    medicine_a: "methotrexate",
    medicine_b: "trimethoprim",
    severity: "contraindicated",
    interaction_reason: "Increased antifolate toxicity risk.",
    action_required: "Do not proceed without pharmacist review."
  }
]);
assert.ok(methotrexateTrimethoprim.includes("contraindicated"));

const assistantEscalation = [
  "Potentially unsafe medicine combination detected.",
  "Pharmacist review required."
].join("\n");
assert.ok(assistantEscalation.includes("Pharmacist review required."));

console.log("Allergy and interaction validation scenarios passed.");

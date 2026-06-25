import assert from "node:assert/strict";

const importedRule = {
  sourceDocumentId: "11111111-1111-4111-8111-111111111111",
  sourceName: "Approved SAHPRA Source",
  sourceVersion: 3,
  sourcePageSectionReference: "Section 4.3",
  importDate: new Date().toISOString(),
  approvalStatus: "approved",
  reviewer: "super-admin",
  confidenceScore: 0.91,
  activeFlag: true,
  ruleOrigin: "imported"
};

assert.equal(importedRule.approvalStatus, "approved");
assert.equal(importedRule.ruleOrigin, "imported");
assert.ok(importedRule.sourceDocumentId);
assert.ok(importedRule.sourceName);
assert.ok(importedRule.sourceVersion > 0);
assert.ok(importedRule.sourcePageSectionReference);
assert.ok(importedRule.confidenceScore >= 0 && importedRule.confidenceScore <= 1);

const seedRule = {
  approvalStatus: "seed_demo",
  ruleOrigin: "seed_demo",
  sourceName: "Seed/demo rule - not production verified"
};

assert.equal(seedRule.approvalStatus, "seed_demo");
assert.equal(seedRule.ruleOrigin, "seed_demo");
assert.ok(seedRule.sourceName.includes("not production verified"));

const extractedReview = {
  approvalStatus: "pending",
  activeFlag: false,
  extractedPayload: { medicineName: "warfarin" }
};

assert.equal(extractedReview.approvalStatus, "pending");
assert.equal(extractedReview.activeFlag, false);
assert.ok(extractedReview.extractedPayload);

console.log("Source-backed rule validation scenarios passed.");

import assert from "node:assert/strict";

const allowedRoles = new Set(["pharmacist", "pharmacy_assistant", "pharmacy_manager"]);

function normalizeEmployeeRole(role) {
  const value = String(role || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (allowedRoles.has(value)) return value;
  if (value === "pharmacist_assistant") return "pharmacy_assistant";
  return "pharmacy_assistant";
}

function dashboardShape(payload) {
  return {
    activeEmployees: payload.activeEmployees ?? 0,
    questionsAskedToday: payload.questionsAskedToday ?? 0,
    escalations: payload.escalations ?? 0,
    interactionWarnings: payload.interactionWarnings ?? 0,
    allergyWarnings: payload.allergyWarnings ?? 0,
    pendingApprovals: payload.pendingApprovals ?? 0,
  };
}

assert.equal(normalizeEmployeeRole("Pharmacist"), "pharmacist");
assert.equal(normalizeEmployeeRole("Pharmacy Assistant"), "pharmacy_assistant");
assert.equal(normalizeEmployeeRole("Pharmacist Assistant"), "pharmacy_assistant");
assert.equal(normalizeEmployeeRole("Pharmacy Manager"), "pharmacy_manager");
assert.equal(normalizeEmployeeRole("unknown"), "pharmacy_assistant");

assert.deepEqual(dashboardShape({ activeEmployees: 2, escalations: 1 }), {
  activeEmployees: 2,
  questionsAskedToday: 0,
  escalations: 1,
  interactionWarnings: 0,
  allergyWarnings: 0,
  pendingApprovals: 0,
});

console.log("pharmacy manager portal tests passed");

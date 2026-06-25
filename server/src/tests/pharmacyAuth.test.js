import assert from "node:assert/strict";
import { hashSecret, normalizeJobTitle, validatePin, verifySecret } from "../services/auth.js";

assert.equal(validatePin("123456"), true);
assert.equal(validatePin("12345"), false);
assert.equal(validatePin("abcdef"), false);

const hash = hashSecret("654321");
assert.equal(verifySecret("654321", hash), true);
assert.equal(verifySecret("111111", hash), false);
assert.notEqual(hash, "654321");

assert.equal(normalizeJobTitle("Pharmacist"), "pharmacist");
assert.equal(normalizeJobTitle("Pharmacist Assistant"), "pharmacy_assistant");
assert.equal(normalizeJobTitle("Pharmacy Manager"), "pharmacy_manager");
assert.equal(normalizeJobTitle("Doctor"), "doctor");
assert.equal(normalizeJobTitle("Unknown"), "other");

const authenticatedRole = "pharmacist";
const widgetRole = "pharmacy_assistant";
const selectedRole = authenticatedRole || widgetRole;
assert.equal(selectedRole, "pharmacist");

console.log("Pharmacy auth validation scenarios passed.");

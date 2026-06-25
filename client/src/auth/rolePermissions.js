export const ROLE_SECTIONS = {
  pharmacist_assistant: ["chat", "account"],
  pharmacist: ["chat", "account"],
  pharmacy_assistant: ["chat", "account"],
  pharmacy_manager: ["chat", "account", "admin", "documents", "analytics", "users"],
  system_owner: ["chat", "account", "admin", "documents", "analytics", "users"],
  super_admin: ["chat", "account", "admin", "documents", "analytics", "users"],
};

export const SECTION_LABELS = {
  chat: "Chat",
  account: "Account",
  admin: "Admin",
  documents: "Documents",
  analytics: "Analytics",
  users: "User Management",
};

export const ROLE_LABELS = {
  pharmacist_assistant: "Pharmacist Assistant",
  pharmacist: "Pharmacist",
  pharmacy_assistant: "Pharmacy Assistant",
  pharmacy_manager: "Pharmacy Manager",
  system_owner: "System Owner",
  super_admin: "System Owner",
};

export function normalizeRole(role) {
  return String(role || "pharmacist_assistant").trim().toLowerCase().replace(/\s+/g, "_");
}

export function sectionsForRole(role) {
  return ROLE_SECTIONS[normalizeRole(role)] || ROLE_SECTIONS.pharmacist_assistant;
}

export function canUseAdminTools(role) {
  return sectionsForRole(role).some((section) => !["chat", "account"].includes(section));
}

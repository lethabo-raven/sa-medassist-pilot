import { query } from "../db/pool.js";
import { audit } from "../services/audit.js";
import { normalizeJobTitle, resolveEmployeeSession } from "../services/auth.js";

const ROLE_PERMISSIONS = {
  system_owner: ["*"],
  pharmacy_manager: [
    "employees.manage",
    "employees.reset_pin",
    "pharmacy_audits.view",
    "sources.view_approved",
    "sources.upload",
    "sources.replace",
    "audits.view",
    "reports.view",
    "review_queue.view",
    "review_queue.manage"
  ],
  pharmacist: ["assistant.query", "citations.view", "source_details.view", "answer_history.view", "answers.feedback"],
  pharmacy_assistant: ["assistant.query", "citations.view"],
  doctor: ["assistant.query", "citations.view", "source_details.view", "answer_history.view"],
  other: ["assistant.query", "citations.view"]
};

function permissionSetForRole(role) {
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.other;
  if (permissions.includes("*")) return new Set(["*"]);
  return new Set(permissions);
}

export async function resolveActor(req, res, next) {
  try {
    const authHeader = req.get("authorization") || "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : null;
    const employee = await resolveEmployeeSession(bearer);
    if (employee) {
      const chatRole = normalizeJobTitle(employee.job_title);
      req.pharmacyId = employee.pharmacy_id;
      req.employee = {
        id: employee.id,
        pharmacyId: employee.pharmacy_id,
        employeeNumber: employee.employee_number,
        displayName: employee.display_name,
        jobTitle: employee.job_title,
        chatRole,
        systemRole: employee.system_role
      };
      req.actor = {
        id: employee.id,
        externalId: `employee:${employee.id}`,
        displayName: employee.display_name,
        roles: [employee.system_role],
        permissions: permissionSetForRole(employee.system_role),
        active: employee.status === "active" && employee.pharmacy_status === "active",
        pharmacyId: employee.pharmacy_id,
        chatRole
      };
      return next();
    }

    const externalId =
      req.get("x-user-id") ||
      req.get("x-actor-id") ||
      req.body?.actor ||
      req.query?.actor ||
      "anonymous";

    const userResult = await query(
      `SELECT u.id, u.external_id, u.display_name, u.active,
              COALESCE(json_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '[]') AS roles,
              COALESCE(json_agg(DISTINCT p.key) FILTER (WHERE p.key IS NOT NULL), '[]') AS permissions
       FROM app_users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE u.external_id = $1
       GROUP BY u.id`,
      [externalId]
    );

    if (userResult.rowCount === 0) {
      req.actor = {
        externalId,
        displayName: externalId,
        roles: [],
        permissions: new Set(),
        active: externalId === "anonymous" ? false : false
      };
      return next();
    }

    const user = userResult.rows[0];
    req.actor = {
      id: user.id,
      externalId: user.external_id,
      displayName: user.display_name,
      roles: user.roles,
      permissions: new Set(user.permissions),
      active: user.active
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permissionKey) {
  return async function permissionMiddleware(req, res, next) {
    const actor = req.actor || { externalId: "anonymous", permissions: new Set(), active: false };
    const allowed = actor.active && (actor.permissions?.has("*") || actor.permissions?.has(permissionKey));

    if (!allowed) {
      try {
        await audit("access.unauthorized", {
          actor: actor.externalId,
          metadata: {
            permission: permissionKey,
            method: req.method,
            path: req.originalUrl,
            roles: actor.roles || []
          }
        });
      } catch (error) {
        console.error("Failed to audit unauthorized access:", error);
      }
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }

    next();
  };
}

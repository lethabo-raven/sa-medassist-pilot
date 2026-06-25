import { config } from "../config.js";
import crypto from "node:crypto";
import { audit } from "../services/audit.js";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token");
  const expectedHash = config.adminTokenSha256 || sha256(config.adminToken);
  const actualHash = token ? sha256(token) : "";

  if (!token || !safeEqual(actualHash, expectedHash)) {
    try {
      await audit("access.unauthorized", {
        actor: req.actor?.externalId || "anonymous",
        metadata: {
          reason: "admin_token_required",
          method: req.method,
          path: req.originalUrl
        }
      });
    } catch (error) {
      console.error("Failed to audit unauthorized admin access:", error);
    }
    return res.status(401).json({ error: "Admin token required." });
  }
  next();
}

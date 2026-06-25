import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import chatRouter from "./routes/chat.js";
import adminRouter from "./routes/admin.js";
import auditRouter from "./routes/audit.js";
import metricsRouter from "./routes/metrics.js";
import usersRouter from "./routes/users.js";
import sourcesRouter from "./routes/sources.js";
import historyRouter from "./routes/history.js";
import feedbackRouter from "./routes/feedback.js";
import reviewQueueRouter from "./routes/reviewQueue.js";
import icd10Router from "./routes/icd10.js";
import governanceImportsRouter from "./routes/governanceImports.js";
import authRouter from "./routes/auth.js";
import pharmacyAccessRouter from "./routes/pharmacyAccess.js";
import systemOwnerRouter from "./routes/systemOwner.js";
import pharmacyManagerRouter from "./routes/pharmacyManager.js";
import workspaceRouter from "./routes/workspace.js";
import knowledgeManagementRouter from "./routes/knowledgeManagement.js";
import knowledgeSearchRouter from "./routes/knowledgeSearch.js";
import analyticsDashboardRouter from "./routes/analyticsDashboard.js";
import feedbackReviewRouter from "./routes/feedbackReview.js";
import { resolveActor } from "./middleware/rbac.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS."));
  }
}));
app.use("/api/chat", rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use("/api/admin", rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(express.json({ limit: "1mb" }));
app.use(resolveActor);

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "sa-medassist-api",
    ollamaChatModel: config.ollamaChatModel,
    ollamaEmbedModel: config.ollamaEmbedModel
  });
});

app.get("/widget.js", (req, res) => {
  res.type("application/javascript");
  res.sendFile(path.join(__dirname, "..", "public", "widget.js"));
});

app.use("/api/chat", chatRouter);
app.use("/api/auth", authRouter);
app.use("/api/access", pharmacyAccessRouter);
app.use("/api/system-owner", systemOwnerRouter);
app.use("/api/pharmacy-manager", pharmacyManagerRouter);
app.use("/api/workspace", workspaceRouter);
app.use("/api/knowledge-management", knowledgeManagementRouter);
app.use("/api/knowledge-search", knowledgeSearchRouter);
app.use("/api/analytics-dashboard", analyticsDashboardRouter);
app.use("/api/feedback-review", feedbackReviewRouter);
app.use("/api/admin", adminRouter);
app.use("/api/audit", auditRouter);
app.use("/api/admin/metrics", metricsRouter);
app.use("/api/admin/users", usersRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/history", historyRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/review-queue", reviewQueueRouter);
app.use("/api/icd10", icd10Router);
app.use("/api/admin/imports", governanceImportsRouter);

app.use((error, req, res, next) => {
  void next;
  console.error(error);
  const status = error.name === "ZodError" ? 400 : 500;
  res.status(status).json({
    error: status === 500 ? "Something went wrong." : "Invalid request.",
    details: config.nodeEnv === "development" ? error.message : undefined
  });
});

app.listen(config.port, () => {
  console.log(`SA MedAssist API listening on http://localhost:${config.port}`);
});

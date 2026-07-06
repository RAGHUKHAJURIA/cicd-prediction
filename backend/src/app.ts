import "dotenv/config";
import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";
import repoRoutes from "./routes/repo.routes";
import scanRoutes from "./routes/scan.routes";
import jobRoutes from "./routes/job.routes";
import { aiRoutes } from "./routes/ai.routes";
import webhookRoutes from "./routes/webhook.routes";
import queueRoutes from "./routes/queue.routes";
import { mountBullBoard } from "./queue/bull-board";
import { healthService } from "./monitoring/health.service";
import { metricsService } from "./monitoring/metrics.service";
import { githubAppRouter } from "./routes/github-app.routes";
import { integrationsRouter } from "./routes/integrations.routes";
import analyzeRoutes from "./routes/analyze.routes";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db/pool";
import { authRoutes } from "./routes/auth.routes";
import { githubAuthRouter } from "./routes/githubAuth";
import { githubReposRoutes } from "./routes/github-repos.routes";
import { githubActionsRoutes } from "./routes/github-actions.routes";

const ENDPOINTS = [
  "POST   /api/repos                          — Register a repository",
  "GET    /api/repos                          — List repositories",
  "GET    /api/repos/:id                      — Get repository",
  "PATCH  /api/repos/:id                      — Update repository",
  "DELETE /api/repos/:id                      — Delete repository",
  "POST   /api/repos/:id/scan                 — Trigger a scan",
  "GET    /api/repos/:id/scans                — List scans",
  "GET    /api/repos/:id/scans/latest         — Get latest scan",
  "GET    /api/repos/:id/scans/:scanId        — Get specific scan",
  "POST   /api/repos/:id/scans/:scanId/rerun  — Rerun a scan",
  "POST   /api/scans/:scanId/explain          — Explain a scan result",
  "GET    /api/scans/:scanId/explain/:jobId   — Get explanation status",
  "POST   /api/scans/:scanId/remediate        — Generate remediations",
  "GET    /api/scans/:scanId/remediate/:jobId — Get remediation status",
  "POST   /api/scans/:scanId/ai-report        — Generate full AI report",
  "GET    /api/scans/:scanId/ai-report/:jobId — Get full AI report",
  "POST   /webhooks/github                    — GitHub webhook receiver",
  "GET    /api/queue/stats                    — Queue statistics",
  "GET    /api/queue/failed                   — Failed jobs",
  "POST   /api/queue/retry-failed             — Retry failed jobs",
  "DELETE /api/queue/clean                    — Clean old jobs",
  "GET    /api/health                         — System health check",
  "GET    /api/metrics                        — Performance metrics",
];

export function createApp(): Application {
  const app: Application = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: process.env.DASHBOARD_URL || "http://localhost:3001",
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // ── Webhook route MUST use raw body BEFORE json middleware ─────────────────
  app.use("/webhooks/github", webhookRoutes);
  app.use("/webhooks/github-app", express.raw({ type: "*/*" }), githubAppRouter);

  // ── Body parsing (after webhook route) ────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        ttl: 7 * 24 * 60 * 60,
        pruneSessionInterval: 60 * 60,
      }),
      name: "cicd.sid",
      secret: process.env["SESSION_SECRET"]!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: "lax" as const,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      },
    })
  );

  // ── Request logging (assigns requestId + logs on finish) ──────────────────
  app.use(requestLogger);

  // ── Bull Board dashboard ──────────────────────────────────────────────────
  mountBullBoard(app);

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env["NODE_ENV"] ?? "development",
      version: process.env["npm_package_version"] ?? "1.0.0",
    });
  });

  // ── Detailed system health ────────────────────────────────────────────────
  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      const health = await healthService.getSystemHealth();
      const statusCode = health.status === "healthy" ? 200 : health.status === "degraded" ? 200 : 503;
      res.status(statusCode).json({ success: true, data: health });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── Performance metrics ───────────────────────────────────────────────────
  app.get("/api/metrics", (_req: Request, res: Response) => {
    const perf = metricsService.getPerformanceMetrics();
    res.status(200).json({ success: true, data: perf });
  });

  // ── API info ──────────────────────────────────────────────────────────────
  app.get("/api", (_req: Request, res: Response) => {
    res.status(200).json({
      name: "CI/CD Reliability Intelligence Platform API",
      version: "1.0.0",
      endpoints: ENDPOINTS,
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use("/auth", authRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/auth", githubAuthRouter);
  app.use("/api/auth", githubAuthRouter);
  app.use("/api/repos", repoRoutes);
  app.use("/api/repos", scanRoutes);
  app.use("/api/jobs", jobRoutes);
  app.use("/api", aiRoutes);
  app.use("/api/queue", queueRoutes);
  app.use("/api/github-app", githubAppRouter);
  app.use("/api/integrations", integrationsRouter);
  app.use("/api/analyze", analyzeRoutes);
  app.use("/api/github", githubReposRoutes);
  app.use("/api/github/actions", githubActionsRoutes);

  // ── 404 fallthrough ───────────────────────────────────────────────────────
  app.use("*", (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Route ${req.method} ${req.originalUrl} not found`,
      code: "ROUTE_NOT_FOUND",
    });
  });

  // ── Global error handler (must be last) ───────────────────────────────────
  app.use(errorHandler);

  return app;
}


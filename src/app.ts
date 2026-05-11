import "dotenv/config";
import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { requestLogger } from "./middleware/request-logger";
import { errorHandler } from "./middleware/error-handler";
import repoRoutes from "./routes/repo.routes";
import scanRoutes from "./routes/scan.routes";

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
];

export function createApp(): Application {
  const app: Application = express();

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin:
        process.env["NODE_ENV"] === "production"
          ? (process.env["CORS_ORIGIN"] ?? false)
          : "*",
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ── Request logging (assigns requestId + logs on finish) ──────────────────
  app.use(requestLogger);

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

  // ── API info ──────────────────────────────────────────────────────────────
  app.get("/api", (_req: Request, res: Response) => {
    res.status(200).json({
      name: "CI/CD Reliability Intelligence Platform API",
      version: "1.0.0",
      endpoints: ENDPOINTS,
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use("/api/repos", repoRoutes);
  app.use("/api/repos", scanRoutes);

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

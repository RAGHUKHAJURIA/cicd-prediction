import express, { Application, Request, Response } from "express";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";

/**
 * Creates and configures the Express application instance.
 * All routes, middleware, and error handlers are registered here.
 * The server binding (port, listen) is done in server.ts.
 */
export function createApp(): Application {
  const app: Application = express();

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // ── Request logging ───────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Health check ──────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ── API routes (registered as they are implemented) ───────────────────────
  // app.use("/api/v1/workflows", workflowRouter);
  // app.use("/api/v1/ingest",    ingestRouter);

  // ── 404 fallthrough ───────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // ── Centralised error handler ─────────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

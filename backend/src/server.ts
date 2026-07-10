import "dotenv/config";
import http from "http";
import { sql } from "drizzle-orm";
import { createApp } from "./app";
import { db, pool } from "./db/client";
import { WorkerManager } from "./workers/worker-manager";
import { initSlidingWindow } from "./middleware/sliding-window";
import { warmCache } from "./cache/cache-warmer";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

async function bootstrap(): Promise<void> {
  // 1. Verify database connection before binding the port
  try {
    await db.execute(sql`SELECT 1`);
    console.log("[server] Database connection verified.");
  } catch (err) {
    console.error("[server] Fatal: Cannot connect to database.", err);
    process.exit(1);
  }

  // 1.5. Initialize sliding window and pre-warm cache (non-fatal if Redis down)
  try {
    await initSlidingWindow();
    console.log("[server] Sliding window rate limiter initialized.");
  } catch (err) {
    console.error("[server] Warning: Failed to initialize sliding window rate limiter:", err);
  }

  try {
    await warmCache();
    console.log("[server] Caches pre-warmed successfully.");
  } catch (err) {
    console.error("[server] Warning: Failed to pre-warm caches:", err);
  }

  // Warn (non-fatal) if email credentials are missing
  if (!process.env["RESEND_API_KEY"]) {
    console.warn("[server] ⚠  RESEND_API_KEY is not set — registration emails will be skipped.");
  }

  let workerManager: WorkerManager | null = null;
  const startWorkers = process.env["START_WORKERS"] !== "false";
  if (startWorkers) {
    workerManager = new WorkerManager();
    await workerManager.startAll();
  } else {
    console.log("[server] Background workers disabled in this process (START_WORKERS=false).");
  }

  const app = createApp();
  const server = http.createServer(app);

  // 2. Start listening
  server.listen(PORT, () => {
    console.log(
      JSON.stringify({
        event: "server_started",
        port: PORT,
        environment: process.env["NODE_ENV"] ?? "development",
        timestamp: new Date().toISOString(),
      })
    );
  });

  // 3. Graceful shutdown
  async function shutdown(signal: string): Promise<void> {
    console.log(`[server] ${signal} received — shutting down gracefully.`);

    server.close(() => {
      console.log("[server] HTTP server closed.");
    });

    if (workerManager) {
      await workerManager.stopAll();
    }

    try {
      await pool.end();
      console.log("[server] Database pool closed.");
    } catch (err) {
      console.error("[server] Error closing database pool:", err);
    }

    process.exit(0);
  }

  process.on("SIGTERM", () => { shutdown("SIGTERM").catch(console.error); });
  process.on("SIGINT",  () => { shutdown("SIGINT").catch(console.error); });
}

bootstrap().catch((err: unknown) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});

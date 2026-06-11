import "dotenv/config";
import http from "http";
import { sql } from "drizzle-orm";
import { createApp } from "./app";
import { db, pool } from "./db/client";
import { WorkerManager } from "./workers/worker-manager";

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

  // Warn (non-fatal) if email credentials are missing
  if (!process.env["RESEND_API_KEY"]) {
    console.warn("[server] ⚠  RESEND_API_KEY is not set — registration emails will be skipped.");
  }

  const workerManager = new WorkerManager();
  await workerManager.startAll();

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

    await workerManager.stopAll();

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

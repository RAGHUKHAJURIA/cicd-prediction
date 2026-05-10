import "dotenv/config";
import { createApp } from "./app";

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

async function bootstrap(): Promise<void> {
  const app = createApp();

  const server = app.listen(PORT, () => {
    console.log(
      `[server] CI/CD Reliability Intelligence Platform running on port ${PORT} (${process.env["NODE_ENV"] ?? "development"})`
    );
  });

  // Graceful shutdown on SIGTERM (Docker / Kubernetes stop signal)
  process.on("SIGTERM", () => {
    console.log("[server] SIGTERM received — shutting down gracefully.");
    server.close(() => {
      console.log("[server] HTTP server closed.");
      process.exit(0);
    });
  });

  // Graceful shutdown on SIGINT (Ctrl+C in development)
  process.on("SIGINT", () => {
    console.log("[server] SIGINT received — shutting down gracefully.");
    server.close(() => {
      console.log("[server] HTTP server closed.");
      process.exit(0);
    });
  });
}

bootstrap().catch((err: unknown) => {
  console.error("[server] Fatal startup error:", err);
  process.exit(1);
});

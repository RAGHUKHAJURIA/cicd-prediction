import { Request, Response, NextFunction } from "express";

/**
 * Minimal structured request logger middleware.
 * Logs method, path, status code, and response time for every request.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(
      `[${level}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${durationMs}ms)`
    );
  });

  next();
}

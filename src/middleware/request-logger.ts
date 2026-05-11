import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// ─── Extend Express Request ───────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

// ─── Structured log shape ─────────────────────────────────────────────────────

interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
}

const isDev = process.env["NODE_ENV"] !== "production";

function emit(log: RequestLog): void {
  if (isDev) {
    console.log(
      `[${log.timestamp}] ${log.method} ${log.path} → ${log.statusCode} (${log.durationMs}ms) [${log.requestId}]`
    );
  } else {
    console.log(JSON.stringify(log));
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  req.requestId = randomUUID();
  req.startTime = Date.now();

  res.on("finish", () => {
    emit({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - req.startTime,
      requestId: req.requestId,
    });
  });

  next();
}

import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

// ─── AppError ─────────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public override message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── AppError factories ───────────────────────────────────────────────────────

export const NotFoundError = (resource: string): AppError =>
  new AppError(404, `${resource} not found`, "NOT_FOUND");

export const ConflictError = (message: string): AppError =>
  new AppError(409, message, "CONFLICT");

export const BadRequestError = (message: string, details?: unknown): AppError =>
  new AppError(400, message, "BAD_REQUEST", details);

export const UnprocessableError = (
  message: string,
  details?: unknown
): AppError => new AppError(422, message, "UNPROCESSABLE", details);

export const ServiceUnavailableError = (message: string): AppError =>
  new AppError(503, message, "SERVICE_UNAVAILABLE");

// ─── PostgreSQL error shape (minimal) ────────────────────────────────────────

interface PgError extends Error {
  code?: string;
}

// ─── Global error handler ─────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express requires the 4-arg signature even when _next is unused
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const isDev = process.env["NODE_ENV"] !== "production";

  // 1. Zod validation error
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.issues.map((i) => ({
        field: i.path.join(".") || "(root)",
        message: i.message,
      })),
    });
    return;
  }

  // 2. Application error
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      success: false,
      error: err.message,
      code: err.code,
    };
    if (err.details !== undefined) body["details"] = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // 3. PostgreSQL driver errors
  if (err instanceof Error) {
    const pgErr = err as PgError;

    if (pgErr.code === "23505") {
      res.status(409).json({
        success: false,
        error: "Resource already exists",
        code: "DUPLICATE",
      });
      return;
    }
    if (pgErr.code === "23503") {
      res.status(400).json({
        success: false,
        error: "Referenced resource not found",
        code: "INVALID_REFERENCE",
      });
      return;
    }
    if (pgErr.message.includes("ECONNREFUSED")) {
      res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
      return;
    }

    // 4. Malformed JSON body (Express sets this as SyntaxError)
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({
        success: false,
        error: "Invalid JSON body",
        code: "INVALID_JSON",
      });
      return;
    }

    // 5. Generic Error — hide internals in production
    console.error("[errorHandler]", err);
    if (isDev) {
      res.status(500).json({
        success: false,
        error: err.message,
        code: "INTERNAL_ERROR",
        stack: err.stack,
      });
    } else {
      res.status(500).json({
        success: false,
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    }
    return;
  }

  // 5. Unknown (non-Error) throw
  console.error("[errorHandler] Unknown throw:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}

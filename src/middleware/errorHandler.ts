import { Request, Response, NextFunction } from "express";

/**
 * Structured API error class.
 * Throw this anywhere in route handlers or service layers
 * to produce a consistent JSON error response.
 */
export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
    // Restore prototype chain in transpiled ES5 output
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Centralised Express error handler.
 * Must be registered AFTER all routes (4-argument signature required).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  const message =
    err instanceof Error ? err.message : "An unexpected error occurred";

  console.error("[errorHandler] Unhandled error:", err);

  res.status(500).json({ error: message });
}

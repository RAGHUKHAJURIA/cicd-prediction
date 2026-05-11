import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodSchema, ZodError } from "zod";

interface ValidationDetail {
  field: string;
  message: string;
  received: unknown;
}

function formatZodError(error: ZodError): ValidationDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    message: issue.message,
    received: "received" in issue ? (issue as { received: unknown }).received : undefined,
  }));
}

/** Validate req.body against a Zod schema. On success, replaces req.body with the parsed result. */
export function validate(schema: ZodSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({
        success: false,
        error: "Validation failed",
        details: formatZodError(result.error),
      });
      return;
    }
    req.body = result.data as unknown;
    next();
  };
}

/** Validate req.params against a Zod schema. */
export function validateParams(schema: ZodSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(422).json({
        success: false,
        error: "Validation failed",
        details: formatZodError(result.error),
      });
      return;
    }
    // Merge validated params back — params is read-only so we cast
    Object.assign(req.params, result.data);
    next();
  };
}

/** Validate req.query against a Zod schema. On success, replaces req.query with parsed result. */
export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(422).json({
        success: false,
        error: "Validation failed",
        details: formatZodError(result.error),
      });
      return;
    }
    req.query = result.data as Record<string, string | string[] | undefined>;
    next();
  };
}

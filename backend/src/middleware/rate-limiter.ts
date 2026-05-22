import { Request, Response, NextFunction, RequestHandler } from "express";
import { queueRedis } from "../queue/redis.client";

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: (req: Request) => string;
  message: string;
}): RequestHandler {
  const keyGenerator = options.keyGenerator ?? ((req: Request) => req.ip ?? "unknown");

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = keyGenerator(req);
    const key = `ratelimit:${options.keyPrefix}:${identifier}`;

    try {
      // Increment request count
      const count = await queueRedis.incr(key);

      // If key is new, set TTL
      if (count === 1) {
        await queueRedis.expire(key, Math.ceil(options.windowMs / 1000));
      }

      const ttl = await queueRedis.ttl(key);
      const remaining = Math.max(0, options.max - count);

      // Set standard headers
      res.setHeader("X-RateLimit-Limit", options.max);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.floor(Date.now() / 1000) + (ttl > 0 ? ttl : 0));

      if (count > options.max) {
        res.status(429).json({
          success: false,
          error: options.message,
          code: "RATE_LIMITED",
          details: {
            retryAfterSeconds: ttl > 0 ? ttl : 0,
            limit: options.max,
            windowMs: options.windowMs,
          },
        });
        return;
      }

      next();
    } catch (err: any) {
      // Fail open: log warning but don't block user if Redis is down
      console.warn(`[RateLimiter] Error querying rate limit for ${key}: ${err.message}`);
      next();
    }
  };
}

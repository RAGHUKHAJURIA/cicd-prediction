import { Request, Response, NextFunction, RequestHandler } from 'express'
import { slidingWindowCheck } from './sliding-window'
import { RateLimitConfig, RATE_LIMITS } from './rate-limit-configs'
import { redisConnections } from '../cache/redis-client'

function getIdentifier(req: Request, config: RateLimitConfig): string {
  // If custom key generator provided, use it:
  if (config.keyGenerator) {
    return config.keyGenerator(req)
  }

  // For authenticated users: key on userId (not IP)
  if (req.session?.userId) {
    return `user:${req.session.userId}`
  }

  // For unauthenticated: key on IP
  // Extract real IP respecting common proxy headers:
  const forwarded = req.headers['x-forwarded-for'] as string
  if (forwarded) {
    const firstIp = forwarded.split(',')[0].trim()
    if (firstIp && firstIp !== '::1' && firstIp !== '127.0.0.1') {
      return `ip:${firstIp}`
    }
  }

  const realIp = req.headers['x-real-ip'] as string
  if (realIp) return `ip:${realIp}`

  return `ip:${req.ip ?? 'unknown'}`
}

export function createRateLimiter(
  config: RateLimitConfig
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Check if internal request (bypass rate limiting)
    if (isInternalRequest(req)) {
      return next()
    }

    const identifier = getIdentifier(req, config)

    try {
      const result = await slidingWindowCheck(
        identifier,
        config.prefix,
        config.limit,
        config.windowMs
      )

      // Always add rate limit headers (RFC 6585 standard):
      res.set({
        'X-RateLimit-Limit': config.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil((Date.now() + result.resetMs) / 1000).toString(),
        'X-RateLimit-Policy': `${config.limit};w=${config.windowMs / 1000}`,
      })

      if (!result.allowed) {
        res.set(
          'Retry-After',
          Math.ceil(result.retryAfterMs / 1000).toString()
        )

        res.status(429).json({
          success: false,
          error: config.message,
          code: 'RATE_LIMITED',
          details: {
            limit: result.limit,
            remaining: 0,
            retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
            resetAt: new Date(Date.now() + result.retryAfterMs).toISOString(),
            windowSeconds: config.windowMs / 1000,
          }
        })
        return
      }

      // Handle successful/failed request skip tracking
      if (config.skipSuccessfulRequests || config.skipFailedRequests) {
        const nowMs = Date.now()
        const windowStart = nowMs - (nowMs % config.windowMs)
        const currentKey = `rl:${config.prefix}:${identifier}:${windowStart}`

        res.on('finish', async () => {
          try {
            const isSuccess = res.statusCode >= 200 && res.statusCode < 400
            if (config.skipSuccessfulRequests && isSuccess) {
              // Decrement because it succeeded (e.g. login succeeded, only failures count)
              await redisConnections.rateLimiter.decr(currentKey)
            } else if (config.skipFailedRequests && !isSuccess) {
              // Decrement because it failed (e.g. server error, don't penalize user)
              await redisConnections.rateLimiter.decr(currentKey)
            }
          } catch (err: any) {
            console.error('[rate-limiter] Error handling response finish adjustment:', err.message)
          }
        })
      }

      next()
    } catch (err) {
      // If rate limiter itself errors: fail open (allow request)
      console.error('[rate-limiter] Error:', err)
      next()
    }
  }
}

export function createTieredRateLimiter(params: {
  guest: RateLimitConfig
  authenticated: RateLimitConfig
}): RequestHandler {
  const guestLimiter = createRateLimiter(params.guest)
  const authLimiter = createRateLimiter(params.authenticated)

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.session?.userId) {
      return authLimiter(req, res, next)
    }
    return guestLimiter(req, res, next)
  }
}

// Convenience exports to match requirements:
export const analyzeRateLimiter = createTieredRateLimiter({
  guest: RATE_LIMITS.publicScan.guest,
  authenticated: RATE_LIMITS.publicScan.authenticated,
})

export const loginRateLimiter = createRateLimiter(RATE_LIMITS.authLogin)
export const registerRateLimiter = createRateLimiter(RATE_LIMITS.authRegister)

export function isInternalRequest(req: Request): boolean {
  const internalIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1']
  return internalIps.includes(req.ip ?? '')
}

export function skipIfInternal(
  limiter: RequestHandler
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isInternalRequest(req)) return next()
    return limiter(req, res, next)
  }
}

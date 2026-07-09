import { redisConnections } from '../cache/redis-client'

const SLIDING_WINDOW_SCRIPT = `
local current_key = KEYS[1]
local previous_key = KEYS[2]
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])

-- Calculate elapsed fraction of current window (0.0 to 1.0)
local window_start_ms = now_ms - (now_ms % window_ms)
local elapsed_ms = now_ms - window_start_ms
local elapsed_fraction = elapsed_ms / window_ms

-- Get current counts (default 0 if keys don't exist)
local current_count = tonumber(redis.call('GET', current_key)) or 0
local previous_count = tonumber(redis.call('GET', previous_key)) or 0

-- Sliding window estimate:
-- Weight previous window by remaining fraction of current window
local estimated = math.floor(
  previous_count * (1 - elapsed_fraction) + current_count
)

-- Check if limit exceeded
if estimated >= limit then
  -- Return: [allowed=0, estimated, limit, retry_after_ms, current_count, previous_count]
  local retry_after = window_ms - elapsed_ms
  return {0, estimated, limit, retry_after, current_count, previous_count}
end

-- Increment current window counter
local new_count = redis.call('INCR', current_key)

-- Set TTL on first increment (keep key for 2 windows)
if new_count == 1 then
  redis.call('PEXPIRE', current_key, ttl_ms)
end

-- Return: [allowed=1, new_estimated, limit, 0, new_count, previous_count]
return {1, estimated + 1, limit, 0, new_count, previous_count}
`

// Load script once, reuse SHA for efficiency:
let SCRIPT_SHA: string | null = null

async function loadScript(): Promise<void> {
  SCRIPT_SHA = await redisConnections.rateLimiter.script(
    'LOAD', SLIDING_WINDOW_SCRIPT
  ) as string
}

export interface SlidingWindowResult {
  allowed: boolean
  limit: number
  remaining: number
  estimated: number
  retryAfterMs: number
  resetMs: number
  windowMs: number
}

export async function slidingWindowCheck(
  identifier: string,
  prefix: string,
  limit: number,
  windowMs: number
): Promise<SlidingWindowResult> {
  const nowMs = Date.now()
  // Align window to wall clock (e.g. 60s windows start at :00, :01 etc)
  const windowStart = nowMs - (nowMs % windowMs)

  // Key for current window
  const currentKey = `rl:${prefix}:${identifier}:${windowStart}`
  // Key for previous window
  const prevWindowStart = windowStart - windowMs
  const previousKey = `rl:${prefix}:${identifier}:${prevWindowStart}`

  // TTL: keep keys alive for 2 full windows
  const ttlMs = windowMs * 2

  try {
    // Load script if not loaded yet (or if Redis restarted)
    if (!SCRIPT_SHA) await loadScript()

    const result = await redisConnections.rateLimiter.evalsha(
      SCRIPT_SHA!,
      2,             // number of KEYS
      currentKey,
      previousKey,
      limit.toString(),
      windowMs.toString(),
      nowMs.toString(),
      ttlMs.toString()
    ) as number[]

    const [allowed, estimated, , retryAfterMs] = result

    return {
      allowed: allowed === 1,
      limit,
      remaining: Math.max(0, limit - estimated),
      estimated,
      retryAfterMs: allowed === 1 ? 0 : retryAfterMs,
      resetMs: windowMs - (nowMs % windowMs),
      windowMs,
    }
  } catch (err: any) {
    // If script not found (NOSCRIPT) after Redis restart, reload and retry:
    if (err.message?.includes('NOSCRIPT')) {
      SCRIPT_SHA = null
      await loadScript()
      return slidingWindowCheck(identifier, prefix, limit, windowMs)
    }

    // If Redis is completely down: ALLOW the request (fail open)
    // Failing closed would take down the entire platform
    console.error('[sliding-window] Redis error, failing open:', err.message)
    return {
      allowed: true,        // fail open
      limit,
      remaining: limit,
      estimated: 0,
      retryAfterMs: 0,
      resetMs: windowMs,
      windowMs,
    }
  }
}

export async function initSlidingWindow(): Promise<void> {
  // Call this on server startup
  try {
    await redisConnections.rateLimiter.connect().catch(() => {})
    await loadScript()
    console.log('[sliding-window] Lua script loaded')
  } catch (err: any) {
    console.warn('[sliding-window] Could not load Lua script:', err.message)
    // App continues — will retry on first request
  }
}

import Redis, { Redis as RedisType, RedisOptions } from 'ioredis'

const BASE_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB ?? '0', 10),

  // Connection management:
  connectTimeout: 10000,     // 10s to establish connection
  commandTimeout: 5000,      // 5s for any single command
  maxRetriesPerRequest: 3,   // retry failed commands 3 times
  enableReadyCheck: true,    // wait until Redis is truly ready

  // Reconnection strategy (exponential backoff):
  retryStrategy: (times: number): number | null => {
    if (times > 20) {
      console.error('[Redis] Too many reconnect attempts, giving up')
      return null  // stop retrying
    }
    const delay = Math.min(
      100 * Math.pow(2, times),  // exponential: 200, 400, 800...
      30000                       // cap at 30 seconds
    )
    console.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`)
    return delay
  },

  // Keep connection alive:
  keepAlive: 10000,          // TCP keepalive every 10s
  noDelay: true,             // disable Nagle algorithm

  // Lazy connect (don't fail on startup if Redis is down):
  lazyConnect: true,
}

function createRedisConnection(
  name: string,
  config: RedisOptions
): RedisType {
  const client = new Redis(config)

  client.on('connect', () =>
    console.log(`[Redis:${name}] Connected`)
  )
  client.on('ready', () =>
    console.log(`[Redis:${name}] Ready`)
  )
  client.on('error', (err: Error) =>
    console.error(`[Redis:${name}] Error:`, err.message)
    // Do NOT throw — errors are logged but not propagated
    // The app continues without Redis if needed
  )
  client.on('close', () =>
    console.warn(`[Redis:${name}] Connection closed`)
  )
  client.on('reconnecting', (delay: number) =>
    console.warn(`[Redis:${name}] Reconnecting in ${delay}ms`)
  )
  client.on('end', () =>
    console.error(`[Redis:${name}] Connection ended permanently`)
  )

  return client
}

export const redisConnections = {
  // Rate limiting: fast, critical path
  rateLimiter: createRedisConnection('rate-limiter', {
    ...BASE_CONFIG,
    db: 0,
    commandTimeout: 100,     // rate limiter must be FAST (100ms max)
    maxRetriesPerRequest: 1, // fail fast for rate limiting
  }),

  // Caching: scan results, manifests, GitHub API responses
  cache: createRedisConnection('cache', {
    ...BASE_CONFIG,
    db: 1,   // separate DB for cache (easy to flush without affecting queues or rate limit state)
    commandTimeout: 2000,
    maxRetriesPerRequest: 2,
  }),

  // Session storage / health check connection
  health: createRedisConnection('health', {
    ...BASE_CONFIG,
    db: 0,
    commandTimeout: 3000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  }),
}

export interface RedisHealth {
  connected: boolean
  latencyMs: number | null
  memoryUsedMb: number | null
  connectedClients: number | null
  uptime: number | null
  version: string | null
  error: string | null
}

export async function checkRedisHealth(): Promise<RedisHealth> {
  const start = Date.now()
  try {
    // Attempt connection
    await redisConnections.health.connect().catch(() => {})
    
    const pong = await Promise.race([
      redisConnections.health.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000)
      )
    ])

    if (pong !== 'PONG') throw new Error('Unexpected ping response')
    const latencyMs = Date.now() - start

    const info = await redisConnections.health.info('all')
    const parse = (key: string): string | null => {
      const match = info.match(new RegExp(`${key}:(\\S+)`))
      return match?.[1] ?? null
    }

    await redisConnections.health.disconnect()

    return {
      connected: true,
      latencyMs,
      memoryUsedMb: parse('used_memory')
        ? parseFloat(parse('used_memory')!) / (1024 * 1024) : null,
      connectedClients: parse('connected_clients')
        ? parseInt(parse('connected_clients')!, 10) : null,
      uptime: parse('uptime_in_seconds')
        ? parseInt(parse('uptime_in_seconds')!, 10) : null,
      version: parse('redis_version'),
      error: null,
    }
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      memoryUsedMb: null,
      connectedClients: null,
      uptime: null,
      version: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

export async function closeAllRedisConnections(): Promise<void> {
  await Promise.allSettled(
    Object.entries(redisConnections).map(async ([name, client]) => {
      try {
        await client.quit()
        console.log(`[Redis:${name}] Gracefully closed`)
      } catch {
        client.disconnect()
      }
    })
  )
}

// Register in process shutdown:
process.on('SIGTERM', async () => {
  await closeAllRedisConnections()
})
process.on('SIGINT', async () => {
  await closeAllRedisConnections()
})

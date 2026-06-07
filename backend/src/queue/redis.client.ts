import Redis, { RedisOptions } from 'ioredis'

// Track whether we've already logged the "Redis unavailable" warning
let redisUnavailableLogged = false

export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.length > 0 
    ? process.env.REDIS_PASSWORD 
    : undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  tls: process.env.REDIS_TLS === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times: number): number | null => {
    if (times >= 3) {
      if (!redisUnavailableLogged) {
        redisUnavailableLogged = true
        console.warn(
          `[Redis] Could not connect to Redis at ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'} after ${times} attempts. ` +
          `Queue features (scan-queue, analysis-queue, ai-queue) will be unavailable. ` +
          `To fix: install and start Redis, or run 'docker run -d --name redis -p 6379:6379 redis:7-alpine'.`
        )
      }
      return null
    }
    return Math.min(50 * Math.pow(2, times), 2000)
  },
  reconnectOnError: (err: Error): boolean => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
    return targetErrors.some(e => err.message.includes(e))
  }
}

export function createRedisConnection(name: string): Redis {
  const connection = new Redis(redisConfig)

  connection.on('connect', () => {
    redisUnavailableLogged = false // Reset on successful connect
    console.log(JSON.stringify({
      event: 'redis_connected',
      connection: name,
      host: redisConfig.host,
      port: redisConfig.port,
      timestamp: new Date().toISOString()
    }))
  })

  connection.on('ready', () => {
    console.log(JSON.stringify({
      event: 'redis_ready',
      connection: name,
      timestamp: new Date().toISOString()
    }))
  })

  // Suppress verbose AggregateError stack traces — log one-liner only
  connection.on('error', (_err: Error) => {
    // Only log if we haven't already warned about Redis being unavailable
    if (!redisUnavailableLogged) {
      // Will be logged by retryStrategy when max retries hit
    }
    // Silently swallow — prevents unhandled error crash and console spam
  })

  connection.on('close', () => {
    // Only log if Redis was previously connected (not on initial failure)
    if (!redisUnavailableLogged) {
      console.log(JSON.stringify({
        event: 'redis_closed',
        connection: name,
        timestamp: new Date().toISOString()
      }))
    }
  })

  // Suppress reconnecting logs when Redis is known to be down
  connection.on('reconnecting', (_delay: number) => {
    // Silenced — retryStrategy handles the warning
  })

  return connection
}

export const queueRedis = createRedisConnection('queue')

export const workerRedis = {
  scan:     () => createRedisConnection('scan-worker'),
  analysis: () => createRedisConnection('analysis-worker'),
  ai:       () => createRedisConnection('ai-worker')
}

export const schedulerRedis = createRedisConnection('scheduler')

export async function checkRedisHealth(): Promise<{
  healthy: boolean
  latencyMs: number
  host: string
  port: number
  error?: string
}> {
  const start = Date.now()
  try {
    const testConnection = createRedisConnection('health-check')
    await testConnection.connect()
    await testConnection.ping()
    const latencyMs = Date.now() - start
    await testConnection.quit()
    return { healthy: true, latencyMs, host: redisConfig.host as string, port: redisConfig.port as number }
  } catch (err: any) {
    return { healthy: false, latencyMs: Date.now() - start, host: redisConfig.host as string, port: redisConfig.port as number, error: err.message }
  }
}

export async function closeRedisConnections(): Promise<void> {
  const connections = [queueRedis, schedulerRedis]
  await Promise.allSettled(
    connections.map(conn =>
      conn.status === 'ready' ? conn.quit() : Promise.resolve()
    )
  )
  console.log(JSON.stringify({
    event: 'redis_connections_closed',
    timestamp: new Date().toISOString()
  }))
}

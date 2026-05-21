import Redis, { RedisOptions } from 'ioredis'

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
    if (times >= 10) {
      console.error(JSON.stringify({
        event: 'redis_retry_exhausted',
        attempts: times,
        timestamp: new Date().toISOString()
      }))
      return null
    }
    return Math.min(50 * Math.pow(2, times), 3000)
  },
  reconnectOnError: (err: Error): boolean => {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
    return targetErrors.some(e => err.message.includes(e))
  }
}

export function createRedisConnection(name: string): Redis {
  const connection = new Redis(redisConfig)

  connection.on('connect', () => {
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

  connection.on('error', (err: Error) => {
    console.error(JSON.stringify({
      event: 'redis_error',
      connection: name,
      error: err.message,
      timestamp: new Date().toISOString()
    }))
  })

  connection.on('close', () => {
    console.log(JSON.stringify({
      event: 'redis_closed',
      connection: name,
      timestamp: new Date().toISOString()
    }))
  })

  connection.on('reconnecting', (delay: number) => {
    console.log(JSON.stringify({
      event: 'redis_reconnecting',
      connection: name,
      delayMs: delay,
      timestamp: new Date().toISOString()
    }))
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

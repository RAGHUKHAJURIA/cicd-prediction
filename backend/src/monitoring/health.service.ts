/**
 * @file health.service.ts
 * @description System-wide health checks for Redis, PostgreSQL, queues, and runtime.
 *
 * Health checks are lightweight and non-blocking.
 * They NEVER interfere with worker processing.
 */

import { checkRedisHealth } from '../queue/redis.client'
import { scanQueue, analysisQueue, aiQueue } from '../queue/queue.definitions'
import { db } from '../db/client'
import { sql } from 'drizzle-orm'

// ── Types ───────────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'degraded' | 'down'

export interface ComponentHealth {
  status: HealthStatus
  latencyMs?: number
  error?: string
}

export interface SystemHealth {
  status: HealthStatus
  checks: {
    redis: ComponentHealth
    postgres: ComponentHealth
    queues: ComponentHealth & {
      scan?: { waiting: number; active: number; failed: number }
      analysis?: { waiting: number; active: number; failed: number }
      ai?: { waiting: number; active: number; failed: number }
    }
  }
  uptimeSeconds: number
  memory: {
    heapUsedMB: number
    heapTotalMB: number
    rssMB: number
    externalMB: number
  }
  timestamp: string
}

// ── HealthService ───────────────────────────────────────────────────────────

export class HealthService {
  private readonly startTime = Date.now()

  /**
   * Run all health checks and return aggregated system health.
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const [redis, postgres, queues] = await Promise.allSettled([
      this.checkRedis(),
      this.checkPostgres(),
      this.checkQueues()
    ])

    const redisHealth = redis.status === 'fulfilled' ? redis.value : { status: 'down' as const, error: 'Check failed' }
    const postgresHealth = postgres.status === 'fulfilled' ? postgres.value : { status: 'down' as const, error: 'Check failed' }
    const queuesHealth = queues.status === 'fulfilled' ? queues.value : { status: 'down' as const, error: 'Check failed' }

    const statuses = [redisHealth.status, postgresHealth.status, queuesHealth.status]
    let overallStatus: HealthStatus = 'healthy'
    if (statuses.includes('down')) {
      overallStatus = 'down'
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded'
    }

    const mem = process.memoryUsage()

    return {
      status: overallStatus,
      checks: {
        redis: redisHealth,
        postgres: postgresHealth,
        queues: queuesHealth
      },
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1048576 * 100) / 100,
        heapTotalMB: Math.round(mem.heapTotal / 1048576 * 100) / 100,
        rssMB: Math.round(mem.rss / 1048576 * 100) / 100,
        externalMB: Math.round(mem.external / 1048576 * 100) / 100
      },
      timestamp: new Date().toISOString()
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    try {
      const health = await checkRedisHealth()
      const result: ComponentHealth = {
        status: health.healthy ? 'healthy' : 'down',
        latencyMs: health.latencyMs
      }
      if (health.error) result.error = health.error
      return result
    } catch (err: any) {
      return { status: 'down', error: err.message }
    }
  }

  private async checkPostgres(): Promise<ComponentHealth> {
    const start = Date.now()
    try {
      await db.execute(sql`SELECT 1`)
      return { status: 'healthy', latencyMs: Date.now() - start }
    } catch (err: any) {
      return { status: 'down', latencyMs: Date.now() - start, error: err.message }
    }
  }

  private async checkQueues(): Promise<ComponentHealth & {
    scan?: { waiting: number; active: number; failed: number }
    analysis?: { waiting: number; active: number; failed: number }
    ai?: { waiting: number; active: number; failed: number }
  }> {
    try {
      const [scanCounts, analysisCounts, aiCounts] = await Promise.all([
        scanQueue.getJobCounts('waiting', 'active', 'failed'),
        analysisQueue.getJobCounts('waiting', 'active', 'failed'),
        aiQueue.getJobCounts('waiting', 'active', 'failed')
      ])

      const totalFailed = (scanCounts.failed || 0) + (analysisCounts.failed || 0) + (aiCounts.failed || 0)
      const status: HealthStatus = totalFailed > 50 ? 'degraded' : 'healthy'

      return {
        status,
        scan: { waiting: scanCounts.waiting || 0, active: scanCounts.active || 0, failed: scanCounts.failed || 0 },
        analysis: { waiting: analysisCounts.waiting || 0, active: analysisCounts.active || 0, failed: analysisCounts.failed || 0 },
        ai: { waiting: aiCounts.waiting || 0, active: aiCounts.active || 0, failed: aiCounts.failed || 0 }
      }
    } catch (err: any) {
      return { status: 'down', error: err.message }
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────────────────

export const healthService = new HealthService()

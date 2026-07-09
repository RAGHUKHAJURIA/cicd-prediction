/**
 * @file queue.routes.ts
 * @description Operational API routes for queue monitoring and management.
 *
 * Provides stats, failed job inspection, retry, and cleanup endpoints.
 */

import { Router, Request, Response } from 'express'
import { scanQueue, analysisQueue, aiQueue } from '../queue/queue.definitions'
import { checkRedisHealth } from '../queue/redis.client'
import { createRateLimiter } from '../middleware/rate-limiter'
import { RATE_LIMITS } from '../middleware/rate-limit-configs'
import { cacheManager } from '../cache/cache-manager'

const router = Router()

// ── GET /api/queue/stats ────────────────────────────────────────────────────

router.get('/stats', createRateLimiter(RATE_LIMITS.queueStats), async (_req: Request, res: Response): Promise<void> => {
  try {
    const cached = await cacheManager.getQueueStats()
    if (cached) {
      res.status(200).json({
        success: true,
        data: cached
      })
      return
    }

    const [scanCounts, analysisCounts, aiCounts, redisHealth] = await Promise.all([
      scanQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      analysisQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      aiQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      checkRedisHealth()
    ])

    const stats = {
      queues: {
        scan: scanCounts,
        analysis: analysisCounts,
        ai: aiCounts
      },
      redis: {
        healthy: redisHealth.healthy,
        latencyMs: redisHealth.latencyMs
      },
      timestamp: new Date().toISOString()
    }

    await cacheManager.setQueueStats(stats)

    res.status(200).json({
      success: true,
      data: stats
    })
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue stats',
      details: err.message
    })
  }
})

// ── GET /api/queue/failed ───────────────────────────────────────────────────

router.get('/failed', async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = Math.min(parseInt(req.query['limit'] as string) || 20, 100)

    const [scanFailed, analysisFailed, aiFailed] = await Promise.all([
      scanQueue.getFailed(0, limit),
      analysisQueue.getFailed(0, limit),
      aiQueue.getFailed(0, limit)
    ])

    const formatJob = (job: any, queue: string) => ({
      jobId: job.id,
      queue,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      stacktrace: job.stacktrace?.slice(0, 3)
    })

    res.status(200).json({
      success: true,
      data: {
        scan: scanFailed.map(j => formatJob(j, 'scan')),
        analysis: analysisFailed.map(j => formatJob(j, 'analysis')),
        ai: aiFailed.map(j => formatJob(j, 'ai')),
        total: scanFailed.length + analysisFailed.length + aiFailed.length
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── POST /api/queue/retry-failed ────────────────────────────────────────────

router.post('/retry-failed', async (req: Request, res: Response): Promise<void> => {
  try {
    const queueName = req.body?.queue as string | undefined
    const queuesToRetry = queueName
      ? [getQueueByName(queueName)]
      : [scanQueue, analysisQueue, aiQueue]

    let retried = 0
    for (const queue of queuesToRetry) {
      const failedJobs = await queue.getFailed(0, 1000)
      for (const job of failedJobs) {
        try {
          await job.retry()
          retried++
        } catch {
          // Job may have been removed or already retrying
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        retriedCount: retried,
        timestamp: new Date().toISOString()
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── DELETE /api/queue/clean ─────────────────────────────────────────────────

router.delete('/clean', async (req: Request, res: Response): Promise<void> => {
  try {
    const maxAgeMs = (parseInt(req.query['hours'] as string) || 24) * 60 * 60 * 1000
    const status = (req.query['status'] as string) || 'completed'

    if (!['completed', 'failed'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Status must be "completed" or "failed". Active jobs cannot be cleaned.'
      })
      return
    }

    const validStatus = status as 'completed' | 'failed'

    const [s1, s2, s3] = await Promise.all([
      scanQueue.clean(maxAgeMs, 1000, validStatus),
      analysisQueue.clean(maxAgeMs, 1000, validStatus),
      aiQueue.clean(maxAgeMs, 1000, validStatus)
    ])

    const totalCleaned = s1.length + s2.length + s3.length

    res.status(200).json({
      success: true,
      data: {
        cleaned: totalCleaned,
        scan: s1.length,
        analysis: s2.length,
        ai: s3.length,
        status,
        maxAgeHours: maxAgeMs / (60 * 60 * 1000),
        timestamp: new Date().toISOString()
      }
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function getQueueByName(name: string) {
  switch (name) {
    case 'scan': return scanQueue
    case 'analysis': return analysisQueue
    case 'ai': return aiQueue
    default: throw new Error(`Unknown queue: ${name}`)
  }
}

export default router

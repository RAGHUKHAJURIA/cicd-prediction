/**
 * @file metrics.service.ts
 * @description Operational metrics aggregation for queue throughput,
 * worker performance, cache hit ratios, and GitHub API usage.
 *
 * Metrics are stored in-memory with rolling windows.
 * They are lightweight and NEVER block workers.
 */

import { scanQueue, analysisQueue, aiQueue } from '../queue/queue.definitions'

// ── Types ───────────────────────────────────────────────────────────────────

export interface QueueMetrics {
  scan: QueueStats
  analysis: QueueStats
  ai: QueueStats
  totalJobsProcessed: number
  totalJobsFailed: number
  timestamp: string
}

export interface QueueStats {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  throughputPerHour: number
}

export interface PerformanceMetrics {
  scansPerHour: number
  averageScanDurationMs: number
  aiRequestsPerHour: number
  queueWaitTimeMs: number
  cacheHitRatio: number
  githubApiCalls: number
  retryCount: number
}

// ── In-Memory Counters ──────────────────────────────────────────────────────

class RollingCounter {
  private readonly entries: number[] = []
  private readonly windowMs: number

  constructor(windowMs: number = 3600000) { // 1 hour default
    this.windowMs = windowMs
  }

  increment(): void {
    this.entries.push(Date.now())
    this.prune()
  }

  count(): number {
    this.prune()
    return this.entries.length
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs
    while (this.entries.length > 0 && (this.entries[0] ?? 0) < cutoff) {
      this.entries.shift()
    }
  }
}

class RollingAverage {
  private readonly values: Array<{ value: number; time: number }> = []
  private readonly windowMs: number

  constructor(windowMs: number = 3600000) {
    this.windowMs = windowMs
  }

  add(value: number): void {
    this.values.push({ value, time: Date.now() })
    this.prune()
  }

  average(): number {
    this.prune()
    if (this.values.length === 0) return 0
    const sum = this.values.reduce((acc, v) => acc + v.value, 0)
    return Math.round(sum / this.values.length)
  }

  private prune(): void {
    const cutoff = Date.now() - this.windowMs
    while (this.values.length > 0 && (this.values[0]?.time ?? 0) < cutoff) {
      this.values.shift()
    }
  }
}

// ── MetricsService ──────────────────────────────────────────────────────────

export class MetricsService {
  private readonly scansCompleted = new RollingCounter()
  private readonly scanDurations = new RollingAverage()
  private readonly aiRequests = new RollingCounter()
  private readonly cacheHits = new RollingCounter()
  private readonly cacheMisses = new RollingCounter()
  private readonly githubCalls = new RollingCounter()
  private readonly retries = new RollingCounter()
  private readonly queueWaits = new RollingAverage()

  // ── Recording Methods ─────────────────────────────────────────────────

  recordScanCompleted(durationMs: number): void {
    this.scansCompleted.increment()
    this.scanDurations.add(durationMs)
  }

  recordAIRequest(): void {
    this.aiRequests.increment()
  }

  recordCacheHit(): void {
    this.cacheHits.increment()
  }

  recordCacheMiss(): void {
    this.cacheMisses.increment()
  }

  recordGitHubAPICall(): void {
    this.githubCalls.increment()
  }

  recordRetry(): void {
    this.retries.increment()
  }

  recordQueueWaitTime(waitMs: number): void {
    this.queueWaits.add(waitMs)
  }

  // ── Query Methods ─────────────────────────────────────────────────────

  getPerformanceMetrics(): PerformanceMetrics {
    const hits = this.cacheHits.count()
    const misses = this.cacheMisses.count()
    const total = hits + misses

    return {
      scansPerHour: this.scansCompleted.count(),
      averageScanDurationMs: this.scanDurations.average(),
      aiRequestsPerHour: this.aiRequests.count(),
      queueWaitTimeMs: this.queueWaits.average(),
      cacheHitRatio: total > 0 ? Math.round((hits / total) * 100) / 100 : 0,
      githubApiCalls: this.githubCalls.count(),
      retryCount: this.retries.count()
    }
  }

  async getQueueMetrics(): Promise<QueueMetrics> {
    const [scanCounts, analysisCounts, aiCounts] = await Promise.all([
      scanQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      analysisQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      aiQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
    ])

    return {
      scan: {
        waiting: scanCounts.waiting || 0,
        active: scanCounts.active || 0,
        completed: scanCounts.completed || 0,
        failed: scanCounts.failed || 0,
        delayed: scanCounts.delayed || 0,
        throughputPerHour: this.scansCompleted.count()
      },
      analysis: {
        waiting: analysisCounts.waiting || 0,
        active: analysisCounts.active || 0,
        completed: analysisCounts.completed || 0,
        failed: analysisCounts.failed || 0,
        delayed: analysisCounts.delayed || 0,
        throughputPerHour: 0
      },
      ai: {
        waiting: aiCounts.waiting || 0,
        active: aiCounts.active || 0,
        completed: aiCounts.completed || 0,
        failed: aiCounts.failed || 0,
        delayed: aiCounts.delayed || 0,
        throughputPerHour: this.aiRequests.count()
      },
      totalJobsProcessed: (scanCounts.completed || 0) + (analysisCounts.completed || 0) + (aiCounts.completed || 0),
      totalJobsFailed: (scanCounts.failed || 0) + (analysisCounts.failed || 0) + (aiCounts.failed || 0),
      timestamp: new Date().toISOString()
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────────────────

export const metricsService = new MetricsService()

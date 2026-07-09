import { queueRedis } from './redis.client'

export interface JobStatus {
  jobId: string
  queue: string
  name?: string
  status: 'queued' | 'active' | 'completed' | 'failed' | 'retrying' | 'cancelled'
  progress: number
  scanId?: string
  repoId?: string
  result?: unknown
  error?: {
    message: string
    stack?: string
    failedAt: string
  }
  createdAt: string
  startedAt?: string
  completedAt?: string
  updatedAt: string
}

const REDIS_TTL_SECONDS = 3 * 24 * 60 * 60 // 3 days

export class JobStatusTracker {
  private static getKey(jobId: string): string {
    return `job:status:${jobId}`
  }

  static async get(jobId: string): Promise<JobStatus | null> {
    const data = await queueRedis.get(this.getKey(jobId))
    if (!data) return null
    try {
      return JSON.parse(data) as JobStatus
    } catch {
      return null
    }
  }

  static async setQueued(params: {
    jobId: string
    queue: string
    name?: string
    scanId?: string
    repoId?: string
    createdAt?: string
  }): Promise<void> {
    const now = new Date().toISOString()
    const status: JobStatus = {
      jobId: params.jobId,
      queue: params.queue,
      status: 'queued',
      progress: 0,
      createdAt: params.createdAt ?? now,
      updatedAt: now
    }
    if (params.name) status.name = params.name
    if (params.scanId) status.scanId = params.scanId
    if (params.repoId) status.repoId = params.repoId
    await queueRedis.setex(this.getKey(params.jobId), REDIS_TTL_SECONDS, JSON.stringify(status))
  }

  static async setActive(jobId: string): Promise<void> {
    const status = await this.get(jobId)
    if (!status) return

    const now = new Date().toISOString()
    status.status = 'active'
    status.startedAt = status.startedAt ?? now
    status.updatedAt = now

    await queueRedis.setex(this.getKey(jobId), REDIS_TTL_SECONDS, JSON.stringify(status))
  }

  static async setProgress(jobId: string, progress: number): Promise<void> {
    const status = await this.get(jobId)
    if (!status) return

    status.progress = Math.max(0, Math.min(100, progress))
    status.updatedAt = new Date().toISOString()

    await queueRedis.setex(this.getKey(jobId), REDIS_TTL_SECONDS, JSON.stringify(status))
  }

  static async setCompleted(jobId: string, result?: unknown): Promise<void> {
    const status = await this.get(jobId)
    if (!status) return

    const now = new Date().toISOString()
    status.status = 'completed'
    status.progress = 100
    status.completedAt = now
    status.updatedAt = now
    if (result !== undefined) {
      status.result = result
    }

    await queueRedis.setex(this.getKey(jobId), REDIS_TTL_SECONDS, JSON.stringify(status))
  }

  static async setFailed(jobId: string, error: Error | string): Promise<void> {
    const status = await this.get(jobId)
    if (!status) return

    const now = new Date().toISOString()
    status.status = 'failed'
    status.updatedAt = now
    status.error = {
      message: error instanceof Error ? error.message : String(error),
      failedAt: now
    }
    if (error instanceof Error && error.stack) {
      status.error.stack = error.stack
    }

    await queueRedis.setex(this.getKey(jobId), REDIS_TTL_SECONDS, JSON.stringify(status))
  }

  static async setRetrying(jobId: string): Promise<void> {
    const status = await this.get(jobId)
    if (!status) return

    status.status = 'retrying'
    status.updatedAt = new Date().toISOString()

    await queueRedis.setex(this.getKey(jobId), REDIS_TTL_SECONDS, JSON.stringify(status))
  }

  static async setCancelled(jobId: string): Promise<void> {
    const status = await this.get(jobId)
    if (!status) return

    status.status = 'cancelled'
    status.updatedAt = new Date().toISOString()

    await queueRedis.setex(this.getKey(jobId), REDIS_TTL_SECONDS, JSON.stringify(status))
  }

  static async delete(jobId: string): Promise<void> {
    await queueRedis.del(this.getKey(jobId))
  }
}

export const jobStatusTracker = JobStatusTracker

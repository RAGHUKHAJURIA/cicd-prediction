import { Queue, QueueOptions, JobsOptions } from 'bullmq'
import { queueRedis } from './redis.client'
import { QUEUE_NAMES, JobPriority, SCAN_JOBS, ANALYSIS_JOBS, AI_JOBS } from './job.types'
import type {
  FetchAndParseJobPayload, RescanJobPayload,
  ParseSingleFileJobPayload, RunRulesJobPayload,
  ScoreRiskJobPayload, BuildReportJobPayload,
  ExplainScanJobPayload, ExplainFindingJobPayload,
  PredictFailuresJobPayload, GenerateRemediationsJobPayload,
  FullAIReportJobPayload, ScanJobResult, AnalysisJobResult, AIJobResult
} from './job.types'

const baseQueueOptions: QueueOptions = {
  connection: queueRedis,
  defaultJobOptions: {
    removeOnComplete: {
      age: 86400,
      count: 1000
    },
    removeOnFail: {
      age: 604800,
      count: 500
    }
  }
}

export const scanQueue = new Queue<any, any, string>(
  QUEUE_NAMES.SCAN,
  {
    ...baseQueueOptions,
    defaultJobOptions: {
      ...baseQueueOptions.defaultJobOptions,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    }
  }
)

export const scanQueueClient = {
  queue: scanQueue,

  async addFetchAndParseJob(
    payload: FetchAndParseJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await scanQueue.add(
      SCAN_JOBS.FETCH_AND_PARSE,
      payload,
      {
        jobId: `scan:${payload.scanId}:fetch`,
        priority: payload.priority,
        ...opts
      }
    )
    return job.id!
  },

  async addRescanJob(
    payload: RescanJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await scanQueue.add(
      SCAN_JOBS.RESCAN,
      payload,
      {
        jobId: `scan:${payload.newScanId}:rescan`,
        priority: payload.priority,
        ...opts
      }
    )
    return job.id!
  },

  async addParseSingleFileJob(
    payload: ParseSingleFileJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await scanQueue.add(
      SCAN_JOBS.PARSE_SINGLE,
      payload,
      {
        jobId: `scan:${payload.scanId}:parse:${payload.gitSha}`,
        ...opts
      }
    )
    return job.id!
  },

  async getJobStatus(jobId: string): Promise<{
    state: string | null
    progress: number
    result: ScanJobResult | undefined
    error: string | undefined
    attemptsMade: number
  }> {
    const job = await scanQueue.getJob(jobId)
    if (!job) return { state: null, progress: 0, result: undefined, error: undefined, attemptsMade: 0 }
    const state = await job.getState()
    return {
      state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue as ScanJobResult | undefined,
      error: job.failedReason,
      attemptsMade: job.attemptsMade
    }
  },

  async removeJob(jobId: string): Promise<boolean> {
    const job = await scanQueue.getJob(jobId)
    if (!job) return false
    await job.remove()
    return true
  }
}

export const analysisQueue = new Queue<any, any, string>(
  QUEUE_NAMES.ANALYSIS,
  {
    ...baseQueueOptions,
    defaultJobOptions: {
      ...baseQueueOptions.defaultJobOptions,
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 2000
      }
    }
  }
)

export const analysisQueueClient = {
  queue: analysisQueue,

  async addRunRulesJob(
    payload: RunRulesJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await analysisQueue.add(
      ANALYSIS_JOBS.RUN_RULES,
      payload,
      {
        jobId: `analysis:${payload.scanId}:rules`,
        priority: JobPriority.HIGH,
        ...opts
      }
    )
    return job.id!
  },

  async addScoreRiskJob(
    payload: ScoreRiskJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await analysisQueue.add(
      ANALYSIS_JOBS.SCORE_RISK,
      payload,
      {
        jobId: `analysis:${payload.scanId}:score`,
        ...opts
      }
    )
    return job.id!
  },

  async addBuildReportJob(
    payload: BuildReportJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await analysisQueue.add(
      ANALYSIS_JOBS.BUILD_REPORT,
      payload,
      {
        jobId: `analysis:${payload.scanId}:report`,
        ...opts
      }
    )
    return job.id!
  },

  async getJobStatus(jobId: string): Promise<{
    state: string | null
    progress: number
    result: AnalysisJobResult | undefined
    error: string | undefined
    attemptsMade: number
  }> {
    const job = await analysisQueue.getJob(jobId)
    if (!job) return { state: null, progress: 0, result: undefined, error: undefined, attemptsMade: 0 }
    const state = await job.getState()
    return {
      state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue as AnalysisJobResult | undefined,
      error: job.failedReason,
      attemptsMade: job.attemptsMade
    }
  }
}

export const aiQueue = new Queue<any, any, string>(
  QUEUE_NAMES.AI,
  {
    ...baseQueueOptions,
    defaultJobOptions: {
      ...baseQueueOptions.defaultJobOptions,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000
      }
    }
  }
)

export const aiQueueClient = {
  queue: aiQueue,

  async addExplainScanJob(
    payload: ExplainScanJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await aiQueue.add(
      AI_JOBS.EXPLAIN_SCAN,
      payload,
      {
        jobId: `ai:${payload.scanId}:explain-scan`,
        priority: JobPriority.NORMAL,
        ...opts
      }
    )
    return job.id!
  },

  async addExplainFindingJob(
    payload: ExplainFindingJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await aiQueue.add(
      AI_JOBS.EXPLAIN_FINDING,
      payload,
      {
        jobId: `ai:${payload.scanId}:explain:${payload.findingId}`,
        ...opts
      }
    )
    return job.id!
  },

  async addPredictFailuresJob(
    payload: PredictFailuresJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await aiQueue.add(
      AI_JOBS.PREDICT_FAILURES,
      payload,
      {
        jobId: `ai:${payload.scanId}:predict`,
        ...opts
      }
    )
    return job.id!
  },

  async addGenerateRemediationsJob(
    payload: GenerateRemediationsJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await aiQueue.add(
      AI_JOBS.GENERATE_REMEDIATIONS,
      payload,
      {
        jobId: `ai:${payload.scanId}:remediate`,
        ...opts
      }
    )
    return job.id!
  },

  async addFullAIReportJob(
    payload: FullAIReportJobPayload,
    opts?: Partial<JobsOptions>
  ): Promise<string> {
    const job = await aiQueue.add(
      AI_JOBS.FULL_AI_REPORT,
      payload,
      {
        jobId: `ai:${payload.scanId}:full-report`,
        priority: JobPriority.LOW,
        ...opts
      }
    )
    return job.id!
  },

  async getJobStatus(jobId: string): Promise<{
    state: string | null
    progress: number
    result: AIJobResult | undefined
    error: string | undefined
    attemptsMade: number
  }> {
    const job = await aiQueue.getJob(jobId)
    if (!job) {
      return {
        state: null,
        progress: 0,
        result: undefined,
        error: undefined,
        attemptsMade: 0
      }
    }
    const state = await job.getState()
    return {
      state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: job.returnvalue as AIJobResult | undefined,
      error: job.failedReason,
      attemptsMade: job.attemptsMade
    }
  },

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await aiQueue.getJob(jobId)
    if (!job) return false
    const state = await job.getState()
    if (state === 'active') return false
    await job.remove()
    return true
  }
}

export interface QueueMetrics {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: boolean
}

async function getQueueStats(queue: Queue): Promise<QueueMetrics> {
  const [waiting, active, completed, failed, delayed] =
    await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ])
  const isPaused = await queue.isPaused()
  return {
    name: queue.name,
    waiting, active, completed, failed, delayed,
    paused: isPaused
  }
}

export async function getQueueMetrics(): Promise<{
  scan: QueueMetrics
  analysis: QueueMetrics
  ai: QueueMetrics
}> {
  const [scan, analysis, ai] = await Promise.all([
    getQueueStats(scanQueue),
    getQueueStats(analysisQueue),
    getQueueStats(aiQueue)
  ])
  return { scan, analysis, ai }
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    scanQueue.close(),
    analysisQueue.close(),
    aiQueue.close()
  ])
  console.log(JSON.stringify({
    event: 'queues_closed',
    timestamp: new Date().toISOString()
  }))
}

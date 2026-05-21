import { Queue, JobsOptions } from 'bullmq'
import { scanQueue, analysisQueue, aiQueue } from './queue.definitions'
import { JobStatusTracker } from './job-status'
import { JobPriority, SCAN_JOBS, ANALYSIS_JOBS, AI_JOBS } from './job.types'
import type {
  FetchAndParseJobPayload,
  RescanJobPayload,
  RunRulesJobPayload,
  FullAIReportJobPayload
} from './job.types'
import { logger } from '../utils/logger'

export interface EnqueuedJobResult {
  jobId: string
  queue: string
  name: string
  status: 'queued'
  priority: number
  createdAt: string
}

const SCAN_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 5000
  },
  removeOnComplete: {
    age: 3600,
    count: 1000
  },
  removeOnFail: {
    age: 86400
  }
}

const ANALYSIS_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
}

const AI_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: {
    type: 'exponential',
    delay: 15000
  }
}

export async function enqueueScan(
  payload: FetchAndParseJobPayload
): Promise<EnqueuedJobResult> {
  if (!payload.repoId || !payload.scanId || !payload.owner || !payload.repoName) {
    throw new Error('Invalid payload: repoId, scanId, owner, and repoName are required')
  }

  const jobId = `scan:${payload.repoId}:${payload.scanId}`
  const queueName = 'scan-queue'
  const createdAt = new Date().toISOString()
  const priority = payload.priority ?? JobPriority.NORMAL

  await scanQueue.add(
    SCAN_JOBS.FETCH_AND_PARSE as any,
    payload,
    {
      jobId,
      priority,
      ...SCAN_JOB_OPTIONS
    }
  )

  await JobStatusTracker.setQueued({
    jobId,
    queue: queueName,
    name: SCAN_JOBS.FETCH_AND_PARSE,
    scanId: payload.scanId,
    repoId: payload.repoId,
    createdAt
  })

  logger.info({
    event: 'scan_job_enqueued',
    jobId,
    scanId: payload.scanId,
    repoId: payload.repoId,
    branch: payload.branch,
    priority,
    timestamp: createdAt
  }, 'Scan job enqueued')

  return {
    jobId,
    queue: queueName,
    name: SCAN_JOBS.FETCH_AND_PARSE,
    status: 'queued',
    priority,
    createdAt
  }
}

export async function enqueueAnalysis(
  payload: RunRulesJobPayload
): Promise<EnqueuedJobResult> {
  if (!payload.scanId || !payload.repoId) {
    throw new Error('Invalid payload: scanId and repoId are required')
  }

  const jobId = `analysis:${payload.scanId}`
  const queueName = 'analysis-queue'
  const priority = JobPriority.NORMAL
  const createdAt = new Date().toISOString()

  await analysisQueue.add(
    ANALYSIS_JOBS.RUN_RULES as any,
    payload,
    {
      jobId,
      priority,
      ...ANALYSIS_JOB_OPTIONS
    }
  )

  await JobStatusTracker.setQueued({
    jobId,
    queue: queueName,
    name: ANALYSIS_JOBS.RUN_RULES,
    scanId: payload.scanId,
    repoId: payload.repoId,
    createdAt
  })

  logger.info({
    event: 'analysis_job_enqueued',
    jobId,
    scanId: payload.scanId,
    repoId: payload.repoId,
    priority,
    timestamp: createdAt
  }, 'Analysis job enqueued')

  return {
    jobId,
    queue: queueName,
    name: ANALYSIS_JOBS.RUN_RULES,
    status: 'queued',
    priority,
    createdAt
  }
}

export async function enqueueAI(
  payload: FullAIReportJobPayload
): Promise<EnqueuedJobResult> {
  if (!payload.scanId || !payload.repoId) {
    throw new Error('Invalid payload: scanId and repoId are required')
  }

  const jobId = `ai:${payload.scanId}`
  const queueName = 'ai-queue'
  const createdAt = new Date().toISOString()
  const priority = JobPriority.NORMAL

  await aiQueue.add(
    AI_JOBS.FULL_AI_REPORT as any,
    payload,
    {
      jobId,
      priority,
      ...AI_JOB_OPTIONS
    }
  )

  await JobStatusTracker.setQueued({
    jobId,
    queue: queueName,
    name: AI_JOBS.FULL_AI_REPORT,
    scanId: payload.scanId,
    repoId: payload.repoId,
    createdAt
  })

  logger.info({
    event: 'ai_job_enqueued',
    jobId,
    scanId: payload.scanId,
    repoId: payload.repoId,
    priority,
    timestamp: createdAt
  }, 'AI job enqueued')

  return {
    jobId,
    queue: queueName,
    name: AI_JOBS.FULL_AI_REPORT,
    status: 'queued',
    priority,
    createdAt
  }
}

export async function enqueueBulkScans(
  payloads: FetchAndParseJobPayload[]
): Promise<EnqueuedJobResult[]> {
  const jobsToAdd = payloads.map(payload => {
    if (!payload.repoId || !payload.scanId || !payload.owner || !payload.repoName) {
      throw new Error('Invalid payload: repoId, scanId, owner, and repoName are required')
    }

    const jobId = `scan:${payload.repoId}:${payload.scanId}`
    const priority = payload.priority ?? JobPriority.NORMAL
    
    return {
      name: SCAN_JOBS.FETCH_AND_PARSE as any,
      data: payload,
      opts: {
        jobId,
        priority,
        ...SCAN_JOB_OPTIONS
      }
    }
  })

  const addedJobs = await scanQueue.addBulk(jobsToAdd)
  const results: EnqueuedJobResult[] = []

  const createdAt = new Date().toISOString()
  const queueName = 'scan-queue'

  for (let i = 0; i < addedJobs.length; i++) {
    const job = addedJobs[i]
    if (!job) continue

    const payload = payloads[i]
    if (!payload) continue
    
    const jobId = job.opts.jobId ?? job.id ?? `scan:${payload.repoId}:${payload.scanId}`
    const priority = payload.priority ?? JobPriority.NORMAL

    await JobStatusTracker.setQueued({
      jobId,
      queue: queueName,
      name: SCAN_JOBS.FETCH_AND_PARSE,
      scanId: payload.scanId,
      repoId: payload.repoId,
      createdAt
    })

    logger.info({
      event: 'scan_job_enqueued_bulk',
      jobId,
      scanId: payload.scanId,
      repoId: payload.repoId,
      branch: payload.branch,
      priority,
      timestamp: createdAt
    }, 'Bulk scan job enqueued')

    results.push({
      jobId,
      queue: queueName,
      name: SCAN_JOBS.FETCH_AND_PARSE,
      status: 'queued',
      priority,
      createdAt
    })
  }

  return results
}

function getQueueByName(queueName: string): Queue<any, any, string> {
  switch (queueName) {
    case 'scan-queue': return scanQueue
    case 'analysis-queue': return analysisQueue
    case 'ai-queue': return aiQueue
    default: throw new Error(`Unknown queue: ${queueName}`)
  }
}

export async function cancelJob(
  queueName: string,
  jobId: string
): Promise<boolean> {
  const queue = getQueueByName(queueName)
  const job = await queue.getJob(jobId)
  
  if (!job) return false
  
  const state = await job.getState()
  if (state === 'waiting' || state === 'delayed') {
    await job.remove()
    await JobStatusTracker.setCancelled(jobId)
    return true
  }
  
  return false
}

export async function retryJob(
  queueName: string,
  jobId: string
): Promise<boolean> {
  const queue = getQueueByName(queueName)
  const job = await queue.getJob(jobId)
  
  if (!job) return false
  
  const state = await job.getState()
  if (state === 'failed') {
    await job.retry()
    await JobStatusTracker.setRetrying(jobId)
    return true
  }
  
  return false
}

// Added missing producer for rescan 
export async function enqueueRescan(
  payload: RescanJobPayload
): Promise<EnqueuedJobResult> {
  if (!payload.repoId || !payload.newScanId || !payload.originalScanId) {
    throw new Error('Invalid payload: repoId, originalScanId, and newScanId are required')
  }

  const jobId = `scan:${payload.repoId}:${payload.newScanId}:rescan`
  const queueName = 'scan-queue'
  const createdAt = new Date().toISOString()
  const priority = payload.priority ?? JobPriority.NORMAL

  await scanQueue.add(
    SCAN_JOBS.RESCAN as any,
    payload,
    {
      jobId,
      priority,
      ...SCAN_JOB_OPTIONS
    }
  )

  await JobStatusTracker.setQueued({
    jobId,
    queue: queueName,
    name: SCAN_JOBS.RESCAN,
    scanId: payload.newScanId,
    repoId: payload.repoId,
    createdAt
  })

  logger.info({
    event: 'rescan_job_enqueued',
    jobId,
    scanId: payload.newScanId,
    originalScanId: payload.originalScanId,
    repoId: payload.repoId,
    branch: payload.branch,
    priority,
    timestamp: createdAt
  }, 'Rescan job enqueued')

  return {
    jobId,
    queue: queueName,
    name: SCAN_JOBS.RESCAN,
    status: 'queued',
    priority,
    createdAt
  }
}

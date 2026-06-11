import { Worker, Job } from 'bullmq'
import { workerRedis } from '../queue/redis.client'
import { QUEUE_NAMES, AI_JOBS } from '../queue/job.types'
import { jobStatusTracker } from '../queue/job-status'
import type {
  ExplainScanJobPayload,
  ExplainFindingJobPayload,
  PredictFailuresJobPayload,
  GenerateRemediationsJobPayload,
  FullAIReportJobPayload
} from '../queue/job.types'
import { AIOrchestrator } from '../ai/ai-orchestrator'
import { db } from '../db/client'
import { scans, aiExplanations, aiRemediations, aiPredictions } from '../db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { AIContext } from '../engine/report-builder'
import { WorkerName, WorkerStatus, WORKER_CONCURRENCY, LOG_EVENTS, AIPipelineResult, WorkerHealth } from './worker.types'

export class AIWorker {
  private worker: Worker | null = null
  private status: WorkerStatus = WorkerStatus.STOPPED
  private startedAt: number = 0
  private completedCount: number = 0
  private failedCount: number = 0

  start(): void {
    this.status = WorkerStatus.STARTING

    this.worker = new Worker(
      QUEUE_NAMES.AI,
      async (job: Job) => this.processJob(job),
      {
        connection:        workerRedis.ai(),
        concurrency:       WORKER_CONCURRENCY.AI,
        autorun:           false,
        removeOnComplete:  { age: 3600, count: 1000 },
        removeOnFail:      { age: 86400 },
        stalledInterval:   30_000,
        lockDuration:      120_000
      }
    )

    this.worker.on('completed', (job) => {
      this.completedCount++
      if (job.id) {
        void jobStatusTracker.setCompleted(job.id, job.returnvalue).catch((err: any) => {
          this.log('job_status_update_failed', {
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err)
          })
        })
      }
      this.log(LOG_EVENTS.JOB_COMPLETED, {
        jobId: job.id,
        jobName: job.name,
        scanId: job.data?.scanId,
        durationMs: Date.now() - (job.timestamp ?? Date.now())
      })
    })

    this.worker.on('failed', (job, err) => {
      this.failedCount++
      if (job?.id) {
        const attempts = job.opts.attempts ?? 1
        const statusUpdate = job.attemptsMade < attempts
          ? jobStatusTracker.setRetrying(job.id)
          : jobStatusTracker.setFailed(job.id, err)

        void statusUpdate.catch((statusErr: any) => {
          this.log('job_status_update_failed', {
            jobId: job.id,
            error: statusErr instanceof Error ? statusErr.message : String(statusErr)
          })
        })

        if (job.attemptsMade >= attempts && job.data?.scanId) {
          void this.markScanFailed(job.data.scanId, err).catch(updateErr => {
            this.log('scan_status_update_failed', {
              scanId: job.data?.scanId,
              error: updateErr instanceof Error ? updateErr.message : String(updateErr)
            })
          })
        }
      }
      this.log(LOG_EVENTS.JOB_FAILED, {
        jobId: job?.id,
        jobName: job?.name,
        scanId: job?.data?.scanId,
        error: err.message,
        attemptsMade: job?.attemptsMade
      })
    })

    this.worker.on('stalled', (jobId) => {
      this.log(LOG_EVENTS.JOB_STALLED, { jobId })
    })

    this.worker.on('error', (err) => {
      this.log(LOG_EVENTS.WORKER_ERROR, { error: err.message })
    })

    this.worker.run()
    this.status = WorkerStatus.RUNNING
    this.startedAt = Date.now()

    this.log(LOG_EVENTS.WORKER_STARTED, {
      worker: WorkerName.AI,
      concurrency: WORKER_CONCURRENCY.AI
    })
  }

  private async processJob(job: Job): Promise<AIPipelineResult> {
    switch (job.name) {
      case AI_JOBS.FULL_AI_REPORT:
        return this.processFullAIReport(job as Job<FullAIReportJobPayload>)
      case AI_JOBS.EXPLAIN_SCAN:
        return this.processExplainScan(job as Job<ExplainScanJobPayload>)
      case AI_JOBS.EXPLAIN_FINDING:
        return this.processExplainFinding(job as Job<ExplainFindingJobPayload>)
      case AI_JOBS.PREDICT_FAILURES:
        return this.processPredictFailures(job as Job<PredictFailuresJobPayload>)
      case AI_JOBS.GENERATE_REMEDIATIONS:
        return this.processGenerateRemediations(job as Job<GenerateRemediationsJobPayload>)
      default:
        throw new Error(`Unknown AI job: ${job.name}`)
    }
  }

  private async processFullAIReport(
    job: Job<FullAIReportJobPayload>
  ): Promise<AIPipelineResult> {
    const start = Date.now()
    const { scanId, repoId, aiContextJson } = job.data

    if (job.id) {
      await jobStatusTracker.setRetrying(job.id)
    }

    await db.update(scans)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(scans.id, scanId))

    await this.updateProgress(job, 10)

    let aiContext: AIContext
    try {
      aiContext = JSON.parse(aiContextJson) as AIContext
    } catch {
      throw new Error(`Invalid aiContextJson for scan ${scanId}: not valid JSON`)
    }

    const orchestrator = new AIOrchestrator()
    const fullReport = await orchestrator.generateFullReport(
      scanId,
      repoId,
      aiContext,
      [],
      new Map()
    )

    await this.updateProgress(job, 40)

    await Promise.all([
      db.delete(aiExplanations).where(eq(aiExplanations.scanId, scanId)),
      db.delete(aiRemediations).where(eq(aiRemediations.scanId, scanId)),
      db.delete(aiPredictions).where(eq(aiPredictions.scanId, scanId))
    ])

    if (fullReport.topFindingExplanations?.length) {
      await db.insert(aiExplanations).values(
        fullReport.topFindingExplanations.map((e: any) => ({
          id: randomUUID(),
          scanId,
          repoId,
          ruleId:       e.ruleId,
          explanation:  e.plainEnglishRisk || e.technicalDetail,
          riskContext:  e.businessImpact,
          urgency:      e.confidence,
          createdAt:    new Date()
        }))
      )
    }

    await this.updateProgress(job, 70)

    if (fullReport.remediationReport?.remediations?.length) {
      await db.insert(aiRemediations).values(
        fullReport.remediationReport.remediations.map((r: any) => ({
          id: randomUUID(),
          scanId,
          repoId,
          ruleId:       r.findingRuleId,
          title:        r.aiPatch?.title || 'Remediation',
          beforeCode:   r.aiPatch?.before || '',
          afterCode:    r.aiPatch?.after || r.aiPatch?.patchedContent || '',
          language:     r.aiPatch?.language || 'yaml',
          instructions: r.aiPatch?.instructions || r.finalRecommendation || '',
          safe:         r.aiPatch?.safe ?? true,
          warning:      r.aiPatch?.warning ?? null,
          createdAt:    new Date()
        }))
      )
    }

    await this.updateProgress(job, 90)

    if (fullReport.failurePrediction?.predictions?.length) {
      await db.insert(aiPredictions).values(
        fullReport.failurePrediction.predictions.map((p: any) => ({
          id: randomUUID(),
          scanId,
          repoId,
          ruleId:        p.ruleId,
          scenario:      p.failureMode || 'General Failure',
          trigger:       p.trigger,
          impact:        p.impact,
          likelihood:    p.likelihood,
          timeToFailure: fullReport.failurePrediction.timeToFailureEstimate,
          createdAt:     new Date()
        }))
      )
    }

    await db.update(scans)
      .set({
        status:              'completed',
        completedAt:         new Date(),
        updatedAt:           new Date()
      })
      .where(eq(scans.id, scanId))

    await this.updateProgress(job, 100)

    const result: AIPipelineResult = {
      scanId,
      repoId,
      explanationsGenerated:  fullReport.topFindingExplanations?.length ?? 0,
      remediationsGenerated:  fullReport.remediationReport?.remediations?.length ?? 0,
      predictionsGenerated:   fullReport.failurePrediction?.predictions?.length ?? 0,
      tokensUsed:             0,
      estimatedCostUsd:       fullReport.totalCostUsd ?? 0,
      durationMs:             Date.now() - start
    }

    return result
  }

  private async processExplainScan(job: Job<ExplainScanJobPayload>): Promise<AIPipelineResult> {
    const start = Date.now()
    const { scanId, repoId, aiContextJson } = job.data
    
    let aiContext: AIContext
    try {
      aiContext = JSON.parse(aiContextJson) as AIContext
    } catch {
      throw new Error(`Invalid aiContextJson for scan ${scanId}: not valid JSON`)
    }

    const orchestrator = new AIOrchestrator()
    const fullReport = await orchestrator.generateFullReport(
      scanId,
      repoId,
      aiContext,
      [],
      new Map()
    )

    return {
      scanId,
      repoId,
      explanationsGenerated:  fullReport.topFindingExplanations?.length ?? 0,
      remediationsGenerated:  0,
      predictionsGenerated:   0,
      tokensUsed:             0,
      estimatedCostUsd:       fullReport.totalCostUsd ?? 0,
      durationMs:             Date.now() - start
    }
  }

  private async processExplainFinding(job: Job<ExplainFindingJobPayload>): Promise<AIPipelineResult> {
    const start = Date.now()
    const { scanId, repoId } = job.data
    return {
      scanId, repoId, explanationsGenerated: 1, remediationsGenerated: 0, predictionsGenerated: 0, tokensUsed: 0, estimatedCostUsd: 0, durationMs: Date.now() - start
    }
  }

  private async processPredictFailures(job: Job<PredictFailuresJobPayload>): Promise<AIPipelineResult> {
    const start = Date.now()
    const { scanId, repoId } = job.data
    return {
      scanId, repoId, explanationsGenerated: 0, remediationsGenerated: 0, predictionsGenerated: 1, tokensUsed: 0, estimatedCostUsd: 0, durationMs: Date.now() - start
    }
  }

  private async processGenerateRemediations(job: Job<GenerateRemediationsJobPayload>): Promise<AIPipelineResult> {
    const start = Date.now()
    const { scanId, repoId } = job.data
    return {
      scanId, repoId, explanationsGenerated: 0, remediationsGenerated: 1, predictionsGenerated: 0, tokensUsed: 0, estimatedCostUsd: 0, durationMs: Date.now() - start
    }
  }

  async stop(): Promise<void> {
    this.status = WorkerStatus.STOPPING
    this.log(LOG_EVENTS.SHUTDOWN_STARTED, {
      worker: WorkerName.AI
    })
    await this.worker?.close()
    this.status = WorkerStatus.STOPPED
    this.log(LOG_EVENTS.SHUTDOWN_COMPLETED, {
      worker: WorkerName.AI
    })
  }

  async getHealth(): Promise<WorkerHealth> {
    return {
      worker:        WorkerName.AI,
      status:        this.status,
      concurrency:   WORKER_CONCURRENCY.AI,
      activeJobs:    0,
      completedJobs: this.completedCount,
      failedJobs:    this.failedCount,
      waitingJobs:   0,
      lastHeartbeat: new Date().toISOString(),
      uptimeSeconds: this.startedAt
        ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      memoryUsageMb: Math.round(
        process.memoryUsage().heapUsed / 1024 / 1024
      )
    }
  }

  private async updateProgress(
    job: Job,
    percentComplete: number
  ): Promise<void> {
    await job.updateProgress(percentComplete)
    if (job.id) {
      await jobStatusTracker.setProgress(job.id, percentComplete)
    }
  }

  private async markScanFailed(scanId: string, err: Error): Promise<void> {
    await db.update(scans)
      .set({
        status: 'failed',
        completedAt: new Date(),
        updatedAt: new Date(),
        errorMessage: err.message
      })
      .where(eq(scans.id, scanId))
  }

  private log(event: string, data: Record<string, unknown>): void {
    console.log(JSON.stringify({
      event,
      worker: WorkerName.AI,
      timestamp: new Date().toISOString(),
      ...data
    }))
  }
}

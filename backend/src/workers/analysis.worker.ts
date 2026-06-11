import { Worker, Job } from 'bullmq'
import { workerRedis } from '../queue/redis.client'
import { QUEUE_NAMES, ANALYSIS_JOBS } from '../queue/job.types'
import type {
  RunRulesJobPayload
} from '../queue/job.types'
import { enqueueAI } from '../queue/producers'
import { jobStatusTracker } from '../queue/job-status'
import { AnalysisEngine } from '../engine/analysis-engine'
import { ReportBuilder } from '../engine/report-builder'
import { db } from '../db/client'
import { parsedArtifacts, scans, findings, analysisReports } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'
import { WorkerName, WorkerStatus, WORKER_CONCURRENCY, LOG_EVENTS, AnalysisPipelineResult, WorkerHealth } from './worker.types'
import { randomUUID } from 'crypto'
import type { NormalizedWorkflow } from '../models/workflow.model'
import type { RuleSeverity } from '../rules/types'

const AI_SCORE_THRESHOLD = 40

export class AnalysisWorker {
  private worker: Worker | null = null
  private status: WorkerStatus = WorkerStatus.STOPPED
  private startedAt: number = 0
  private completedCount: number = 0
  private failedCount: number = 0

  start(): void {
    this.status = WorkerStatus.STARTING

    this.worker = new Worker(
      QUEUE_NAMES.ANALYSIS,
      async (job: Job) => this.processJob(job),
      {
        connection:        workerRedis.analysis(),
        concurrency:       WORKER_CONCURRENCY.ANALYSIS,
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
      worker: WorkerName.ANALYSIS,
      concurrency: WORKER_CONCURRENCY.ANALYSIS
    })
  }

  private async processJob(job: Job): Promise<AnalysisPipelineResult> {
    switch (job.name) {
      case ANALYSIS_JOBS.RUN_RULES:
      case ANALYSIS_JOBS.SCORE_RISK:
      case ANALYSIS_JOBS.BUILD_REPORT:
        return this.processRunRules(job as Job<RunRulesJobPayload>)
      default:
        throw new Error(`Unknown analysis job: ${job.name}`)
    }
  }

  private async processRunRules(
    job: Job<RunRulesJobPayload>
  ): Promise<AnalysisPipelineResult> {
    const start = Date.now()
    const { scanId, repoId, parsedArtifactIds } = job.data

    if (job.id) {
      await jobStatusTracker.setActive(job.id)
    }

    await db.update(scans)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(scans.id, scanId))

    await this.updateProgress(job, 10)

    const artifacts = await db
      .select()
      .from(parsedArtifacts)
      .where(inArray(parsedArtifacts.id, parsedArtifactIds))

    if (!artifacts.length) {
      throw new Error(
        `No parsed artifacts found for scan ${scanId}. ` +
        `IDs: ${parsedArtifactIds.join(', ')}`
      )
    }

    const workflows: NormalizedWorkflow[] = artifacts
      .map(a => {
        try {
          if (!a.normalizedWorkflow) return null
          return typeof a.normalizedWorkflow === 'string'
            ? JSON.parse(a.normalizedWorkflow) as NormalizedWorkflow
            : a.normalizedWorkflow as NormalizedWorkflow
        } catch {
          this.log('artifact_deserialize_failed', {
            scanId, artifactId: a.id, filePath: a.filePath
          })
          return null
        }
      })
      .filter((w): w is NormalizedWorkflow => w !== null)

    const engine = new AnalysisEngine()
    const analysisInput = {
      scanId,
      repoId,
      workflows
    }
    const analysisReport = await engine.analyze(analysisInput)

    await this.updateProgress(job, 60)

    await db.delete(findings).where(eq(findings.scanId, scanId))

    const findingRows = analysisReport.findings.all.map((f: any) => ({
      id:          randomUUID(),
      scanId,
      repoId,
      ruleId:      f.ruleId,
      title:       f.title,
      description: f.description || f.message || '',
      severity:    f.severity,
      category:    f.category,
      filePath:    f.location?.filePath || '',
      line:        f.location?.line || null,
      field:       f.location?.field || null,
      remediation: f.remediation,
      createdAt:   new Date()
    }))

    if (findingRows.length > 0) {
      await db.insert(findings).values(findingRows)
    }

    await this.updateProgress(job, 75)

    await db.delete(analysisReports)
      .where(eq(analysisReports.scanId, scanId))

    await db.insert(analysisReports).values({
      id: randomUUID(),
      scanId,
      repoId,
      overallScore:  analysisReport.summary.score,
      riskGrade:     analysisReport.summary.grade,
      criticalCount: analysisReport.summary.findingsBySeverity['critical' as RuleSeverity] ?? 0,
      highCount:     analysisReport.summary.findingsBySeverity['high' as RuleSeverity] ?? 0,
      mediumCount:   analysisReport.summary.findingsBySeverity['medium' as RuleSeverity] ?? 0,
      lowCount:      analysisReport.summary.findingsBySeverity['low' as RuleSeverity] ?? 0,
      reportJson:    JSON.stringify(analysisReport),
      createdAt:     new Date()
    })

    await db.update(scans)
      .set({
        totalFindings: findingRows.length,
        criticalCount: analysisReport.summary.findingsBySeverity['critical' as RuleSeverity] ?? 0,
        highCount:     analysisReport.summary.findingsBySeverity['high' as RuleSeverity] ?? 0,
        mediumCount:   analysisReport.summary.findingsBySeverity['medium' as RuleSeverity] ?? 0,
        lowCount:      analysisReport.summary.findingsBySeverity['low' as RuleSeverity] ?? 0,
        updatedAt:     new Date()
      })
      .where(eq(scans.id, scanId))

    await this.updateProgress(job, 90)

    const shouldRunAI = (
      analysisReport.summary.score >= AI_SCORE_THRESHOLD ||
      (analysisReport.summary.findingsBySeverity['critical' as RuleSeverity] ?? 0) > 0
    )

    let queuedAI = false
    if (shouldRunAI) {
      const reportBuilder = new ReportBuilder()
      const aiContext = reportBuilder.buildAIContext(
        repoId,
        scanId,
        analysisReport.summary,
        analysisReport.findings,
        analysisReport.remediationPlan
      )

      await enqueueAI({
        scanId,
        repoId,
        aiContextJson:          JSON.stringify(aiContext),
        findingsJson:           JSON.stringify(analysisReport.findings),
        workflowContentsJson:   JSON.stringify({}),
        includeRemediation:     true,
        maxFindings:            20
      })

      this.log(LOG_EVENTS.PIPELINE_ENQUEUED, {
        scanId, nextStage: 'ai',
        reason: analysisReport.summary.score >= AI_SCORE_THRESHOLD
          ? `score=${analysisReport.summary.score}`
          : 'critical_findings'
      })
      queuedAI = true
    } else {
      await db.update(scans)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(scans.id, scanId))
      this.log('scan_completed_no_ai', {
        scanId, score: analysisReport.summary.score
      })
    }

    await this.updateProgress(job, 100)

    const result: AnalysisPipelineResult = {
      scanId,
      repoId,
      findingsCount: findingRows.length,
      criticalCount: analysisReport.summary.findingsBySeverity['critical' as RuleSeverity] ?? 0,
      highCount:     analysisReport.summary.findingsBySeverity['high' as RuleSeverity] ?? 0,
      overallScore:  analysisReport.summary.score,
      riskGrade:     analysisReport.summary.grade,
      queuedAI,
      durationMs:    Date.now() - start
    }

    return result
  }

  async stop(): Promise<void> {
    this.status = WorkerStatus.STOPPING
    this.log(LOG_EVENTS.SHUTDOWN_STARTED, {
      worker: WorkerName.ANALYSIS
    })
    await this.worker?.close()
    this.status = WorkerStatus.STOPPED
    this.log(LOG_EVENTS.SHUTDOWN_COMPLETED, {
      worker: WorkerName.ANALYSIS
    })
  }

  async getHealth(): Promise<WorkerHealth> {
    return {
      worker:        WorkerName.ANALYSIS,
      status:        this.status,
      concurrency:   WORKER_CONCURRENCY.ANALYSIS,
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
      worker: WorkerName.ANALYSIS,
      timestamp: new Date().toISOString(),
      ...data
    }))
  }
}

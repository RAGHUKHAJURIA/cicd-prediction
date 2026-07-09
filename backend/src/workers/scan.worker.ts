import { Worker, Job } from 'bullmq'
import { workerRedis, queueRedis } from '../queue/redis.client'
import { QUEUE_NAMES, SCAN_JOBS } from '../queue/job.types'
import type {
  FetchAndParseJobPayload,
  RescanJobPayload,
  ParseSingleFileJobPayload
} from '../queue/job.types'
import { enqueueAnalysis } from '../queue/producers'
import { jobStatusTracker } from '../queue/job-status'
import { GitHubClient } from '../utils/github.client'
import { detectAndParse, detectFileType } from '../parsers'
import { db } from '../db/client'
import { parsedArtifacts, scans } from '../db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { WorkerName, WorkerStatus, WORKER_CONCURRENCY, LOG_EVENTS, ScanPipelineResult, WorkerHealth } from './worker.types'

const MAX_CONCURRENT_FILE_FETCHES = 5

const CI_FILE_PATTERNS: string[] = [
  '.github/workflows',
  'Dockerfile',
  'docker-compose',
  'k8s/',
  'helm/',
  'kubernetes/',
  'Jenkinsfile',
  '.gitlab-ci.yml',
  'circle.yml',
  '.circleci/',
  '.travis.yml',
  'bitbucket-pipelines.yml',
  'azure-pipelines.yml'
]

export function isCIFile(filePath: string): boolean {
  return CI_FILE_PATTERNS.some(pattern => filePath.includes(pattern))
}

export async function batchWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency)
    const chunkResults = await Promise.allSettled(chunk.map(fn))
    results.push(...chunkResults)
  }
  return results
}

export class ScanWorker {
  private worker: Worker | null = null
  private status: WorkerStatus = WorkerStatus.STOPPED
  private startedAt: number = 0
  private completedCount: number = 0
  private failedCount: number = 0

  start(): void {
    this.status = WorkerStatus.STARTING

    this.worker = new Worker(
      QUEUE_NAMES.SCAN,
      async (job: Job) => this.processJob(job),
      {
        connection:        workerRedis.scan(),
        concurrency:       WORKER_CONCURRENCY.SCAN,
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

    this.worker.on('failed', (job: Job | undefined, err: any) => {
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

        if (job.attemptsMade >= attempts) {
          const scanId = job.data?.scanId ?? job.data?.newScanId
          if (scanId) {
            void this.markScanFailed(scanId, err).catch(updateErr => {
              this.log('scan_status_update_failed', {
                scanId,
                error: updateErr instanceof Error ? updateErr.message : String(updateErr)
              })
            })
          }
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
      worker: WorkerName.SCAN,
      concurrency: WORKER_CONCURRENCY.SCAN
    })
  }

  private async processJob(job: Job): Promise<ScanPipelineResult> {
    await job.updateProgress(5)
    if (job.id) {
      await jobStatusTracker.setProgress(job.id, 5)
    }
    switch (job.name) {
      case SCAN_JOBS.FETCH_AND_PARSE:
      case 'scan-repo':
        return this.processFetchAndParse(job as Job<FetchAndParseJobPayload>)
      case SCAN_JOBS.RESCAN:
        return this.processRescan(job as Job<RescanJobPayload>)
      case SCAN_JOBS.PARSE_SINGLE:
        return this.processParseSingle(job as Job<ParseSingleFileJobPayload>)
      default:
        throw new Error(`Unknown scan job: ${job.name}`)
    }
  }

  private async processFetchAndParse(
    job: Job<FetchAndParseJobPayload>
  ): Promise<ScanPipelineResult> {
    const start = Date.now()
    const { scanId, repoId, owner, repoName, branch,
      githubToken, ignorePaths } = job.data

    try {
      this.log(LOG_EVENTS.JOB_STARTED, {
        jobId: job.id, scanId, repoId, owner, repoName, branch
      })

      if (job.id) {
        await jobStatusTracker.setActive(job.id)
      }

      await db.update(scans)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(scans.id, scanId))

      await this.updateProgress(job, 5)

      if (await this.isCancelled(scanId)) {
        this.log('scan_cancelled_early', { scanId })
        return {
          scanId,
          repoId,
          filesFound: 0,
          filesParsed: 0,
          failedFiles: 0,
          parsedArtifactIds: [],
          queuedAnalysis: false,
          durationMs: Date.now() - start
        }
      }

      const token = githubToken || (await queueRedis.get(`temp-token:${repoId}`)) || process.env.GITHUB_TOKEN;
      const github = new GitHubClient(token || undefined);

      await this.updateProgress(job, 15)

      let fileTree
      try {
        fileTree = await github.getFileTree(owner, repoName, branch)
      } catch (err: any) {
        if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 404) {
          try {
            const repoData = await github.getRepo(owner, repoName)
            if (repoData && repoData.default_branch && repoData.default_branch !== branch) {
              this.log('branch_fallback', {
                scanId, requestedBranch: branch, fallbackBranch: repoData.default_branch
              })
              fileTree = await github.getFileTree(owner, repoName, repoData.default_branch)
              // Update scan record branch in DB to reflect actual branch scanned
              await db.update(scans)
                .set({ branch: repoData.default_branch, updatedAt: new Date() })
                .where(eq(scans.id, scanId))
            } else {
              throw err
            }
          } catch (fallbackErr) {
            throw err
          }
        } else {
          throw err
        }
      }

      const ciFiles = fileTree.filter(file => {
        if (file.type !== 'blob') return false
        const filePath = file.path
        if (ignorePaths && ignorePaths.some(p => filePath.includes(p))) return false
        return isCIFile(filePath)
      })

      this.log('scan_files_discovered', {
        scanId, total: fileTree.length, ciFiles: ciFiles.length
      })

      await this.updateProgress(job, 30)

      type FileContent = { filePath: string; content: string }

      let fetchedCount = 0
      const fetchResults = await batchWithConcurrency(
        ciFiles,
        MAX_CONCURRENT_FILE_FETCHES,
        async (file): Promise<FileContent> => {
          const content = await github.getFileContent(
            owner, repoName, file.path, branch, file.sha
          )
          await queueRedis.setex(`file-content:${scanId}:${file.path}`, 86400, content)
          fetchedCount++
          const pct = 30 + Math.floor((fetchedCount / ciFiles.length) * 30)
          await this.updateProgress(job, pct)
          return { filePath: file.path, content }
        }
      )

      const fetchedFiles: FileContent[] = []
      for (const result of fetchResults) {
        if (result.status === 'fulfilled') {
          fetchedFiles.push(result.value)
        } else {
          this.log('file_fetch_failed', {
            scanId, error: result.reason?.message
          })
        }
      }

      await this.updateProgress(job, 60)

      type ParsedFile = {
        filePath:           string
        parser:             string
        normalizedWorkflow: unknown
        warnings:           string[]
      }
      type ParseFailure = { filePath: string; error: string }

      const parsedFiles: ParsedFile[] = []
      const parseFailures: ParseFailure[] = []
      let filesProcessed = 0

      for (const { filePath, content } of fetchedFiles) {
        try {
          const parserName = detectFileType(filePath, content)
          if (parserName) {
            const result = detectAndParse(content, filePath, repoId)
            if (result.success && result.result) {
              parsedFiles.push({
                filePath,
                parser:             parserName,
                normalizedWorkflow: result.result,
                warnings:           result.warnings.map(w => w.message)
              })
            }
          }
        } catch (err: unknown) {
          parseFailures.push({
            filePath,
            error: err instanceof Error ? err.message : String(err)
          })
          this.log('file_parse_failed', {
            scanId, filePath, error: parseFailures.at(-1)!.error
          })
        }
        filesProcessed++
        await this.updateProgress(job, Math.floor(60 + (filesProcessed / fetchedFiles.length) * 20))
      }

      await this.updateProgress(job, 80)

      const insertValues = parsedFiles.map(pf => ({
        id: randomUUID(),
        scanId,
        repoId,
        filePath:       pf.filePath,
        fileType:       pf.parser,
        normalizedWorkflow: pf.normalizedWorkflow,
        parseWarnings:  pf.warnings
      }))

      let insertedIds: string[] = []

      if (insertValues.length > 0) {
        await db.delete(parsedArtifacts)
          .where(eq(parsedArtifacts.scanId, scanId))

        const inserted = await db
          .insert(parsedArtifacts)
          .values(insertValues)
          .returning({ id: parsedArtifacts.id })

        insertedIds = inserted.map(r => r.id)
      }

      await this.updateProgress(job, 95)

      if (await this.isCancelled(scanId)) {
        this.log('scan_cancelled_early', { scanId })
        return {
          scanId,
          repoId,
          filesFound: insertedIds.length,
          filesParsed: insertedIds.length,
          failedFiles: 0,
          parsedArtifactIds: insertedIds,
          queuedAnalysis: false,
          durationMs: Date.now() - start
        }
      }

      if (insertedIds.length > 0) {
        const analysisJob = await enqueueAnalysis({
          scanId,
          repoId,
          parsedArtifactIds: insertedIds,
          ruleConfig: {}
        })

        this.log(LOG_EVENTS.PIPELINE_ENQUEUED, {
          scanId, nextStage: 'analysis', analysisJobId: analysisJob.jobId
        })
      }

      await this.updateProgress(job, 100)

      await db.update(scans)
        .set({
          totalFiles: ciFiles.length,
          updatedAt: new Date(),
          ...(insertedIds.length === 0
            ? {
              status: 'completed' as const,
              completedAt: new Date(),
              durationMs: Date.now() - start
            }
            : {})
        })
        .where(eq(scans.id, scanId))

      const result: ScanPipelineResult = {
        scanId,
        repoId,
        filesFound:          ciFiles.length,
        filesParsed:         parsedFiles.length,
        failedFiles:         parseFailures.length,
        parsedArtifactIds:   insertedIds,
        queuedAnalysis:      insertedIds.length > 0,
        durationMs:          Date.now() - start
      }

      this.log(LOG_EVENTS.JOB_COMPLETED, {
        jobId: job.id, ...result
      })

      return result
    } catch (err: any) {
      await db.update(scans)
        .set({
          status: 'failed',
          completedAt: new Date(),
          updatedAt: new Date(),
          errorMessage: err.message
        })
        .where(eq(scans.id, scanId))
      throw err
    }
  }

  private async processRescan(
    job: Job<RescanJobPayload>
  ): Promise<ScanPipelineResult> {
    const { originalScanId: _originalScanId, newScanId, repoId, owner, repoName, branch, provider, githubToken, priority } = job.data
    const syntheticPayload: FetchAndParseJobPayload = {
      scanId: newScanId,
      repoId,
      repoUrl: `https://${provider}.com/${owner}/${repoName}`,
      owner,
      repoName,
      branch,
      provider,
      githubToken: githubToken ?? '',
      ignorePaths: [],
      priority,
      triggeredBy: 'manual'
    }
    const fakeJob = {
      ...job,
      data: syntheticPayload,
      updateProgress: job.updateProgress.bind(job)
    } as unknown as Job<FetchAndParseJobPayload>
    
    return this.processFetchAndParse(fakeJob)
  }

  private async processParseSingle(
    job: Job<ParseSingleFileJobPayload>
  ): Promise<ScanPipelineResult> {
    const start = Date.now()
    const { scanId, repoId, filePath, gitSha, owner, repoName, branch, githubToken } = job.data
    
    const cacheKey = `parsed:${repoId}:${filePath}:${gitSha}`
    const cached = await queueRedis.get(cacheKey)
    
    let normalizedWorkflow: unknown = null
    let warnings: string[] = []
    let parserNameActual = 'unknown'
    let parseError = ''

    if (cached) {
      const parsed = JSON.parse(cached)
      normalizedWorkflow = parsed.normalizedWorkflow
      warnings = parsed.warnings
      parserNameActual = parsed.parser
    } else {
      const token = githubToken || (await queueRedis.get(`temp-token:${repoId}`)) || process.env.GITHUB_TOKEN;
      const github = new GitHubClient(token || undefined);
      const content = await github.getFileContent(owner, repoName, filePath, branch, gitSha)
      await queueRedis.setex(`file-content:${scanId}:${filePath}`, 86400, content)
      
      try {
        const parserName = detectFileType(filePath, content)
        if (parserName) {
          const result = detectAndParse(content, filePath, repoId)
          if (result.success && result.result) {
            normalizedWorkflow = result.result
            warnings = result.warnings.map(w => w.message)
            parserNameActual = parserName
            await queueRedis.set(cacheKey, JSON.stringify({
              normalizedWorkflow, warnings, parser: parserNameActual
            }), 'EX', 86400)
          }
        }
      } catch (err: unknown) {
        parseError = err instanceof Error ? err.message : String(err)
      }
    }

    let insertedIds: string[] = []
    if (normalizedWorkflow) {
      await db.delete(parsedArtifacts)
        .where(eq(parsedArtifacts.scanId, scanId))

      const inserted = await db
        .insert(parsedArtifacts)
        .values([{
          id: randomUUID(),
          scanId,
          repoId,
          filePath,
          fileType: parserNameActual,
          normalizedWorkflow,
          parseWarnings: warnings
        }])
        .returning({ id: parsedArtifacts.id })

      insertedIds = inserted.map(r => r.id)
      
      await enqueueAnalysis({
        scanId,
        repoId,
        parsedArtifactIds: insertedIds,
        ruleConfig: {}
      })
    }

    return {
      scanId,
      repoId,
      filesFound: 1,
      filesParsed: normalizedWorkflow ? 1 : 0,
      failedFiles: parseError ? 1 : 0,
      parsedArtifactIds: insertedIds,
      queuedAnalysis: insertedIds.length > 0,
      durationMs: Date.now() - start
    }
  }

  async stop(): Promise<void> {
    this.status = WorkerStatus.STOPPING
    this.log(LOG_EVENTS.SHUTDOWN_STARTED, {
      worker: WorkerName.SCAN
    })
    await this.worker?.close()
    this.status = WorkerStatus.STOPPED
    this.log(LOG_EVENTS.SHUTDOWN_COMPLETED, {
      worker: WorkerName.SCAN
    })
  }

  async getHealth(): Promise<WorkerHealth> {
    return {
      worker:        WorkerName.SCAN,
      status:        this.status,
      concurrency:   WORKER_CONCURRENCY.SCAN,
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

  private async isCancelled(scanId: string): Promise<boolean> {
    const [scan] = await db
      .select({ status: scans.status })
      .from(scans)
      .where(eq(scans.id, scanId))
      .limit(1)
    return scan?.status === 'cancelled'
  }

  private log(event: string, data: Record<string, unknown>): void {
    console.log(JSON.stringify({
      event,
      worker: WorkerName.SCAN,
      timestamp: new Date().toISOString(),
      ...data
    }))
  }
}

import { Router, Request, Response, NextFunction, RequestHandler } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { scans } from '../db/schema'
import { scanQueue, analysisQueue } from '../queue/queue.definitions'
import { validateParams } from '../middleware/validate'
import { NotFoundError } from '../middleware/error-handler'
import { JobStatusTracker } from '../queue/job-status'
import { retryJob, cancelJob } from '../queue/producers'

const router = Router()

const jobIdParam = z.object({
  jobId: z.string().min(1, 'Job ID is required')
})

const getJobStatus: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { jobId } = req.params as z.infer<typeof jobIdParam>

    // 1. Try to find job in scan-queue first
    const scanJob = await scanQueue.getJob(jobId)

    // 2. If not in scan-queue, check analysis-queue
    const analysisJob = !scanJob ? await analysisQueue.getJob(jobId) : null

    const job = scanJob || analysisJob

    // 3. If not found anywhere: return 404
    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      })
      return
    }

    // 4. Get job state
    const state = await job.getState()

    // 5. Map state to our status:
    // 'waiting' | 'delayed' → 'queued'
    // 'active'              → 'running'
    // 'completed'           → 'completed'
    // 'failed'              → 'failed'
    let mappedState: 'queued' | 'running' | 'completed' | 'failed' = 'queued'
    if (state === 'active') {
      mappedState = 'running'
    } else if (state === 'completed') {
      mappedState = 'completed'
    } else if (state === 'failed') {
      mappedState = 'failed'
    }

    // 6. Get progress (0-100)
    const progress = typeof job.progress === 'number' ? job.progress : 0

    // 7. Fetch current scan status from DB for accurate state
    let dbStatus: string | undefined
    if (job.data?.scanId) {
      const [scan] = await db
        .select()
        .from(scans)
        .where(eq(scans.id, job.data.scanId))
        .limit(1)
      dbStatus = scan?.status
    }

    // 8. Return 200
    res.status(200).json({
      success: true,
      data: {
        jobId,
        scanId: job.data?.scanId,
        status: dbStatus ?? mappedState,
        progress,
        queue: scanJob ? 'scan-queue' : 'analysis-queue',
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason ?? null,
        timestamp: new Date().toISOString()
      }
    })
  } catch (err) {
    next(err)
  }
}

const retryFailedJob: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { jobId } = req.params as z.infer<typeof jobIdParam>
    const status = await JobStatusTracker.get(jobId)

    if (!status) {
      throw NotFoundError('Job')
    }

    const retried = await retryJob(status.queue, jobId)
    if (!retried) {
      res.status(400).json({
        success: false,
        error: 'Job cannot be retried (must be in failed state)'
      })
      return
    }

    res.status(200).json({
      success: true,
      message: 'Job retry initiated'
    })
  } catch (err) {
    next(err)
  }
}

const cancelWaitingJob: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { jobId } = req.params as z.infer<typeof jobIdParam>
    const status = await JobStatusTracker.get(jobId)

    if (!status) {
      throw NotFoundError('Job')
    }

    const cancelled = await cancelJob(status.queue, jobId)
    if (!cancelled) {
      res.status(400).json({
        success: false,
        error: 'Job cannot be cancelled (must be in waiting or delayed state)'
      })
      return
    }

    res.status(200).json({
      success: true,
      message: 'Job cancelled successfully'
    })
  } catch (err) {
    next(err)
  }
}

router.get(
  '/:jobId/status',
  validateParams(jobIdParam),
  getJobStatus
)

router.post(
  '/:jobId/retry',
  validateParams(jobIdParam),
  retryFailedJob
)

router.delete(
  '/:jobId',
  validateParams(jobIdParam),
  cancelWaitingJob
)

export default router

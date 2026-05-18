import { Router, Request, Response, NextFunction, RequestHandler } from 'express'
import { z } from 'zod'
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
    const status = await JobStatusTracker.get(jobId)

    if (!status) {
      res.status(404).json({
        success: false,
        error: 'Job not found'
      })
      return
    }

    res.status(200).json({
      success: true,
      data: status
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

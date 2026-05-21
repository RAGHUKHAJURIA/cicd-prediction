import { Router, Request, Response, NextFunction, RequestHandler } from 'express'
import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from '../db/client'
import { repos, scans, parsedArtifacts, findings } from '../db/schema'
import { validateParams, validateQuery } from '../middleware/validate'
import { AppError, BadRequestError, NotFoundError } from '../middleware/error-handler'
import { successResponse } from '../utils/response'
import {
  enqueueScan,
  enqueueRescan
} from '../queue/producers'
import {
  JobPriority,
  FetchAndParseJobPayload,
  RescanJobPayload
} from '../queue/job.types'

const router = Router()

const repoAndScanParams = z.object({
  id: z.string().uuid('Repository ID must be a valid UUID'),
  scanId: z.string().uuid('Scan ID must be a valid UUID')
})

const repoIdParam = z.object({
  id: z.string().uuid('Repository ID must be a valid UUID')
})

const TriggerScanSchema = z.object({
  branch: z.string().min(1).default('main'),
  priority: z.nativeEnum(JobPriority).optional(),
  triggeredBy: z.enum([
    'manual',
    'webhook',
    'schedule',
    'pr'
  ]).default('manual'),
  targetFiles: z.array(z.string()).optional()
})

const RescanSchema = z.object({
  previousScanId: z.string().uuid().optional(),
  branch: z.string().min(1).optional(),
  priority: z.nativeEnum(JobPriority).optional()
})

const listScansQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
  branch: z.string().optional()
})

type RepoRecord = typeof repos.$inferSelect
type TriggerScanBody = z.infer<typeof TriggerScanSchema>
type RescanBody = z.infer<typeof RescanSchema>

function parseRequestBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): z.output<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw BadRequestError('Validation failed', result.error.issues.map(issue => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message
    })))
  }
  return result.data
}

function getIgnorePaths(settings: unknown): string[] {
  if (
    typeof settings === 'object' &&
    settings !== null &&
    'ignorePaths' in settings &&
    Array.isArray((settings as { ignorePaths?: unknown }).ignorePaths)
  ) {
    return (settings as { ignorePaths: unknown[] }).ignorePaths
      .filter((value): value is string => typeof value === 'string')
  }
  return []
}

function buildScanPayload(
  repo: RepoRecord,
  scanId: string,
  body: TriggerScanBody
): FetchAndParseJobPayload {
  const payload: FetchAndParseJobPayload = {
    scanId,
    repoId: repo.id,
    repoUrl: repo.repoUrl,
    owner: repo.owner,
    repoName: repo.repoName,
    branch: body.branch,
    provider: repo.provider,
    ignorePaths: getIgnorePaths(repo.settings),
    priority: body.priority ?? JobPriority.NORMAL,
    triggeredBy: body.triggeredBy
  }

  if (body.targetFiles !== undefined) {
    payload.targetFiles = body.targetFiles
  }

  return payload
}

function buildRescanPayload(
  repo: RepoRecord,
  originalScanId: string,
  newScanId: string,
  branch: string,
  body: RescanBody
): RescanJobPayload {
  return {
    originalScanId,
    newScanId,
    repoId: repo.id,
    owner: repo.owner,
    repoName: repo.repoName,
    branch,
    provider: repo.provider,
    priority: body.priority ?? JobPriority.NORMAL
  }
}

async function getRepoOrThrow(repoId: string): Promise<RepoRecord> {
  const [repo] = await db
    .select()
    .from(repos)
    .where(eq(repos.id, repoId))
    .limit(1)

  if (!repo) throw NotFoundError('Repository')
  if (repo.status === 'paused') {
    throw new AppError(409, 'Repository is paused', 'REPO_PAUSED')
  }
  return repo
}

async function createQueuedScan(
  repoId: string,
  branch: string
): Promise<{ scanId: string; createdAt: Date }> {
  const scanId = randomUUID()
  const now = new Date()

  await db.insert(scans).values({
    id: scanId,
    repoId,
    status: 'queued',
    branch,
    createdAt: now,
    updatedAt: now,
    triggeredAt: now,
    totalFiles: 0,
    totalFindings: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0
  })

  return { scanId, createdAt: now }
}

async function findActiveScan(
  repoId: string,
  branch: string
): Promise<{ id: string } | undefined> {
  const [activeScan] = await db
    .select({ id: scans.id })
    .from(scans)
    .where(sql`
      ${scans.repoId} = ${repoId}
      AND ${scans.branch} = ${branch}
      AND ${scans.status} IN ('queued', 'running')
    `)
    .orderBy(sql`${scans.triggeredAt} DESC`)
    .limit(1)

  return activeScan
}

const triggerScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>
    const repo = await getRepoOrThrow(id)
    const body = parseRequestBody(TriggerScanSchema, req.body)

    const existingScan = await findActiveScan(id, body.branch)
    const scanId = existingScan?.id ?? (await createQueuedScan(id, body.branch)).scanId
    const job = await enqueueScan(buildScanPayload(repo, scanId, body))

    res.status(202).json({
      success: true,
      message: 'Scan queued successfully',
      data: {
        scanId,
        jobId: job.jobId,
        queue: 'scan-queue',
        status: 'queued',
        pollUrl: `/api/jobs/${job.jobId}/status`
      },
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    next(err)
  }
}

const rescan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>
    const repo = await getRepoOrThrow(id)
    const body = parseRequestBody(RescanSchema, req.body)

    const [previousScan] = body.previousScanId
      ? await db
        .select()
        .from(scans)
        .where(sql`${scans.id} = ${body.previousScanId} AND ${scans.repoId} = ${id}`)
        .limit(1)
      : await db
        .select()
        .from(scans)
        .where(eq(scans.repoId, id))
        .orderBy(sql`${scans.triggeredAt} DESC`)
        .limit(1)

    if (!previousScan) throw NotFoundError('Scan')

    const branch = body.branch ?? previousScan.branch
    const { scanId } = await createQueuedScan(id, branch)
    const job = await enqueueRescan(buildRescanPayload(
      repo,
      previousScan.id,
      scanId,
      branch,
      body
    ))

    res.status(202).json({
      success: true,
      message: 'Rescan queued successfully',
      data: {
        scanId,
        originalScanId: previousScan.id,
        jobId: job.jobId,
        queue: 'scan-queue',
        status: 'queued',
        pollUrl: `/api/jobs/${job.jobId}/status`
      },
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    next(err)
  }
}

const listScans: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>
    const q = req.query as unknown as z.infer<typeof listScansQuerySchema>
    const page = Number(q.page)
    const limit = Number(q.limit)
    const offset = (page - 1) * limit

    const [repoCheck] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1)
    if (!repoCheck) throw NotFoundError('Repository')

    let whereClause = sql`${scans.repoId} = ${id}`
    if (q.status) whereClause = sql`${whereClause} AND ${scans.status} = ${q.status}`
    if (q.branch) whereClause = sql`${whereClause} AND ${scans.branch} = ${q.branch}`

    const [totalResult, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(scans)
        .where(whereClause),
      db
        .select()
        .from(scans)
        .where(whereClause)
        .orderBy(sql`${scans.triggeredAt} DESC`)
        .limit(limit)
        .offset(offset)
    ])

    const total = totalResult[0]?.count ?? 0
    const totalPages = Math.ceil(total / limit)

    res.status(200).json({
      success: true,
      data: {
        scans: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      },
      timestamp: new Date().toISOString()
    })
  } catch (err) {
    next(err)
  }
}

const getLatestScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>

    const [repoCheck] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1)
    if (!repoCheck) throw NotFoundError('Repository')

    const [scan] = await db
      .select()
      .from(scans)
      .where(sql`${scans.repoId} = ${id} AND ${scans.status} = 'completed'`)
      .orderBy(sql`${scans.triggeredAt} DESC`)
      .limit(1)

    if (!scan) {
      throw new AppError(404, 'No completed scans found', 'NO_SCANS')
    }

    const [allFindings, artifacts] = await Promise.all([
      db.select().from(findings).where(eq(findings.scanId, scan.id)),
      db
        .select({
          filePath: parsedArtifacts.filePath,
          fileType: parsedArtifacts.fileType,
          parseErrors: parsedArtifacts.parseErrors,
          parseWarnings: parsedArtifacts.parseWarnings
        })
        .from(parsedArtifacts)
        .where(eq(parsedArtifacts.scanId, scan.id))
    ])

    const byFile: Record<string, typeof allFindings> = {}
    for (const finding of allFindings) {
      if (!byFile[finding.filePath]) byFile[finding.filePath] = []
      byFile[finding.filePath]!.push(finding)
    }

    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4
    }
    const sorted = [...allFindings].sort(
      (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    )

    successResponse(res, {
      scan,
      findings: {
        summary: {
          total: allFindings.length,
          critical: scan.criticalCount,
          high: scan.highCount,
          medium: scan.mediumCount,
          low: scan.lowCount
        },
        byFile,
        all: sorted
      },
      artifacts
    })
  } catch (err) {
    next(err)
  }
}

const getScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id, scanId } = req.params as z.infer<typeof repoAndScanParams>

    const [repoCheck] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1)
    if (!repoCheck) throw NotFoundError('Repository')

    const [scan] = await db
      .select()
      .from(scans)
      .where(sql`${scans.id} = ${scanId} AND ${scans.repoId} = ${id}`)
      .limit(1)

    if (!scan) throw NotFoundError('Scan')

    const [allFindings, artifacts] = await Promise.all([
      db.select().from(findings).where(eq(findings.scanId, scanId)),
      db
        .select({
          filePath: parsedArtifacts.filePath,
          fileType: parsedArtifacts.fileType,
          parseErrors: parsedArtifacts.parseErrors,
          parseWarnings: parsedArtifacts.parseWarnings
        })
        .from(parsedArtifacts)
        .where(eq(parsedArtifacts.scanId, scanId))
    ])

    const byFile: Record<string, typeof allFindings> = {}
    for (const finding of allFindings) {
      if (!byFile[finding.filePath]) byFile[finding.filePath] = []
      byFile[finding.filePath]!.push(finding)
    }

    const severityOrder: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4
    }
    const sorted = [...allFindings].sort(
      (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    )

    successResponse(res, {
      scan,
      findings: {
        summary: {
          total: allFindings.length,
          critical: scan.criticalCount,
          high: scan.highCount,
          medium: scan.mediumCount,
          low: scan.lowCount
        },
        byFile,
        all: sorted
      },
      artifacts
    })
  } catch (err) {
    next(err)
  }
}

const rerunScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { scanId } = req.params as z.infer<typeof repoAndScanParams>
    req.body = {
      ...req.body,
      previousScanId: scanId
    }
    await rescan(req, res, next)
  } catch (err) {
    next(err)
  }
}

router.post(
  '/:id/scan',
  validateParams(repoIdParam),
  triggerScan
)

router.post(
  '/:id/rescan',
  validateParams(repoIdParam),
  rescan
)

router.get(
  '/:id/scans/latest',
  validateParams(repoIdParam),
  getLatestScan
)

router.get(
  '/:id/scans/:scanId',
  validateParams(repoAndScanParams),
  getScan
)

router.post(
  '/:id/scans/:scanId/rerun',
  validateParams(repoAndScanParams),
  rerunScan
)

router.get(
  '/:id/scans',
  validateParams(repoIdParam),
  validateQuery(listScansQuerySchema),
  listScans
)

export default router

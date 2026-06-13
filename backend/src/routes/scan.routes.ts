import { Router, Request, Response, NextFunction, RequestHandler } from 'express'
import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from '../db/client'
import { repos, scans, parsedArtifacts, findings, users, aiRemediations, aiExplanations, analysisReports } from '../db/schema'
import { validateParams, validateQuery } from '../middleware/validate'
import { AppError, BadRequestError, NotFoundError } from '../middleware/error-handler'
import { requireAuth, requireRepoOwner } from '../middleware/auth.middleware'
import { decryptTokenIfPresent } from '../lib/tokenCrypto'
import { guardFinding } from '../ai/file-output-guard'
import { scanQueue } from '../queue/queue.definitions'
import { queueRedis } from '../queue/redis.client'
import {
  enqueueRescan
} from '../queue/producers'
import {
  JobPriority,
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
// type TriggerScanBody = z.infer<typeof TriggerScanSchema>
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

/*
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
*/

/*
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
*/

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

/*
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
*/

async function checkGithubRepoPrivate(owner: string, repo: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`)
    if (res.status === 404 || res.status === 403 || res.status === 401) {
      return true
    }
    return false
  } catch {
    return false
  }
}

async function checkGitlabRepoPrivate(owner: string, repo: string): Promise<boolean> {
  try {
    const encoded = encodeURIComponent(`${owner}/${repo}`)
    const res = await fetch(`https://gitlab.com/api/v4/projects/${encoded}`)
    if (res.status === 404 || res.status === 403 || res.status === 401) {
      return true
    }
    return false
  } catch {
    return false
  }
}

const triggerScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>
    const body = parseRequestBody(TriggerScanSchema, req.body)

    // STEP 1 — Auth and repo validation
    if (!req.session?.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1)

    if (!repo) {
      res.status(404).json({ success: false, error: 'Repository not found' })
      return
    }

    if (repo.userId !== req.session.userId) {
      res.status(403).json({ success: false, error: 'Not your repository' })
      return
    }

    // STEP 2 — Token resolution
    let token: string | null = null

    // a) Logged in user access token
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId))
    if (user[0]?.githubAccessToken) {
      token = decryptTokenIfPresent(user[0].githubAccessToken)
    }

    // b) Check Redis for cached token
    if (!token) {
      const cached = await queueRedis.get(`temp-token:${repo.id}`)
      if (cached) {
        token = cached
      }
    }

    // c & d) If no token, check if private
    if (!token) {
      let isPrivate = false
      if (repo.provider === 'github') {
        isPrivate = await checkGithubRepoPrivate(repo.owner, repo.repoName)
      } else if (repo.provider === 'gitlab') {
        isPrivate = await checkGitlabRepoPrivate(repo.owner, repo.repoName)
      }
      
      if (isPrivate) {
        res.status(422).json({
          success: false,
          error: 'Private repository requires GitHub authentication',
          code: 'NO_GITHUB_TOKEN'
        })
        return
      }
    }

    // STEP 3 — Cache token in Redis if we have one
    if (token) {
      await queueRedis.setex(`temp-token:${repo.id}`, 86400, token)
    }

    // STEP 4 — Check for already running scan
    const running = await db
      .select()
      .from(scans)
      .where(and(eq(scans.repoId, repo.id), eq(scans.status, 'running')))

    if (running.length > 0) {
      res.status(409).json({
        success: false,
        error: 'A scan is already running for this repository',
        code: 'SCAN_IN_PROGRESS',
        details: { runningScanId: running[0].id }
      })
      return
    }

    // STEP 5 — Create scan record
    const scanId = randomUUID()
    await db.insert(scans).values({
      id: scanId,
      repoId: repo.id,
      status: 'queued',
      branch: body.branch ?? repo.defaultBranch ?? 'main',
      triggeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      totalFiles: 0,
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    })

    // STEP 6 — Enqueue to scan-queue
    const job = await scanQueue.add(
      'scan-repo',
      {
        scanId,
        repoId: repo.id,
        repoUrl: repo.repoUrl,
        owner: repo.owner,
        repoName: repo.repoName,
        branch: body.branch ?? repo.defaultBranch ?? 'main',
        userId: req.session.userId,
        hasToken: !!token,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        priority: body.priority ?? 2,
      }
    )

    // STEP 7 — Update scan with jobId and status='running'
    await db
      .update(scans)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(scans.id, scanId))

    // STEP 8 — Return 202
    res.status(202).json({
      success: true,
      message: 'Scan queued successfully',
      data: {
        scanId,
        jobId: job.id,
        queue: 'scan-queue',
        status: 'queued',
        repoId: repo.id,
        branch: body.branch ?? repo.defaultBranch ?? 'main',
        pollUrl: `/api/jobs/${job.id}/status`,
      }
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

const getScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id, scanId } = req.params as z.infer<typeof repoAndScanParams>

    // 1. Verify repo ownership
    if (!req.session?.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1)

    if (!repo) {
      res.status(404).json({ success: false, error: 'Repository not found' })
      return
    }

    if (repo.userId !== req.session.userId) {
      res.status(403).json({ success: false, error: 'Not your repository' })
      return
    }

    // 2. Fetch scan: where id = scanId AND repoId = id
    const [scan] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.id, scanId), eq(scans.repoId, id)))
      .limit(1)

    if (!scan) {
      res.status(404).json({ success: false, error: 'Scan not found' })
      return
    }

    // 3. Fetch findings ordered by severity desc
    const allFindings = await db
      .select()
      .from(findings)
      .where(eq(findings.scanId, scanId))
      .orderBy(desc(findings.severity))

    // 4. Fetch analysis report
    const [report] = await db
      .select()
      .from(analysisReports)
      .where(eq(analysisReports.scanId, scanId))
      .limit(1)

    // 5. Fetch AI remediations
    const remediations = await db
      .select()
      .from(aiRemediations)
      .where(eq(aiRemediations.scanId, scanId))

    // 6. Fetch AI explanations
    const explanations = await db
      .select()
      .from(aiExplanations)
      .where(eq(aiExplanations.scanId, scanId))

    // 7. Fetch parsed artifacts
    const artifacts = await db
      .select()
      .from(parsedArtifacts)
      .where(eq(parsedArtifacts.scanId, scanId))

    // 9. Merge remediations/explanations into findings by ruleId and apply output guard
    const findingsWithPatches = allFindings.map(f => {
      const remediation = remediations.find(r => r.ruleId === f.ruleId) ?? null
      const explanation = explanations.find(e => e.ruleId === f.ruleId) ?? null

      const patchObj = remediation ? {
        before: remediation.beforeCode || '',
        after: remediation.afterCode || '',
      } : null

      const guard = guardFinding({
        ruleId: f.ruleId,
        filePath: f.filePath,
        patch: patchObj,
      })

      return {
        ...f,
        patch: guard.displayPatch
          ? {
              ...remediation,
              beforeCode: guard.displayPatch.before,
              afterCode: guard.displayPatch.after,
            }
          : remediation,
        explanation,
        requiresManualReview: guard.requiresManualReview,
        manualReviewReason: guard.manualReason,
      }
    })

    // 8. Group findings by file
    const byFile: Record<string, typeof findingsWithPatches> = {}
    findingsWithPatches.forEach(f => {
      if (!byFile[f.filePath]) {
        byFile[f.filePath] = []
      }
      byFile[f.filePath].push(f)
    })

    // 10. Return 200
    res.status(200).json({
      success: true,
      data: {
        scan: {
          id: scan.id,
          repoId: scan.repoId,
          status: scan.status,
          branch: scan.branch,
          triggeredAt: scan.triggeredAt,
          completedAt: scan.completedAt,
          durationMs: scan.durationMs,
          totalFiles: scan.totalFiles,
          totalFindings: scan.totalFindings,
          criticalCount: scan.criticalCount,
          highCount: scan.highCount,
          mediumCount: scan.mediumCount,
          lowCount: scan.lowCount,
          errorMessage: scan.errorMessage
        },
        score: {
          value: report?.overallScore ?? 0,
          grade: report?.riskGrade ?? 'F',
          trend: 'new'
        },
        findings: {
          total: allFindings.length,
          critical: allFindings.filter(f => f.severity === 'critical').length,
          high: allFindings.filter(f => f.severity === 'high').length,
          medium: allFindings.filter(f => f.severity === 'medium').length,
          low: allFindings.filter(f => f.severity === 'low').length,
          all: findingsWithPatches,
          byFile,
        },
        artifacts: artifacts.map(a => ({
          filePath: a.filePath,
          fileType: a.fileType,
          parseErrors: a.parseErrors ?? [],
          parseWarnings: a.parseWarnings ?? [],
        })),
        aiReport: report ? JSON.parse(report.reportJson ?? '{}') : null,
      }
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

    // 1. Verify repo ownership
    if (!req.session?.userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1)

    if (!repo) {
      res.status(404).json({ success: false, error: 'Repository not found' })
      return
    }

    if (repo.userId !== req.session.userId) {
      res.status(403).json({ success: false, error: 'Not your repository' })
      return
    }

    // 2. Fetch most recent scan
    const [latestScan] = await db
      .select()
      .from(scans)
      .where(eq(scans.repoId, id))
      .orderBy(desc(scans.triggeredAt))
      .limit(1)

    // 3. If none: return 404
    if (!latestScan) {
      res.status(404).json({
        success: false,
        error: 'No scans found',
        code: 'NO_SCANS'
      })
      return
    }

    // 4. If found: redirect to full scan results by calling handler
    req.params.scanId = latestScan.id
    return getScan(req, res, next)
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
  requireAuth,
  requireRepoOwner,
  validateParams(repoIdParam),
  triggerScan
)

router.post(
  '/:id/rescan',
  requireAuth,
  requireRepoOwner,
  validateParams(repoIdParam),
  rescan
)

router.get(
  '/:id/scans/latest',
  requireAuth,
  requireRepoOwner,
  validateParams(repoIdParam),
  getLatestScan
)

router.get(
  '/:id/scans/:scanId',
  requireAuth,
  requireRepoOwner,
  validateParams(repoAndScanParams),
  getScan
)

router.post(
  '/:id/scans/:scanId/rerun',
  requireAuth,
  requireRepoOwner,
  validateParams(repoAndScanParams),
  rerunScan
)

router.get(
  '/:id/scans',
  requireAuth,
  requireRepoOwner,
  validateParams(repoIdParam),
  validateQuery(listScansQuerySchema),
  listScans
)

export default router

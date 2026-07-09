import { Router, Request, Response, NextFunction, RequestHandler } from 'express'
import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db } from '../db/client'
import { repos, scans, parsedArtifacts, findings, users, aiRemediations, aiExplanations, analysisReports, githubAppRepos } from '../db/schema'
import { githubAppAuth } from '../github-app/app-auth'
import { validateParams, validateQuery } from '../middleware/validate'
import { AppError, BadRequestError, NotFoundError } from '../middleware/error-handler'
import { requireAuth, requireRepoOwner } from '../middleware/auth.middleware'
import { decryptTokenIfPresent } from '../lib/tokenCrypto'
import { guardFinding } from '../ai/file-output-guard'
import { scanQueue, analysisQueue, aiQueue } from '../queue/queue.definitions'
import { queueRedis } from '../queue/redis.client'
import { Octokit } from '@octokit/rest'
import { containsPlaceholder, guardFileContent } from '../ai/file-output-guard'
import { patchApplier } from '../ai/patch-applier'
import { PatchType } from '../ai/patch-builder'
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

const applyFixesSchema = z.object({
  branch: z.string().min(1).max(255).optional(),
  createPR: z.boolean().default(true),
  prTitle: z.string().max(255).optional(),
  targetBranch: z.string().min(1).max(255).optional(),
  selectedFileIds: z.array(z.string()).optional()
})

interface ManualFixInstruction {
  ruleId: string;
  filePath: string;
  title: string;
  severity: string;
  currentCode?: string;
  guidance: string;
}

interface FileRemediationResult {
  filePath: string;
  originalContent: string;
  fixedContent: string;
  hasAutoFixes: boolean;
  appliedPatchRuleIds: string[];
  manualFixes: ManualFixInstruction[];
  validationPassed: boolean;
}

function buildApplyFixesPRBody(params: {
  scanId: string;
  repoId: string;
  grade: string;
  score: number;
  committedFiles: string[];
  skippedFiles: Array<{ filePath: string; reason: string }>;
  manualFixes: ManualFixInstruction[];
  dashboardUrl: string;
}): string {
  const committedRows = params.committedFiles
    .map(f => `| ${f} | Applied |`)
    .join('\n');

  const skippedRows = params.skippedFiles
    .map(s => `| ${s.filePath} | ${s.reason} |`)
    .join('\n');

  const manualRows = params.manualFixes
    .map(m => `| ${m.ruleId} | ${m.guidance} |`)
    .join('\n');

  return [
    `<!-- cicd-reliability-pr-${params.scanId} -->`,
    `## CI/CD Reliability Fixes — Grade ${params.grade} (${params.score}/100)`,
    ``,
    `This PR was generated automatically by the CI/CD Reliability Intelligence Platform.`,
    ``,
    `### ✅ Automatically applied (${params.committedFiles.length} files)`,
    `| File | Status |`,
    `|------|--------|`,
    committedRows || '| None | |',
    ``,
    params.skippedFiles.length > 0
      ? [
          `### ⏭ Skipped (${params.skippedFiles.length} files)`,
          `| File | Reason |`,
          `|------|--------|`,
          skippedRows,
          ``
        ].join('\n')
      : '',
    params.manualFixes.length > 0
      ? [
          `### ⚠️ Manual review required (${params.manualFixes.length} fixes)`,
          `These could not be applied automatically and need your attention:`,
          `| Rule | Guidance |`,
          `|------|----------|`,
          manualRows,
          ``
        ].join('\n')
      : '',
    `---`,
    `[View full scan report →](${params.dashboardUrl}/repos/${params.repoId}/scans/${params.scanId})`,
    ``,
    `*Generated by CI/CD Reliability Platform · Scan \`${params.scanId.slice(0, 8)}\`*`,
    `<!-- cicd-reliability-pr-end -->`
  ].filter(Boolean).join('\n');
}

const applyFixesHandler: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: repoId, scanId } = req.params as z.infer<typeof repoAndScanParams>
    const body = parseRequestBody(applyFixesSchema, req.body)

    // STEP 1 — Load scan and verify it belongs to this repo:
    const [scan] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.id, scanId), eq(scans.repoId, repoId)))
      .limit(1)

    if (!scan) {
      res.status(404).json({ success: false, error: 'Scan not found' })
      return
    }

    if (scan.status !== 'completed') {
      res.status(409).json({
        success: false,
        error: 'Scan must be completed before applying fixes',
        code: 'SCAN_NOT_COMPLETE'
      })
      return
    }

    const repo = req.repo
    if (!repo) {
      res.status(404).json({ success: false, error: 'Repository not found' })
      return
    }

    // STEP 2 — Get GitHub token/Octokit:
    let octokit: Octokit | null = null

    // a) Try User's OAuth token first (so commits are associated with the user's account)
    let token: string | null = null
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, req.session.userId as string))
      .limit(1)

    if (user[0]?.githubAccessToken) {
      token = decryptTokenIfPresent(user[0].githubAccessToken)
    }

    if (!token) {
      const cached = await queueRedis.get(`temp-token:${repoId}`)
      if (cached) {
        token = cached
      }
    }

    if (token) {
      octokit = new Octokit({ auth: token })
    }

    // b) Fallback to GitHub App installation token
    if (!octokit) {
      const [appRepo] = await db
        .select()
        .from(githubAppRepos)
        .where(eq(githubAppRepos.repoId, repoId))
        .limit(1)

      if (appRepo?.installationId) {
        try {
          octokit = await githubAppAuth.getInstallationOctokit(appRepo.installationId)
        } catch (err: any) {
          console.warn(`[apply-fixes] Failed to get Octokit for GitHub App installation ${appRepo.installationId}:`, err.message)
        }
      }
    }

    // c) If still no token, fail
    if (!octokit) {
      res.status(422).json({
        success: false,
        error: 'GitHub authentication required to apply fixes. Please connect your GitHub account in settings or install the GitHub App.',
        code: 'NO_GITHUB_TOKEN'
      })
      return
    }

    // STEP 3 — Build remediations from scan data:
    const findingsData = await db
      .select()
      .from(findings)
      .where(eq(findings.scanId, scanId))
    const aiRemediationsData = await db
      .select()
      .from(aiRemediations)
      .where(eq(aiRemediations.scanId, scanId))
    const parsedArtifactsData = await db
      .select()
      .from(parsedArtifacts)
      .where(eq(parsedArtifacts.scanId, scanId))

    const workflowContents = new Map<string, string>()
    for (const artifact of parsedArtifactsData) {
      let content = await queueRedis.get(`file-content:${scanId}:${artifact.filePath}`)
      if (!content && artifact.normalizedWorkflow) {
        content = (artifact.normalizedWorkflow as any).raw || ''
      }
      if (!content) {
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.repoName,
            path: artifact.filePath,
            ref: scan.branch,
          })
          if ('content' in data) {
            content = Buffer.from(data.content, 'base64').toString('utf8')
          }
        } catch (err: any) {
          console.warn(
            `[apply-fixes] Could not fetch ${artifact.filePath}:`,
            err.message
          )
        }
      }
      if (content) {
        workflowContents.set(artifact.filePath, content)
      }
    }

    const findingsWithPatches = findingsData.map(f => {
      const rem = aiRemediationsData.find(r => r.ruleId === f.ruleId)
      return {
        ...f,
        patch: rem
          ? {
              before: rem.beforeCode ?? '',
              after: rem.afterCode ?? '',
              confidence: (rem.confidence || 'certain') as 'certain' | 'likely' | 'manual-review-required',
              explanation: rem.instructions ?? '',
              instructions: rem.instructions ?? '',
            }
          : null,
      }
    })

    const fileRemediations: FileRemediationResult[] = []

    for (const [filePath, originalContent] of workflowContents) {
      const patches = findingsWithPatches
        .filter(f => f.filePath === filePath && f.patch !== null)
        .map(f => ({
          ruleId: f.ruleId,
          filePath: f.filePath,
          patchType: PatchType.YAML_SNIPPET,
          before: f.patch!.before,
          after: f.patch!.after,
          explanation: f.patch!.explanation,
          isFullFile: false,
          confidence: f.patch!.confidence,
        }))

      const applyResult = patchApplier.applyPatches(originalContent, patches)
      const cleanFileContent = applyResult.content

      const guarded = guardFileContent(cleanFileContent, originalContent, {
        filePath,
        source: 'apply-fixes',
      })

      fileRemediations.push({
        filePath,
        originalContent,
        fixedContent: guarded.content,
        hasAutoFixes: applyResult.appliedPatches.length > 0 && guarded.safe,
        appliedPatchRuleIds: applyResult.appliedPatches.map(p => p.ruleId),
        manualFixes: applyResult.manualReviewPatches.map(mp => ({
          ruleId: mp.ruleId,
          filePath: mp.filePath,
          title: mp.explanation,
          severity: 'high',
          currentCode: mp.before,
          guidance: mp.explanation,
        })),
        validationPassed: guarded.safe,
      })
    }

    // STEP 4 — Filter to user-selected files if specified:
    let filesToApply = fileRemediations.filter(
      f => f.hasAutoFixes && f.validationPassed
    )
    if (body.selectedFileIds && body.selectedFileIds.length > 0) {
      filesToApply = filesToApply.filter(f =>
        body.selectedFileIds!.includes(f.filePath)
      )
    }
    if (filesToApply.length === 0) {
      res.status(422).json({
        success: false,
        error: 'No safe automatic fixes available for this scan. All fixes require manual review.',
        code: 'NO_AUTO_FIXES',
        details: {
          totalFiles: fileRemediations.length,
          manualFixCount: fileRemediations.flatMap(f => f.manualFixes).length,
        }
      })
      return
    }

    // STEP 5 — Determine branch name:
    const branchName = body.branch
      ?? `cicd-reliability/fixes-${scanId.slice(0, 8)}`

    let branchExists = false
    try {
      await octokit.rest.git.getRef({
        owner: repo.owner,
        repo: repo.repoName,
        ref: `heads/${branchName}`,
      })
      branchExists = true
    } catch {
      branchExists = false
    }

    if (!branchExists) {
      try {
        const { data: baseRef } = await octokit.rest.git.getRef({
          owner: repo.owner,
          repo: repo.repoName,
          ref: `heads/${scan.branch}`,
        })
        await octokit.rest.git.createRef({
          owner: repo.owner,
          repo: repo.repoName,
          ref: `refs/heads/${branchName}`,
          sha: baseRef.object.sha,
        })
      } catch (err: any) {
        console.error(`[apply-fixes] Failed to create branch ref:`, err)
        res.status(500).json({
          success: false,
          error: `Failed to create branch "${branchName}" on GitHub: ${err.message || 'Access Denied.'} Make sure your GitHub token has write permissions or check GitHub App permissions.`,
          code: 'COMMIT_FAILED'
        })
        return
      }
    }

    // STEP 6 — Commit each fixed file:
    const committedFiles: string[] = []
    const skippedFiles: Array<{ filePath: string; reason: string }> = []

    for (const fileResult of filesToApply) {
      if (containsPlaceholder(fileResult.fixedContent)) {
        console.error(
          `[apply-fixes] BLOCKED: placeholder in fixedContent for ${fileResult.filePath}`
        )
        skippedFiles.push({
          filePath: fileResult.filePath,
          reason: 'Contains unresolved placeholder tokens',
        })
        continue
      }

      if (!fileResult.validationPassed) {
        skippedFiles.push({
          filePath: fileResult.filePath,
          reason: 'File failed validation',
        })
        continue
      }

      if (fileResult.fixedContent === fileResult.originalContent) {
        skippedFiles.push({
          filePath: fileResult.filePath,
          reason: 'No changes to apply',
        })
        continue
      }

      let currentFileSha: string | undefined
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner: repo.owner,
          repo: repo.repoName,
          path: fileResult.filePath,
          ref: branchName,
        })
        currentFileSha = (data as { sha: string }).sha
      } catch {
        // Ignored
      }

      try {
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.repoName,
          path: fileResult.filePath,
          message: [
            `fix(${fileResult.filePath}): apply CI/CD reliability fixes`,
            ``,
            `Rules fixed: ${fileResult.appliedPatchRuleIds.join(', ')}`,
            `Scan ID: ${scanId}`,
            `Generated by CI/CD Reliability Platform`,
          ].join('\n'),
          content: Buffer.from(fileResult.fixedContent).toString('base64'),
          branch: branchName,
          ...(currentFileSha ? { sha: currentFileSha } : {}),
          committer: {
            name: 'CI/CD Reliability Bot',
            email: 'bot@cicd-reliability.io',
          },
        })

        committedFiles.push(fileResult.filePath)
      } catch (err: any) {
        console.error(
          `[apply-fixes] Failed to commit ${fileResult.filePath}:`,
          err.message
        )
        skippedFiles.push({
          filePath: fileResult.filePath,
          reason: `Commit failed: ${err.message}`,
        })
      }
    }

    if (committedFiles.length === 0) {
      res.status(422).json({
        success: false,
        error: 'No files could be committed. See details.',
        code: 'COMMIT_FAILED',
        details: { skippedFiles }
      })
      return
    }

    // STEP 7 — Create PR (if createPR === true):
    let prResult: { url: string; number: number } | null = null

    if (body.createPR) {
      const targetBranch = body.targetBranch ?? repo.defaultBranch ?? 'main'

      const [report] = await db
        .select()
        .from(analysisReports)
        .where(eq(analysisReports.scanId, scanId))
        .limit(1)

      const prBody = buildApplyFixesPRBody({
        scanId,
        repoId,
        grade: report?.riskGrade ?? '?',
        score: report?.overallScore ?? 0,
        committedFiles,
        skippedFiles,
        manualFixes: fileRemediations.flatMap(f => f.manualFixes),
        dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3001',
      })

      try {
        const { data: pr } = await octokit.rest.pulls.create({
          owner: repo.owner,
          repo: repo.repoName,
          title: body.prTitle
            ?? `fix: CI/CD reliability improvements (${committedFiles.length} file${
                 committedFiles.length === 1 ? '' : 's'
               } fixed) — Grade ${report?.riskGrade ?? '?'}`,
          body: prBody,
          head: branchName,
          base: targetBranch,
          maintainer_can_modify: true,
        })

        prResult = { url: pr.html_url, number: pr.number }

        try {
          await octokit.rest.issues.addLabels({
            owner: repo.owner,
            repo: repo.repoName,
            issue_number: pr.number,
            labels: ['ci/cd', 'reliability', 'automated'],
          })
        } catch {
          // Ignored
        }
      } catch (err: any) {
        console.warn('[apply-fixes] PR creation failed:', err.message)
        try {
          const existing = await octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.repoName,
            head: `${repo.owner}:${branchName}`,
            state: 'open',
          })
          if (existing.data.length > 0) {
            prResult = {
              url: existing.data[0].html_url,
              number: existing.data[0].number,
            }
          }
        } catch {
          // Ignored
        }
      }
    }

    // STEP 8 — Return 200:
    res.status(200).json({
      success: true,
      message: prResult
        ? `Fixes applied and PR created successfully`
        : `Fixes committed to branch "${branchName}"`,
      data: {
        branch: branchName,
        committedFiles,
        skippedFiles,
        pr: prResult
          ? {
              url: prResult.url,
              number: prResult.number,
            }
          : null,
        stats: {
          totalFilesWithFixes: filesToApply.length,
          filesCommitted: committedFiles.length,
          filesSkipped: skippedFiles.length,
          manualFixCount: fileRemediations.flatMap(f => f.manualFixes).length,
        },
      },
    })
  } catch (err) {
    next(err)
  }
}

const cancelScan: RequestHandler = async (
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

    // 2. Fetch scan
    const [scan] = await db
      .select()
      .from(scans)
      .where(and(eq(scans.id, scanId), eq(scans.repoId, id)))
      .limit(1)

    if (!scan) {
      res.status(404).json({ success: false, error: 'Scan not found' })
      return
    }

    if (scan.status !== 'running' && scan.status !== 'queued') {
      res.status(400).json({ success: false, error: 'Scan is not in a cancellable state' })
      return
    }

    // 3. Update database
    await db.update(scans)
      .set({
        status: 'cancelled',
        errorMessage: 'Scan cancelled by user',
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(scans.id, scanId))

    // 4. Remove jobs from BullMQ
    try {
      const scanJob = await scanQueue.getJob(scanId)
      if (scanJob) {
        await scanJob.remove()
      }
    } catch (e: any) {
      console.warn(`[cancel-scan] Failed to remove scan job from queue:`, e.message)
    }

    try {
      const analysisJob = await analysisQueue.getJob(`analysis-${scanId}`)
      if (analysisJob) {
        await analysisJob.remove()
      }
    } catch (e: any) {
      console.warn(`[cancel-scan] Failed to remove analysis job from queue:`, e.message)
    }

    try {
      const aiJob = await aiQueue.getJob(`ai-${scanId}`)
      if (aiJob) {
        await aiJob.remove()
      }
    } catch (e: any) {
      console.warn(`[cancel-scan] Failed to remove ai job from queue:`, e.message)
    }

    res.status(200).json({ success: true, message: 'Scan cancelled successfully' })
  } catch (err) {
    next(err)
  }
}

router.post(
  '/:id/scans/:scanId/cancel',
  requireAuth,
  requireRepoOwner,
  validateParams(repoAndScanParams),
  cancelScan
)

router.post(
  '/:id/scans/:scanId/apply-fixes',
  requireAuth,
  requireRepoOwner,
  validateParams(repoAndScanParams),
  applyFixesHandler
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

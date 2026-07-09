import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { eq, ilike, or, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { repos, users, findings, parsedArtifacts, scans, aiExplanations, aiRemediations, aiPredictions, analysisReports } from "../db/schema";
import { validate, validateParams, validateQuery } from "../middleware/validate";
import { NotFoundError, AppError } from "../middleware/error-handler";
import { successResponse } from "../utils/response";
import { GitHubClient, GitLabClient } from "../utils/github.client";
import { requireAuth, requireRepoOwner } from "../middleware/auth.middleware";
import { decryptTokenIfPresent } from "../lib/tokenCrypto";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const uuidParams = z.object({
  id: z.string().uuid("Repository ID must be a valid UUID"),
});

const registerSchema = z.object({
  repoUrl: z
    .string()
    .url()
    .refine(
      (u) =>
        u.includes("github.com") ||
        u.includes("gitlab.com") ||
        u.endsWith(".git"),
      { message: "URL must be a GitHub, GitLab, or a .git URL" }
    ),
  name: z.string().min(1).max(255).optional(),
  provider: z.enum(["github", "gitlab", "gitea", "self-hosted"]).optional(),
  defaultBranch: z.string().default("main"),
  githubToken: z.string().optional(),
  gitlabToken: z.string().optional(),
  settings: z
    .object({
      autoScanOnPush: z.boolean().default(false),
      scanSchedule: z.string().optional(),
      notifyOnCritical: z.boolean().default(true),
      ignorePaths: z.array(z.string()).default([]),
    })
    .default({}),
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  provider: z.enum(["github", "gitlab", "gitea", "self-hosted"]).optional(),
  status: z.enum(["active", "paused", "error"]).optional(),
  search: z.string().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  defaultBranch: z.string().optional(),
  status: z.enum(["active", "paused"]).optional(),
  settings: z
    .object({
      autoScanOnPush: z.boolean().optional(),
      scanSchedule: z.string().optional(),
      notifyOnCritical: z.boolean().optional(),
      ignorePaths: z.array(z.string()).optional(),
    })
    .optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Provider = "github" | "gitlab" | "gitea" | "self-hosted";

function detectProvider(repoUrl: string): Provider {
  if (repoUrl.includes("github.com")) return "github";
  if (repoUrl.includes("gitlab.com")) return "gitlab";
  return "self-hosted";
}

function extractOwnerRepo(repoUrl: string): { owner: string; repoName: string } {
  const url = new URL(repoUrl);
  const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
  if (parts.length < 2) {
    throw new AppError(422, "Cannot extract owner/repo from URL", "INVALID_REPO_URL");
  }
  return { owner: parts[0]!, repoName: parts.slice(1).join("/") };
}

// ─── POST /api/repos ──────────────────────────────────────────────────────────

const registerRepo: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = req.body as z.infer<typeof registerSchema>;
    const provider: Provider = body.provider ?? detectProvider(body.repoUrl);
    const { owner, repoName } = extractOwnerRepo(body.repoUrl);
    const name = body.name ?? `${owner}/${repoName}`;

    // Check duplicate
    const existingQuery = db
      .select({ id: repos.id, userId: repos.userId })
      .from(repos)
      .where(eq(repos.repoUrl, body.repoUrl));
      
    // If user is authenticated, we only conflict if THEY already have this repo
    const existing = await existingQuery;
    const userConflict = existing.find(r => r.userId === (req.currentUser ? req.currentUser.id : null));

    if (userConflict) {
      return next(
        new AppError(409, "Repository already registered for your account", "CONFLICT", {
          existingId: userConflict.id,
        })
      );
    }

    // Verify accessibility
    let verificationWarning: string | undefined;
    if (provider === "github") {
      let token: string | undefined | null = body.githubToken;
      
      // Fallback to logged-in user's token from DB if not provided
      if (!token && req.currentUser?.id) {
        const [userRecord] = await db
          .select({ githubAccessToken: users.githubAccessToken })
          .from(users)
          .where(eq(users.id, req.currentUser.id))
          .limit(1);

        if (userRecord?.githubAccessToken) {
          token = decryptTokenIfPresent(userRecord.githubAccessToken);
        }
      }

      if (!token) {
        token = process.env["GITHUB_TOKEN"];
      }

      if (token) {
        try {
          const gh = new GitHubClient(token);
          await gh.getRepo(owner, repoName);
        } catch (e) {
          if (e instanceof AppError && (e.statusCode === 404 || e.statusCode === 403)) {
            return next(e);
          }
          verificationWarning = "Could not verify repository accessibility — proceeding with registration.";
        }
      } else {
        verificationWarning = "No GitHub token provided — skipping repository verification.";
      }
    } else if (provider === "gitlab") {
      const token = body.gitlabToken ?? process.env["GITLAB_TOKEN"];
      if (token) {
        try {
          const gl = new GitLabClient(token);
          const encoded = encodeURIComponent(`${owner}/${repoName}`);
          await gl.getRepo(encoded);
        } catch (e) {
          if (e instanceof AppError && (e.statusCode === 404 || e.statusCode === 403)) {
            return next(e);
          }
          verificationWarning = "Could not verify repository accessibility — proceeding with registration.";
        }
      }
    }

    const id = uuidv4();
    const now = new Date();

    await db.insert(repos).values({
      id,
      repoUrl: body.repoUrl,
      name,
      provider,
      owner,
      repoName,
      defaultBranch: body.defaultBranch,
      settings: body.settings,
      status: "active",
      createdAt: now,
      updatedAt: now,
      totalScans: 0,
      userId: req.currentUser ? req.currentUser.id : null,
    });

    const [inserted] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);

    const responseData: Record<string, unknown> = { ...inserted };
    if (verificationWarning) {
      responseData["verificationWarning"] = verificationWarning;
    }

    successResponse(res, responseData, 201, "Repository registered successfully");
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/repos ───────────────────────────────────────────────────────────

const listRepos: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuerySchema>;
    const page = Number(q.page);
    const limit = Number(q.limit);
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = [];

    if (q.provider) conditions.push(eq(repos.provider, q.provider));
    if (q.status) conditions.push(eq(repos.status, q.status));
    if (q.search) {
      conditions.push(
        or(
          ilike(repos.name, `%${q.search}%`),
          ilike(repos.repoUrl, `%${q.search}%`)
        )
      );
    }

    if (req.currentUser && req.currentUser.role !== "admin") {
      conditions.push(eq(repos.userId, req.currentUser.id));
    }

    const whereClause =
      conditions.length > 0
        ? conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)
        : undefined;

    const [totalResult, rows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(repos)
        .where(whereClause),
      db
        .select()
        .from(repos)
        .where(whereClause)
        .orderBy(sql`${repos.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / limit);

    // Fetch latest scan for each repo in the list
    const repoIds = rows.map(r => r.id);
    let latestScans: any[] = [];
    if (repoIds.length > 0) {
      const scansResult = await db.execute(sql`
        SELECT DISTINCT ON (s.repo_id)
          s.id, s.status, s.branch, s.triggered_at as "triggeredAt",
          s.completed_at as "completedAt", s.duration_ms as "durationMs",
          s.total_files as "totalFiles", s.total_findings as "totalFindings",
          s.critical_count as "criticalCount", s.high_count as "highCount",
          s.medium_count as "mediumCount", s.low_count as "lowCount",
          COALESCE(ar.overall_score, 0) as "riskScore",
          COALESCE(ar.risk_grade, 'F') as "riskGrade",
          s.error_message as "errorMessage", s.repo_id as "repoId"
        FROM scans s
        LEFT JOIN analysis_reports ar ON s.id = ar.scan_id
        WHERE s.repo_id IN (${sql.join(repoIds.map(id => sql`${id}`), sql`, `)})
        ORDER BY s.repo_id, s.triggered_at DESC
      `);
      latestScans = scansResult.rows;
    }

    const reposWithLatestScan = rows.map(repo => {
      const latestScan = latestScans.find(s => s.repoId === repo.id) || null;
      return {
        ...repo,
        latestScan,
      };
    });

    res.status(200).json({
      success: true,
      data: {
        repos: reposWithLatestScan,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/repos/:id ───────────────────────────────────────────────────────

const getRepo: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof uuidParams>;

    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);

    if (!repo) return next(NotFoundError("Repository"));

    // Fetch latest scan with finding counts
    const latestScanResult = await db.execute(sql`
      SELECT
        s.id, s.status, s.triggered_at as "scannedAt",
        s.duration_ms as "duration",
        s.total_findings as "totalFindings",
        s.critical_count as critical,
        s.high_count as high,
        s.medium_count as medium,
        s.low_count as low
      FROM scans s
      WHERE s.repo_id = ${id}
      ORDER BY s.triggered_at DESC
      LIMIT 1
    `);

    const latestScan =
      latestScanResult.rows.length > 0 ? latestScanResult.rows[0] : null;

    successResponse(res, { ...repo, latestScan });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/repos/:id ────────────────────────────────────────────────────

const deleteRepo: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof uuidParams>;

    const [existing] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);

    if (!existing) return next(NotFoundError("Repository"));

    // Delete cascade order: AI tables → findings → parsed_artifacts → scans → repo
    await db.transaction(async (tx) => {
      await tx.delete(aiExplanations).where(eq(aiExplanations.repoId, id));
      await tx.delete(aiRemediations).where(eq(aiRemediations.repoId, id));
      await tx.delete(aiPredictions).where(eq(aiPredictions.repoId, id));
      await tx.delete(analysisReports).where(eq(analysisReports.repoId, id));
      await tx.delete(findings).where(eq(findings.repoId, id));
      await tx.delete(parsedArtifacts).where(eq(parsedArtifacts.repoId, id));
      await tx.delete(scans).where(eq(scans.repoId, id));
      await tx.delete(repos).where(eq(repos.id, id));
    });

    successResponse(res, null, 200, "Repository and all associated scans deleted");
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/repos/:id ─────────────────────────────────────────────────────

const updateRepo: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof uuidParams>;
    const body = req.body as z.infer<typeof patchSchema>;

    const [existing] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);

    if (!existing) return next(NotFoundError("Repository"));

    // Deep merge settings
    const mergedSettings =
      body.settings !== undefined
        ? { ...(existing.settings as object), ...(body.settings as object) }
        : existing.settings;

    const updateValues: Partial<typeof repos.$inferInsert> = {
      updatedAt: new Date(),
      settings: mergedSettings,
    };
    if (body.name !== undefined) updateValues.name = body.name;
    if (body.defaultBranch !== undefined) updateValues.defaultBranch = body.defaultBranch;
    if (body.status !== undefined) updateValues.status = body.status;

    await db.update(repos).set(updateValues).where(eq(repos.id, id));

    const [updated] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);

    successResponse(res, updated);
  } catch (err) {
    next(err);
  }
};

// ─── Register routes ──────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  validate(registerSchema),
  registerRepo
);

router.get(
  "/",
  requireAuth,
  validateQuery(listQuerySchema),
  listRepos
);

router.get(
  "/:id",
  requireAuth,
  requireRepoOwner,
  validateParams(uuidParams),
  getRepo
);

router.delete(
  "/:id",
  requireAuth,
  requireRepoOwner,
  validateParams(uuidParams),
  deleteRepo
);

router.patch(
  "/:id",
  requireAuth,
  requireRepoOwner,
  validateParams(uuidParams),
  validate(patchSchema),
  updateRepo
);

export default router;

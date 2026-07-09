import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db/client";
import { repos } from "../db/schema";
import { validateQuery } from "../middleware/validate";
import { AppError } from "../middleware/error-handler";
import { successResponse } from "../utils/response";
import { requireAuth } from "../middleware/auth.middleware";
import { githubUserService } from "../services/github-user.service";
import { enqueueScan } from "../queue/producers";
import { JobPriority } from "../queue/job.types";
import { logger } from "../utils/logger";
import { createRateLimiter } from "../middleware/rate-limiter";
import { RATE_LIMITS } from "../middleware/rate-limit-configs";
import { cacheManager } from "../cache/cache-manager";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const listReposQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(30),
  sort: z
    .enum(["updated", "created", "pushed", "full_name"])
    .default("updated"),
  type: z.enum(["all", "public", "private"]).default("all"),
  search: z.string().optional(),
});

const importRepoSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().default("main"),
  autoScanOnPush: z.boolean().default(false),
});

// ─── GET /api/github/repos ────────────────────────────────────────────────────
// List the logged-in user's GitHub repos for the import modal.

const listGitHubRepos: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.currentUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const q = req.query as unknown as z.infer<typeof listReposQuerySchema>;
    const userId = req.currentUser.id;
    const page = Number(q.page);
    const perPage = Number(q.perPage);
    const sort = q.sort;
    const type = q.type;
    const search = q.search;

    const isDefaultQuery = !search && perPage === 30 && sort === 'updated' && type === 'all';
    if (isDefaultQuery) {
      const cached = await cacheManager.getGithubUserRepos(userId, page);
      if (cached) {
        successResponse(res, cached);
        return;
      }
    }

    const result = await githubUserService.listUserRepos(req.currentUser.id, {
      page,
      perPage,
      sort,
      type,
      ...(search ? { search } : {}),
    });

    if (isDefaultQuery) {
      await cacheManager.setGithubUserRepos(userId, page, result);
    }

    successResponse(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/github/repos/:owner/:repo ───────────────────────────────────────
// Validate access to a specific repo (used when user pastes URL).

const getGitHubRepo: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.currentUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const { owner, repo } = req.params as { owner: string; repo: string };
    const result = await githubUserService.validateRepoAccess(
      req.currentUser.id,
      `https://github.com/${owner}/${repo}`
    );

    successResponse(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/github/repos/:owner/:repo/branches ─────────────────────────────
// List branches for a repo.

const listBranches: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.currentUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const { owner, repo } = req.params as { owner: string; repo: string };
    const branches = await githubUserService.getBranches(
      req.currentUser.id,
      owner,
      repo
    );

    successResponse(res, { branches });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/github/repos/import ────────────────────────────────────────────
// Import a repo from GitHub into the platform.

const importRepo: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.currentUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const body = importRepoSchema.parse(req.body);
    const userId = req.currentUser.id;

    // 1. Validate user has access to this repo
    const ghRepo = await githubUserService.getRepo(
      userId,
      body.owner,
      body.repo
    );

    // 2. Build repoUrl
    const repoUrl = `https://github.com/${body.owner}/${body.repo}`;

    // 3. Check if already imported
    const existing = await db
      .select()
      .from(repos)
      .where(eq(repos.repoUrl, repoUrl))
      .limit(1);

    if (existing.length > 0) {
      successResponse(
        res,
        { repo: existing[0], isNew: false },
        200,
        "Repository already imported"
      );
      return;
    }

    // 4. Create repo record
    const newId = randomUUID();
    const now = new Date();

    await db.insert(repos).values({
      id: newId,
      repoUrl,
      name: `${body.owner}/${body.repo}`,
      provider: "github",
      owner: body.owner,
      repoName: body.repo,
      defaultBranch: ghRepo.default_branch || body.branch,
      userId,
      settings: {
        autoScanOnPush: body.autoScanOnPush,
        notifyOnCritical: true,
        ignorePaths: [],
      },
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });

    const [newRepo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, newId))
      .limit(1);

    // 5. Trigger first scan
    const scanId = randomUUID();
    const scanNow = new Date();

    // Create scan record
    await db.execute(sql`
      INSERT INTO scans (id, repo_id, status, branch, created_at, updated_at, triggered_at, total_files, total_findings, critical_count, high_count, medium_count, low_count)
      VALUES (${scanId}, ${newId}, 'queued', ${ghRepo.default_branch || body.branch}, ${scanNow}, ${scanNow}, ${scanNow}, 0, 0, 0, 0, 0, 0)
    `);

    const job = await enqueueScan({
      scanId,
      repoId: newId,
      repoUrl,
      owner: body.owner,
      repoName: body.repo,
      branch: ghRepo.default_branch || body.branch,
      provider: "github",
      ignorePaths: [],
      priority: JobPriority.NORMAL,
      triggeredBy: "manual",
    });

    logger.info(
      {
        event: "repo_imported_from_github",
        repoId: newId,
        scanId,
        owner: body.owner,
        repo: body.repo,
        jobId: job.jobId,
      },
      "Repository imported from GitHub and scan started"
    );

    successResponse(
      res,
      {
        repo: newRepo,
        scanId,
        isNew: true,
      },
      201,
      "Repository imported and scan started"
    );
  } catch (err) {
    next(err);
  }
};

// ─── Register routes ──────────────────────────────────────────────────────────

router.get(
  "/repos",
  requireAuth,
  createRateLimiter(RATE_LIMITS.githubRepoList),
  validateQuery(listReposQuerySchema),
  listGitHubRepos
);

router.get("/repos/:owner/:repo/branches", requireAuth, listBranches);
router.get("/repos/:owner/:repo", requireAuth, getGitHubRepo);

router.post("/repos/import", requireAuth, importRepo);

export const githubReposRoutes = router;

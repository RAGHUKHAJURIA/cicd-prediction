import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client";
import { repos, aiRemediations, findings } from "../db/schema";
import { AppError } from "../middleware/error-handler";
import { successResponse } from "../utils/response";
import { requireAuth } from "../middleware/auth.middleware";
import { githubUserService, PatchInput } from "../services/github-user.service";
import { logger } from "../utils/logger";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const pushPatchSchema = z.object({
  repoId: z.string().uuid(),
  scanId: z.string().uuid(),
  branch: z.string().default("main"),
  patchIds: z.array(z.string().uuid()).optional(),
});

const createPRSchema = z.object({
  repoId: z.string().uuid(),
  scanId: z.string().uuid(),
  baseBranch: z.string().default("main"),
  patchIds: z.array(z.string().uuid()).optional(),
});

const validateUrlSchema = z.object({
  url: z.string().url(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type RepoRecord = typeof repos.$inferSelect;

async function getRepoAndVerifyOwner(
  repoId: string,
  userId: string
): Promise<RepoRecord> {
  const [repo] = await db
    .select()
    .from(repos)
    .where(eq(repos.id, repoId))
    .limit(1);

  if (!repo) {
    throw new AppError(404, "Repository not found", "NOT_FOUND");
  }

  if (repo.userId !== null && repo.userId !== userId) {
    throw new AppError(403, "Access denied", "FORBIDDEN");
  }

  return repo;
}

async function fetchPatchData(
  scanId: string,
  repoId: string,
  patchIds?: string[]
): Promise<PatchInput[]> {
  // Fetch remediations
  let remediations = await db
    .select()
    .from(aiRemediations)
    .where(
      and(
        eq(aiRemediations.scanId, scanId),
        eq(aiRemediations.repoId, repoId)
      )
    );

  // Filter to specific IDs if provided
  if (patchIds && patchIds.length > 0) {
    const patchIdSet = new Set(patchIds);
    remediations = remediations.filter((r) => patchIdSet.has(r.id));
  }

  // Only include validated patches
  const safeRemediations = remediations.filter((r) => r.safe === true);

  if (safeRemediations.length === 0) {
    throw new AppError(
      422,
      "No validated patches available for this scan",
      "NO_PATCHES"
    );
  }

  // Get file paths from related findings (join on scanId + ruleId)
  const scanFindings = await db
    .select({ ruleId: findings.ruleId, filePath: findings.filePath })
    .from(findings)
    .where(eq(findings.scanId, scanId));

  const ruleToFile = new Map<string, string>();
  for (const f of scanFindings) {
    if (!ruleToFile.has(f.ruleId)) {
      ruleToFile.set(f.ruleId, f.filePath);
    }
  }

  return safeRemediations.map((r) => ({
    ruleId: r.ruleId ?? "unknown",
    filePath: ruleToFile.get(r.ruleId ?? "") ?? "unknown",
    before: r.beforeCode ?? "",
    after: r.afterCode ?? "",
    language: r.language ?? "yaml",
    instructions: r.instructions ?? "",
  }));
}

// ─── POST /api/github/actions/push-patch ──────────────────────────────────────

const pushPatch: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.currentUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const body = pushPatchSchema.parse(req.body);
    const repo = await getRepoAndVerifyOwner(body.repoId, req.currentUser.id);
    const patchData = await fetchPatchData(
      body.scanId,
      body.repoId,
      body.patchIds
    );

    const result = await githubUserService.pushPatchFile(
      req.currentUser.id,
      repo.owner,
      repo.repoName,
      body.branch,
      body.scanId,
      patchData
    );

    logger.info(
      {
        event: "patch_pushed_to_github",
        repoId: body.repoId,
        scanId: body.scanId,
        branch: body.branch,
        patchCount: patchData.length,
        commitSha: result.commitSha,
      },
      "Patch file pushed to GitHub"
    );

    successResponse(res, {
      commitUrl: result.commitUrl,
      commitSha: result.commitSha,
      patchFilePath: result.patchFilePath,
      patchesIncluded: patchData.length,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/github/actions/create-pr ───────────────────────────────────────

const createPR: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.currentUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const body = createPRSchema.parse(req.body);
    const repo = await getRepoAndVerifyOwner(body.repoId, req.currentUser.id);
    const patchData = await fetchPatchData(
      body.scanId,
      body.repoId,
      body.patchIds
    );

    const result = await githubUserService.createPullRequest(
      req.currentUser.id,
      repo.owner,
      repo.repoName,
      body.baseBranch,
      body.scanId,
      patchData
    );

    logger.info(
      {
        event: "pr_created_on_github",
        repoId: body.repoId,
        scanId: body.scanId,
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        patchCount: patchData.length,
      },
      "Pull request created on GitHub"
    );

    successResponse(res, {
      prUrl: result.prUrl,
      prNumber: result.prNumber,
      prTitle: result.prTitle,
      headBranch: result.headBranch,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/github/actions/validate-url ────────────────────────────────────

const validateUrl: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.currentUser) {
      throw new AppError(401, "Authentication required", "UNAUTHORIZED");
    }

    const body = validateUrlSchema.parse(req.body);
    const result = await githubUserService.validateRepoAccess(
      req.currentUser.id,
      body.url
    );

    successResponse(res, result);
  } catch (err) {
    next(err);
  }
};

// ─── Register routes ──────────────────────────────────────────────────────────

router.post("/push-patch", requireAuth, pushPatch);
router.post("/create-pr", requireAuth, createPR);
router.post("/validate-url", requireAuth, validateUrl);

export const githubActionsRoutes = router;

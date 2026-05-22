import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "../db/client";
import { scans } from "../db/schema";
import { validate, validateParams } from "../middleware/validate";
import { AppError } from "../middleware/error-handler";
import { createRateLimiter } from "../middleware/rate-limiter";
import { publicAnalyzer } from "../services/public-analyzer";
import { successResponse } from "../utils/response";

const router = Router();

// 10 scans per hour rate limiter
const scanRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyPrefix: "scan",
  message: "Rate limit exceeded. You can perform up to 10 repository scans per hour.",
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const analyzeRequestSchema = z.object({
  repoUrl: z
    .string()
    .url("Please provide a valid repository URL")
    .refine(
      (u) =>
        u.includes("github.com") ||
        u.includes("gitlab.com") ||
        u.endsWith(".git"),
      { message: "URL must be a GitHub, GitLab, or a .git URL" }
    ),
  branch: z.string().min(1).default("main"),
  token: z.string().optional(),
});

const scanIdParams = z.object({
  scanId: z.string().uuid("Scan ID must be a valid UUID"),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Provider = "github" | "gitlab" | "gitea" | "self-hosted";

function detectProvider(repoUrl: string): Provider {
  if (repoUrl.includes("github.com")) return "github";
  if (repoUrl.includes("gitlab.com")) return "gitlab";
  return "self-hosted";
}

function extractOwnerRepo(repoUrl: string): { owner: string; repoName: string } {
  try {
    const url = new URL(repoUrl);
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) {
      throw new Error();
    }
    return { owner: parts[0]!, repoName: parts.slice(1).join("/") };
  } catch {
    throw new AppError(422, "Cannot extract owner/repo from URL", "INVALID_REPO_URL");
  }
}

// ─── POST /api/analyze ────────────────────────────────────────────────────────

const analyzeRepo: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { repoUrl, branch, token } = req.body as z.infer<typeof analyzeRequestSchema>;
    const provider = detectProvider(repoUrl);
    const { owner, repoName } = extractOwnerRepo(repoUrl);

    // 1. Create or Find Repository
    const { repo } = await publicAnalyzer.findOrCreateRepo(
      repoUrl,
      owner,
      repoName,
      provider,
      branch
    );

    // 2. Ephemerally store temporary token in Redis if provided
    if (token) {
      await publicAnalyzer.storeEphemeralToken(repo.id, token);
    }

    // 3. Insert new scan record as queued
    const scanId = randomUUID();
    const now = new Date();
    await db.insert(scans).values({
      id: scanId,
      repoId: repo.id,
      status: "queued",
      branch,
      createdAt: now,
      updatedAt: now,
      triggeredAt: now,
      totalFiles: 0,
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    });

    // 4. Trigger Analysis (adds to scan-queue)
    await publicAnalyzer.triggerAnalysis(repo.id, scanId, branch, {
      includeAI: true,
      maxFiles: 100,
    });

    res.status(202).json({
      success: true,
      message: "Public repository scan queued successfully",
      data: {
        scanId,
        repoId: repo.id,
        repoName: repo.name,
        branch,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/analyze/:scanId/status ──────────────────────────────────────────

const getScanStatus: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { scanId } = req.params as unknown as z.infer<typeof scanIdParams>;
    const status = await publicAnalyzer.getLayerStatus(scanId);
    successResponse(res, status);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/analyze/:scanId/results ─────────────────────────────────────────

const getScanResults: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { scanId } = req.params as unknown as z.infer<typeof scanIdParams>;
    const results = await publicAnalyzer.getFullResults(scanId);
    successResponse(res, results);
  } catch (err) {
    next(err);
  }
};

// ─── Register routes ──────────────────────────────────────────────────────────

router.post("/", scanRateLimiter, validate(analyzeRequestSchema), analyzeRepo);
router.get("/:scanId/status", validateParams(scanIdParams), getScanStatus);
router.get("/:scanId/results", validateParams(scanIdParams), getScanResults);

export default router;

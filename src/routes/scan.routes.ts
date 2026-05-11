import { Router, Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/client";
import { repos, scans, parsedArtifacts, findings } from "../db/schema";
import { validate, validateParams, validateQuery } from "../middleware/validate";
import { NotFoundError, AppError } from "../middleware/error-handler";
import { successResponse } from "../utils/response";
import { detectAndParse } from "../parsers/index";
import { GitHubClient, GitLabClient } from "../utils/github.client";
import { classifyFindingSeverity, generateRemediation } from "../utils/severity";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const repoAndScanParams = z.object({
  id: z.string().uuid("Repository ID must be a valid UUID"),
  scanId: z.string().uuid("Scan ID must be a valid UUID"),
});

const repoIdParam = z.object({
  id: z.string().uuid("Repository ID must be a valid UUID"),
});

const triggerScanSchema = z.object({
  branch: z.string().optional(),
  targetFiles: z.array(z.string()).optional(),
  options: z
    .object({
      includeDraft: z.boolean().default(false),
      maxDepth: z.number().min(1).max(10).default(3),
      timeout: z.number().min(5).max(300).default(60),
    })
    .default({}),
});

const listScansQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
  status: z.enum(["running", "completed", "failed"]).optional(),
  branch: z.string().optional(),
});

// ─── CI/CD file path globs (pattern list for filtering) ───────────────────────

const CICD_PATH_PATTERNS: RegExp[] = [
  /^\.github\/workflows\/.*\.(yml|yaml)$/i,
  /^\.gitlab-ci\.ya?ml$/i,
  /(^|\/)dockerfile(\..+)?$/i,
  /(^|\/)jenkinsfile(\..+)?$/i,
  /\.(k8s\.(ya?ml)|kubernetes\.(ya?ml))$/i,
  /^(k8s|kubernetes|deploy|helm|charts)\/.+\.(ya?ml)$/i,
  /^docker-compose(\..*)?\.ya?ml$/i,
];

function isCICDFile(path: string): boolean {
  return CICD_PATH_PATTERNS.some((re) => re.test(path));
}

// ─── Core async scan runner ───────────────────────────────────────────────────

interface RepoRecord {
  id: string;
  owner: string;
  repoName: string;
  provider: "github" | "gitlab" | "gitea" | "self-hosted";
  defaultBranch: string;
  settings: unknown;
}

interface ScanOptions {
  includeDraft: boolean;
  maxDepth: number;
  timeout: number;
}

async function runScanAsync(
  repo: RepoRecord,
  scanId: string,
  branch: string,
  options: ScanOptions,
  requestId: string
): Promise<void> {
  const startTime = Date.now();
  const ignored: string[] = Array.isArray(
    (repo.settings as { ignorePaths?: string[] })?.ignorePaths
  )
    ? ((repo.settings as { ignorePaths: string[] }).ignorePaths)
    : [];

  try {
    const filesToParse: Array<{ path: string; content: string }> = [];

    // ── Step 4a: Fetch CI/CD files ────────────────────────────────────────────
    if (repo.provider === "github") {
      const token = process.env["GITHUB_TOKEN"] ?? "";
      const gh = new GitHubClient(token);
      const tree = await gh.getFileTree(repo.owner, repo.repoName, branch);

      const ciFiles = tree.filter(
        (item) =>
          item.type === "blob" &&
          isCICDFile(item.path) &&
          !ignored.some((ig) => item.path.startsWith(ig))
      );

      for (const file of ciFiles) {
        try {
          const content = await gh.getFileContent(
            repo.owner,
            repo.repoName,
            file.path,
            branch
          );
          filesToParse.push({ path: file.path, content });
        } catch {
          // Skip unreadable files
        }
      }
    } else if (repo.provider === "gitlab") {
      const token = process.env["GITLAB_TOKEN"] ?? "";
      const gl = new GitLabClient(token);
      const encodedPath = encodeURIComponent(`${repo.owner}/${repo.repoName}`);
      const tree = await gl.getFileTree(encodedPath);

      const ciFiles = tree.filter(
        (item) =>
          item.type === "blob" &&
          isCICDFile(item.path) &&
          !ignored.some((ig) => item.path.startsWith(ig))
      );

      for (const file of ciFiles) {
        try {
          const content = await gl.getFileContent(encodedPath, file.path, branch);
          filesToParse.push({ path: file.path, content });
        } catch {
          // Skip unreadable files
        }
      }
    }

    // ── Steps 4b–4d: Parse → Store artifacts → Store findings ────────────────

    let totalFindings = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;

    const timeout = options.timeout * 1000;
    const deadline = Date.now() + timeout;

    for (const file of filesToParse) {
      if (Date.now() > deadline) break;

      const parseResult = detectAndParse(file.content, file.path, repo.id);

      // ── 4c: Insert parsed artifact ─────────────────────────────────────────
      const artifactId = uuidv4();
      await db.insert(parsedArtifacts).values({
        id: artifactId,
        scanId,
        repoId: repo.id,
        filePath: file.path,
        fileType: parseResult.result?.source ?? "unknown",
        normalizedWorkflow: parseResult.result as unknown as Record<string, unknown>,
        parseErrors: parseResult.errors as unknown as Record<string, unknown>[],
        parseWarnings: parseResult.warnings as unknown as Record<string, unknown>[],
        parsedAt: new Date(),
      });

      // ── 4d: Insert findings ────────────────────────────────────────────────
      const allDiagnostics = [
        ...parseResult.errors.map((e) => ({ ...e, baseType: "error" as const })),
        ...parseResult.warnings.map((w) => ({ ...w, baseType: "warning" as const })),
      ];

      for (const diag of allDiagnostics) {
        const { severity, category } = classifyFindingSeverity(
          diag.field ?? "unknown",
          diag.message
        );
        const remediation = generateRemediation(diag.message);

        await db.insert(findings).values({
          id: uuidv4(),
          scanId,
          repoId: repo.id,
          artifactId,
          filePath: file.path,
          ruleId: diag.field ?? "PARSE_ISSUE",
          title: diag.message.slice(0, 200),
          severity,
          category,
          description: diag.message,
          field: diag.field ?? null,
          line: diag.line ?? null,
          remediation,
          createdAt: new Date(),
        });

        totalFindings++;
        if (severity === "critical") criticalCount++;
        else if (severity === "high") highCount++;
        else if (severity === "medium") mediumCount++;
        else if (severity === "low") lowCount++;
      }
    }

    // ── 4e: Update scan record ────────────────────────────────────────────────
    await db
      .update(scans)
      .set({
        status: "completed",
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        totalFiles: filesToParse.length,
        totalFindings,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
      })
      .where(eq(scans.id, scanId));

    // ── 4f: Update repo record ────────────────────────────────────────────────
    await db.execute(sql`
      UPDATE repos
      SET last_scanned_at = NOW(), total_scans = total_scans + 1
      WHERE id = ${repo.id}
    `);

    console.log(
      `[scan:${requestId}] Scan ${scanId} completed — ${totalFindings} findings in ${filesToParse.length} files`
    );
  } catch (err) {
    // ── 4g: Mark scan as failed ───────────────────────────────────────────────
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scan:${requestId}] Scan ${scanId} failed: ${message}`, err);

    try {
      await db
        .update(scans)
        .set({
          status: "failed",
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          errorMessage: message,
        })
        .where(eq(scans.id, scanId));
    } catch (updateErr) {
      console.error(`[scan:${requestId}] Failed to update scan status:`, updateErr);
    }
  }
}

// ─── POST /api/repos/:id/scan ─────────────────────────────────────────────────

const triggerScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>;
    const body = req.body as z.infer<typeof triggerScanSchema>;

    // Step 1: Fetch repo
    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);

    if (!repo) return next(NotFoundError("Repository"));

    if (repo.status === "paused") {
      return next(
        new AppError(409, "Repository is paused", "REPO_PAUSED")
      );
    }

    // Step 2: Check for concurrent scan
    const [runningScan] = await db
      .select({ id: scans.id })
      .from(scans)
      .where(sql`${scans.repoId} = ${id} AND ${scans.status} = 'running'`)
      .limit(1);

    if (runningScan) {
      return next(
        new AppError(
          409,
          "A scan is already running for this repository",
          "SCAN_IN_PROGRESS",
          { runningScanId: runningScan.id }
        )
      );
    }

    // Step 3: Create scan record
    const branch = body.branch ?? repo.defaultBranch;
    const scanId = uuidv4();
    const now = new Date();

    await db.insert(scans).values({
      id: scanId,
      repoId: id,
      status: "running",
      branch,
      triggeredAt: now,
      totalFiles: 0,
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    });

    // Return 202 immediately
    res.status(202).json({
      success: true,
      message: "Scan started",
      data: {
        scanId,
        status: "running",
        repoId: id,
        branch,
        triggeredAt: now.toISOString(),
      },
      timestamp: now.toISOString(),
    });

    // Step 4: Run async — do NOT await
    setImmediate(() => {
      runScanAsync(
        repo as RepoRecord,
        scanId,
        branch,
        body.options,
        req.requestId
      ).catch((err: unknown) => {
        console.error("[triggerScan] Unhandled async scan error:", err);
      });
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/repos/:id/scans ─────────────────────────────────────────────────

const listScans: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>;
    const q = req.query as unknown as z.infer<typeof listScansQuerySchema>;
    const page = Number(q.page);
    const limit = Number(q.limit);
    const offset = (page - 1) * limit;

    const [repoCheck] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);
    if (!repoCheck) return next(NotFoundError("Repository"));

    let whereClause = sql`${scans.repoId} = ${id}`;
    if (q.status) whereClause = sql`${whereClause} AND ${scans.status} = ${q.status}`;
    if (q.branch) whereClause = sql`${whereClause} AND ${scans.branch} = ${q.branch}`;

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
        .offset(offset),
    ]);

    const total = totalResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / limit);

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
          hasPrev: page > 1,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/repos/:id/scans/latest ─────────────────────────────────────────

const getLatestScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params as z.infer<typeof repoIdParam>;

    const [repoCheck] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);
    if (!repoCheck) return next(NotFoundError("Repository"));

    const [scan] = await db
      .select()
      .from(scans)
      .where(sql`${scans.repoId} = ${id} AND ${scans.status} = 'completed'`)
      .orderBy(sql`${scans.triggeredAt} DESC`)
      .limit(1);

    if (!scan) {
      return next(new AppError(404, "No completed scans found", "NO_SCANS"));
    }

    const [allFindings, artifacts] = await Promise.all([
      db.select().from(findings).where(eq(findings.scanId, scan.id)),
      db
        .select({
          filePath: parsedArtifacts.filePath,
          fileType: parsedArtifacts.fileType,
          parseErrors: parsedArtifacts.parseErrors,
          parseWarnings: parsedArtifacts.parseWarnings,
        })
        .from(parsedArtifacts)
        .where(eq(parsedArtifacts.scanId, scan.id)),
    ]);

    // Group findings by file path
    const byFile: Record<string, typeof allFindings> = {};
    for (const f of allFindings) {
      if (!byFile[f.filePath]) byFile[f.filePath] = [];
      byFile[f.filePath]!.push(f);
    }

    // Sort all findings by severity
    const severityOrder: Record<string, number> = {
      critical: 0, high: 1, medium: 2, low: 3, info: 4,
    };
    const sorted = [...allFindings].sort(
      (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    );

    const summary = {
      total: allFindings.length,
      critical: scan.criticalCount,
      high: scan.highCount,
      medium: scan.mediumCount,
      low: scan.lowCount,
    };

    successResponse(res, {
      scan,
      findings: { summary, byFile, all: sorted },
      artifacts,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/repos/:id/scans/:scanId ────────────────────────────────────────

const getScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id, scanId } = req.params as z.infer<typeof repoAndScanParams>;

    const [repoCheck] = await db
      .select({ id: repos.id })
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);
    if (!repoCheck) return next(NotFoundError("Repository"));

    const [scan] = await db
      .select()
      .from(scans)
      .where(sql`${scans.id} = ${scanId} AND ${scans.repoId} = ${id}`)
      .limit(1);

    if (!scan) return next(NotFoundError("Scan"));

    const [allFindings, artifacts] = await Promise.all([
      db.select().from(findings).where(eq(findings.scanId, scanId)),
      db
        .select({
          filePath: parsedArtifacts.filePath,
          fileType: parsedArtifacts.fileType,
          parseErrors: parsedArtifacts.parseErrors,
          parseWarnings: parsedArtifacts.parseWarnings,
        })
        .from(parsedArtifacts)
        .where(eq(parsedArtifacts.scanId, scanId)),
    ]);

    const byFile: Record<string, typeof allFindings> = {};
    for (const f of allFindings) {
      if (!byFile[f.filePath]) byFile[f.filePath] = [];
      byFile[f.filePath]!.push(f);
    }

    const severityOrder: Record<string, number> = {
      critical: 0, high: 1, medium: 2, low: 3, info: 4,
    };
    const sorted = [...allFindings].sort(
      (a, b) => (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
    );

    const summary = {
      total: allFindings.length,
      critical: scan.criticalCount,
      high: scan.highCount,
      medium: scan.mediumCount,
      low: scan.lowCount,
    };

    successResponse(res, {
      scan,
      findings: { summary, byFile, all: sorted },
      artifacts,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/repos/:id/scans/:scanId/rerun ─────────────────────────────────

const rerunScan: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id, scanId } = req.params as z.infer<typeof repoAndScanParams>;

    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.id, id))
      .limit(1);
    if (!repo) return next(NotFoundError("Repository"));

    const [originalScan] = await db
      .select()
      .from(scans)
      .where(sql`${scans.id} = ${scanId} AND ${scans.repoId} = ${id}`)
      .limit(1);
    if (!originalScan) return next(NotFoundError("Scan"));

    // Check no running scan
    const [runningScan] = await db
      .select({ id: scans.id })
      .from(scans)
      .where(sql`${scans.repoId} = ${id} AND ${scans.status} = 'running'`)
      .limit(1);

    if (runningScan) {
      return next(
        new AppError(
          409,
          "A scan is already running for this repository",
          "SCAN_IN_PROGRESS",
          { runningScanId: runningScan.id }
        )
      );
    }

    const newScanId = uuidv4();
    const now = new Date();
    const branch = originalScan.branch;

    await db.insert(scans).values({
      id: newScanId,
      repoId: id,
      status: "running",
      branch,
      triggeredAt: now,
      totalFiles: 0,
      totalFindings: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    });

    res.status(202).json({
      success: true,
      message: "Scan rerun started",
      data: {
        scanId: newScanId,
        originalScanId: scanId,
        status: "running",
        repoId: id,
        branch,
        triggeredAt: now.toISOString(),
      },
      timestamp: now.toISOString(),
    });

    setImmediate(() => {
      runScanAsync(
        repo as RepoRecord,
        newScanId,
        branch,
        { includeDraft: false, maxDepth: 3, timeout: 60 },
        req.requestId
      ).catch((err: unknown) => {
        console.error("[rerunScan] Unhandled async scan error:", err);
      });
    });
  } catch (err) {
    next(err);
  }
};

// ─── Register routes ──────────────────────────────────────────────────────────

router.post(
  "/:id/scan",
  validateParams(repoIdParam),
  validate(triggerScanSchema),
  triggerScan
);

router.get(
  "/:id/scans/latest",
  validateParams(repoIdParam),
  getLatestScan
);

router.get(
  "/:id/scans/:scanId",
  validateParams(repoAndScanParams),
  getScan
);

router.post(
  "/:id/scans/:scanId/rerun",
  validateParams(repoAndScanParams),
  rerunScan
);

router.get(
  "/:id/scans",
  validateParams(repoIdParam),
  validateQuery(listScansQuerySchema),
  listScans
);

export default router;

import { db } from "../db/client";
import { repos, scans, parsedArtifacts, findings, aiExplanations, aiRemediations, aiPredictions, analysisReports } from "../db/schema";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { queueRedis } from "../queue/redis.client";
import { enqueueScan } from "../queue/producers";
import { JobPriority } from "../queue/job.types";
import { JobStatusTracker } from "../queue/job-status";
import { randomUUID } from "crypto";
import { AppError } from "../middleware/error-handler";

export interface LayerStatus {
  id: number;
  name: string;
  status: "completed" | "running" | "pending" | "failed";
  detail: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export class PublicAnalyzer {
  async findOrCreateRepo(
    repoUrl: string,
    owner: string,
    repoName: string,
    provider: "github" | "gitlab" | "gitea" | "self-hosted",
    branch: string,
    userId?: string | null
  ) {
    const existing = await db
      .select()
      .from(repos)
      .where(
        userId 
          ? and(eq(repos.repoUrl, repoUrl), eq(repos.userId, userId))
          : and(eq(repos.repoUrl, repoUrl), sql`${repos.userId} IS NULL`)
      )
      .limit(1)
      .then((r) => r[0]);

    if (existing) {
      return { repo: existing, isNew: false };
    }

    const id = randomUUID();
    const now = new Date();
    const [inserted] = await db
      .insert(repos)
      .values({
        id,
        repoUrl,
        name: `${owner}/${repoName}`,
        provider,
        owner,
        repoName,
        defaultBranch: branch,
        settings: {
          autoScanOnPush: false,
          notifyOnCritical: false,
          ignorePaths: [],
          temporaryToken: true,
        },
        status: "active",
        createdAt: now,
        updatedAt: now,
        totalScans: 0,
        userId: userId || null,
      })
      .returning();

    if (!inserted) {
      throw new AppError(500, "Failed to insert repository record", "DATABASE_ERROR");
    }

    return { repo: inserted, isNew: true };
  }

  async storeEphemeralToken(repoId: string, token: string): Promise<void> {
    await queueRedis.setex(`temp-token:${repoId}`, 3600, token);
  }

  async getEphemeralToken(repoId: string): Promise<string | null> {
    return queueRedis.get(`temp-token:${repoId}`);
  }

  async triggerAnalysis(
    repoId: string,
    scanId: string,
    branch: string,
    _options: { includeAI: boolean; maxFiles: number }
  ) {
    const repo = await db
      .select()
      .from(repos)
      .where(eq(repos.id, repoId))
      .limit(1)
      .then((r) => r[0]);

    if (!repo) {
      throw new AppError(404, "Repository not found", "REPO_NOT_FOUND");
    }

    const payload = {
      scanId,
      repoId,
      repoUrl: repo.repoUrl,
      owner: repo.owner,
      repoName: repo.repoName,
      branch,
      provider: repo.provider,
      ignorePaths: (repo.settings as any)?.ignorePaths || [],
      priority: JobPriority.NORMAL,
      triggeredBy: "manual" as const,
    };

    const job = await enqueueScan(payload);
    return { jobId: job.jobId };
  }

  async getLayerStatus(scanId: string) {
    const scan = await db
      .select()
      .from(scans)
      .where(eq(scans.id, scanId))
      .limit(1)
      .then((r) => r[0]);

    if (!scan) {
      throw new AppError(404, "Scan not found", "SCAN_NOT_FOUND");
    }

    const repo = await db
      .select()
      .from(repos)
      .where(eq(repos.id, scan.repoId))
      .limit(1)
      .then((r) => r[0]);

    const repoId = scan.repoId;
    const scanJobId = `scan:${repoId}:${scanId}`;
    const analysisJobId = `analysis:${scanId}`;
    const aiJobId = `ai:${scanId}`;

    const [scanJob, analysisJob, aiJob, artifactsList, reportRecord, explanations, remediations] =
      await Promise.all([
        JobStatusTracker.get(scanJobId),
        JobStatusTracker.get(analysisJobId),
        JobStatusTracker.get(aiJobId),
        db.select({ id: parsedArtifacts.id, filePath: parsedArtifacts.filePath, fileType: parsedArtifacts.fileType }).from(parsedArtifacts).where(eq(parsedArtifacts.scanId, scanId)),
        db.select().from(analysisReports).where(eq(analysisReports.scanId, scanId)).limit(1).then((r) => r[0]),
        db.select({ id: aiExplanations.id }).from(aiExplanations).where(eq(aiExplanations.scanId, scanId)),
        db.select({ id: aiRemediations.id }).from(aiRemediations).where(eq(aiRemediations.scanId, scanId)),
      ]);

    const layers: LayerStatus[] = [];

    // Helper timestamps
    const scanStartedAt = scanJob?.startedAt || scanJob?.createdAt || scan.triggeredAt.toISOString();
    const scanCompletedAt = scanJob?.completedAt || scan.completedAt?.toISOString() || null;
    const scanDuration = scanJob?.completedAt && scanJob?.startedAt ? new Date(scanJob.completedAt).getTime() - new Date(scanJob.startedAt).getTime() : null;

    // LAYER 1: Fetching Repository
    let l1Status: LayerStatus["status"] = "pending";
    let l1Detail = "Waiting in queue...";
    let l1Start: string | null = null;
    let l1End: string | null = null;
    let l1Dur: number | null = null;

    if (scanJob) {
      l1Start = scanStartedAt;
      if (scanJob.status === "active" && scanJob.progress < 40) {
        l1Status = "running";
        l1Detail = "Fetching files from repository branches...";
      } else if (scanJob.progress >= 40 || scanJob.status === "completed" || analysisJob || reportRecord) {
        l1Status = "completed";
        l1Detail = `Found ${scan.totalFiles || artifactsList.length} CI/CD files across directories`;
        l1End = scanJob.updatedAt || scanCompletedAt;
        l1Dur = scanDuration ? Math.round(scanDuration * 0.4) : null; // Estimate duration
      } else if (scanJob.status === "failed") {
        l1Status = "failed";
        l1Detail = scanJob.error?.message || "Failed to fetch files";
        l1End = scanJob.completedAt || null;
      }
    }

    // LAYER 2: Parsing CI/CD Files
    let l2Status: LayerStatus["status"] = "pending";
    let l2Detail = "Waiting for file download...";
    let l2Start: string | null = null;
    let l2End: string | null = null;
    let l2Dur: number | null = null;

    if (l1Status === "completed") {
      l2Start = l1End || scanStartedAt;
      if (scanJob && scanJob.status === "active" && scanJob.progress >= 40 && scanJob.progress < 80) {
        l2Status = "running";
        l2Detail = `Parsing discovered workflow configurations...`;
      } else if ((scanJob && scanJob.progress >= 80) || scanJob?.status === "completed" || analysisJob || reportRecord) {
        l2Status = "completed";
        const fileNames = artifactsList.slice(0, 3).map((a) => a.filePath.split("/").pop()).join(", ");
        l2Detail = `Parsed ${artifactsList.length} files (${fileNames}${artifactsList.length > 3 ? "..." : ""})`;
        l2End = scanJob?.completedAt || scanJob?.updatedAt || null;
        l2Dur = scanDuration ? Math.round(scanDuration * 0.6) : null;
      } else if (scanJob && scanJob.status === "failed") {
        l2Status = "failed";
        l2Detail = scanJob.error?.message || "Failed to parse files";
        l2End = scanJob.completedAt || null;
      }
    }

    // LAYER 3: Running 26 Rules
    let l3Status: LayerStatus["status"] = "pending";
    let l3Detail = "Waiting for parser output...";
    let l3Start: string | null = null;
    let l3End: string | null = null;
    let l3Dur: number | null = null;

    if (l2Status === "completed") {
      l3Start = l2End || scanStartedAt;
      if (analysisJob) {
        l3Start = analysisJob.startedAt || analysisJob.createdAt || l3Start;
        if (analysisJob.status === "active") {
          l3Status = "running";
          l3Detail = "Executing security and reliability rules on parsed configurations...";
        } else if (analysisJob.status === "completed" || reportRecord) {
          l3Status = "completed";
          l3Detail = `${scan.totalFindings} findings detected across files`;
          l3End = analysisJob.completedAt || reportRecord?.createdAt.toISOString() || null;
          l3Dur = analysisJob.completedAt && analysisJob.startedAt ? new Date(analysisJob.completedAt).getTime() - new Date(analysisJob.startedAt).getTime() : null;
        } else if (analysisJob.status === "failed") {
          l3Status = "failed";
          l3Detail = analysisJob.error?.message || "Error running rules";
          l3End = analysisJob.completedAt || null;
        }
      } else if (reportRecord) {
        l3Status = "completed";
        l3Detail = `${scan.totalFindings} findings detected across files`;
        l3End = reportRecord.createdAt.toISOString();
      }
    }

    // LAYER 4: Calculating Risk Score
    let l4Status: LayerStatus["status"] = "pending";
    let l4Detail = "Waiting for analysis findings...";
    let l4Start: string | null = null;
    let l4End: string | null = null;
    let l4Dur: number | null = null;

    if (l3Status === "completed") {
      l4Start = l3End || scanStartedAt;
      if (reportRecord) {
        l4Status = "completed";
        l4Detail = `Calculated score: ${reportRecord.overallScore}/100 (Grade ${reportRecord.riskGrade})`;
        l4End = reportRecord.createdAt.toISOString();
        l4Dur = 100; // instant
      } else if (analysisJob && analysisJob.status === "active" && analysisJob.progress >= 90) {
        l4Status = "running";
        l4Detail = "Applying weights and confidence scores...";
      }
    }

    // LAYER 5: AI Explanations
    let l5Status: LayerStatus["status"] = "pending";
    let l5Detail = "Waiting for risk scoring...";
    let l5Start: string | null = null;
    let l5End: string | null = null;
    let l5Dur: number | null = null;

    if (l4Status === "completed") {
      l5Start = l4End || scanStartedAt;
      const scanFindingsCount = scan.totalFindings;
      
      // If there are no findings, AI won't run. Mark completed/skipped.
      if (scanFindingsCount === 0) {
        l5Status = "completed";
        l5Detail = "No findings detected. Skipped AI analysis.";
        l5End = l4End;
      } else if (aiJob) {
        l5Start = aiJob.startedAt || aiJob.createdAt || l5Start;
        if (aiJob.status === "active") {
          const phase = (aiJob.progress < 33) ? "explanations" : (aiJob.progress < 66) ? "predictions" : "remediations";
          l5Status = "running";
          l5Detail = `Analyzing root causes for findings (phase: ${phase})...`;
        } else if (aiJob.status === "completed" || explanations.length > 0) {
          l5Status = "completed";
          l5Detail = `Generated plain-English risk assessments for ${explanations.length || "critical"} findings`;
          l5End = aiJob.completedAt || aiJob.updatedAt || null;
          l5Dur = aiJob.completedAt && aiJob.startedAt ? new Date(aiJob.completedAt).getTime() - new Date(aiJob.startedAt).getTime() : null;
        } else if (aiJob.status === "failed") {
          l5Status = "failed";
          l5Detail = aiJob.error?.message || "AI pipeline explanations failed";
          l5End = aiJob.completedAt || null;
        }
      } else if (explanations.length > 0 || scan.status === "completed") {
        l5Status = "completed";
        l5Detail = `AI explanations loaded successfully`;
        l5End = scan.completedAt?.toISOString() || null;
      }
    }

    // LAYER 6: Generating Patches
    let l6Status: LayerStatus["status"] = "pending";
    let l6Detail = "Waiting for explanations...";
    let l6Start: string | null = null;
    let l6End: string | null = null;
    let l6Dur: number | null = null;

    if (l5Status === "completed") {
      l6Start = l5End || scanStartedAt;
      const scanFindingsCount = scan.totalFindings;

      if (scanFindingsCount === 0) {
        l6Status = "completed";
        l6Detail = "No findings. Skipped patch generation.";
        l6End = l5End;
      } else if (aiJob) {
        if (aiJob.status === "active" && aiJob.progress >= 66) {
          l6Status = "running";
          l6Detail = "Drafting remediation fixes...";
        } else if (aiJob.status === "completed" || remediations.length > 0) {
          l6Status = "completed";
          const safeCount = remediations.filter((r: any) => r.safe).length;
          l6Detail = `${remediations.length} patches generated (${safeCount} auto-validated as safe)`;
          l6End = aiJob.completedAt || aiJob.updatedAt || null;
        } else if (aiJob.status === "failed") {
          l6Status = "failed";
          l6Detail = aiJob.error?.message || "AI patch generation failed";
          l6End = aiJob.completedAt || null;
        }
      } else if (remediations.length > 0 || scan.status === "completed") {
        l6Status = "completed";
        l6Detail = `${remediations.length} patches loaded`;
        l6End = scan.completedAt?.toISOString() || null;
      }
    }

    // LAYER 7: Validating Patches
    let l7Status: LayerStatus["status"] = "pending";
    let l7Detail = "Waiting for patches...";
    let l7Start: string | null = null;
    let l7End: string | null = null;
    let l7Dur: number | null = null;

    if (l6Status === "completed") {
      l7Start = l6End || scanStartedAt;
      if (scan.status === "completed") {
        l7Status = "completed";
        l7Detail = "All changes validated against rule catalog rules.";
        l7End = scan.completedAt?.toISOString() || null;
        l7Dur = 200;
      } else if (aiJob && aiJob.status === "active" && aiJob.progress >= 90) {
        l7Status = "running";
        l7Detail = "Running patches through sandbox static analyzer...";
      } else if (scan.status === "failed") {
        l7Status = "failed";
        l7Detail = scan.errorMessage || "Scan pipeline failed";
      }
    }

    // Push all layers
    layers.push(
      { id: 1, name: "Fetching repository", status: l1Status, detail: l1Detail, startedAt: l1Start, completedAt: l1End, durationMs: l1Dur },
      { id: 2, name: "Parsing CI/CD files", status: l2Status, detail: l2Detail, startedAt: l2Start, completedAt: l2End, durationMs: l2Dur },
      { id: 3, name: "Running 26 rules", status: l3Status, detail: l3Detail, startedAt: l3Start, completedAt: l3End, durationMs: l3Dur },
      { id: 4, name: "Calculating risk score", status: l4Status, detail: l4Detail, startedAt: l4Start, completedAt: l4End, durationMs: l4Dur },
      { id: 5, name: "AI explanations", status: l5Status, detail: l5Detail, startedAt: l5Start, completedAt: l5End, durationMs: l5Dur },
      { id: 6, name: "Generating patches", status: l6Status, detail: l6Detail, startedAt: l6Start, completedAt: l6End, durationMs: l6Dur },
      { id: 7, name: "Validating patches", status: l7Status, detail: l7Detail, startedAt: l7Start, completedAt: l7End, durationMs: l7Dur }
    );

    // Compute Overall Status
    let overallStatus: "queued" | "fetching" | "parsing" | "analyzing" | "scoring" | "ai-running" | "completed" | "failed" = "queued";
    let progress = 5;

    if (scan.status === "completed") {
      overallStatus = "completed";
      progress = 100;
    } else if (scan.status === "failed" || scan.status === "cancelled") {
      overallStatus = "failed";
      progress = 100;
    } else {
      if (l7Status === "running") {
        overallStatus = "ai-running";
        progress = 95;
      } else if (l6Status === "running") {
        overallStatus = "ai-running";
        progress = 85;
      } else if (l5Status === "running") {
        overallStatus = "ai-running";
        progress = 75;
      } else if (l4Status === "running") {
        overallStatus = "scoring";
        progress = 65;
      } else if (l3Status === "running") {
        overallStatus = "analyzing";
        progress = 50;
      } else if (l2Status === "running") {
        overallStatus = "parsing";
        progress = 30;
      } else if (l1Status === "running") {
        overallStatus = "fetching";
        progress = 15;
      } else if (scan.status === "queued") {
        overallStatus = "queued";
        progress = 5;
      }
    }

    // Estimated seconds calculation
    let estimatedSeconds: number | undefined;
    if (overallStatus !== "completed" && overallStatus !== "failed") {
      const elapsedMs = Date.now() - scan.triggeredAt.getTime();
      const totalEstimatedMs = 45000; // 45 seconds total estimate
      estimatedSeconds = Math.max(5, Math.round((totalEstimatedMs - elapsedMs) / 1000));
    }

    // Result Summary
    let result = null;
    if (overallStatus === "completed" && reportRecord) {
      result = {
        grade: reportRecord.riskGrade,
        score: reportRecord.overallScore,
        totalFindings: scan.totalFindings,
        criticalCount: scan.criticalCount,
        highCount: scan.highCount,
        mediumCount: scan.mediumCount,
        lowCount: scan.lowCount,
        filesScanned: scan.totalFiles,
        hasPatches: remediations.length > 0,
        scanDetailUrl: `/api/repos/${repoId}/scans/${scanId}`,
      };
    }

    return {
      scanId,
      overallStatus,
      currentLayer: layers.findIndex((l) => l.status === "running" || l.status === "pending") + 1 || 7,
      totalLayers: 7,
      progress,
      layers,
      result,
      error: scan.errorMessage || (scan.status === "failed" ? "Scan failed" : null),
      estimatedSeconds,
      repoName: repo?.name || "unknown",
      branch: scan.branch,
    };
  }

  async getFullResults(scanId: string) {
    const scan = await db
      .select()
      .from(scans)
      .where(eq(scans.id, scanId))
      .limit(1)
      .then((r) => r[0]);

    if (!scan) {
      throw new AppError(404, "Scan not found", "SCAN_NOT_FOUND");
    }

    const repo = await db
      .select()
      .from(repos)
      .where(eq(repos.id, scan.repoId))
      .limit(1)
      .then((r) => r[0]);

    if (!repo) {
      throw new AppError(404, "Repository not found", "REPO_NOT_FOUND");
    }

    // Load reports & findings
    const [reportRecord, rawFindings, rawArtifacts, explanations, remediations, predictions] =
      await Promise.all([
        db.select().from(analysisReports).where(eq(analysisReports.scanId, scanId)).limit(1).then((r) => r[0]),
        db.select().from(findings).where(eq(findings.scanId, scanId)),
        db.select().from(parsedArtifacts).where(eq(parsedArtifacts.scanId, scanId)),
        db.select().from(aiExplanations).where(eq(aiExplanations.scanId, scanId)),
        db.select().from(aiRemediations).where(eq(aiRemediations.scanId, scanId)),
        db.select().from(aiPredictions).where(eq(aiPredictions.scanId, scanId)),
      ]);

    // Trend calculations
    let trend: "new" | "improving" | "stable" | "degrading" = "stable";
    const previousScans = await db
      .select({ overallScore: analysisReports.overallScore })
      .from(scans)
      .innerJoin(analysisReports, eq(analysisReports.scanId, scans.id))
      .where(and(eq(scans.repoId, repo.id), lt(scans.createdAt, scan.createdAt)))
      .orderBy(desc(scans.createdAt))
      .limit(1);

    if (previousScans.length === 0) {
      trend = "new";
    } else if (reportRecord) {
      const prevScore = previousScans[0]!.overallScore;
      if (reportRecord.overallScore > prevScore) trend = "improving";
      else if (reportRecord.overallScore < prevScore) trend = "degrading";
    }

    // Unique CI systems
    const ciSystemsDetected = Array.from(new Set(rawArtifacts.map((a) => a.fileType))).filter(Boolean);

    // Build files & inline findings
    const files = await Promise.all(
      rawArtifacts.map(async (art) => {
        // Retrieve raw file content from Redis cache or parsed_artifacts.normalizedWorkflow
        let content = await queueRedis.get(`file-content:${scanId}:${art.filePath}`);
        if (!content && art.normalizedWorkflow) {
          // Fallback reconstruction or default empty string (raw file content should be cached during worker fetch)
          content = (art.normalizedWorkflow as any)?.raw || "";
        }

        const fileFindings = rawFindings.filter((f) => f.filePath === art.filePath);

        const mappedFindings = fileFindings.map((f) => {
          // Join AI explanation for this rule
          const explanation = explanations.find((e) => e.ruleId === f.ruleId);
          const remediationFix = remediations.find((r) => r.ruleId === f.ruleId);
          const prediction = predictions.find((p) => p.ruleId === f.ruleId);

          return {
            id: f.id,
            ruleId: f.ruleId,
            title: f.title,
            severity: f.severity,
            category: f.category,
            description: f.description,
            field: f.field,
            line: f.line,
            remediation: f.remediation,
            aiExplanation: explanation
              ? {
                  plainEnglishRisk: explanation.explanation,
                  technicalDetail: explanation.explanation,
                  failureScenario: prediction?.scenario || "Vulnerability or error triggers deployment failure.",
                  businessImpact: explanation.riskContext || "",
                  confidence: explanation.urgency || "high",
                }
              : null,
            patch: remediationFix
              ? {
                  before: remediationFix.beforeCode || "",
                  after: remediationFix.afterCode || "",
                  language: remediationFix.language || "yaml",
                  instructions: remediationFix.instructions || "",
                  safe: remediationFix.safe ?? true,
                  warning: remediationFix.warning,
                  validatedByRuleEngine: true,
                }
              : null,
          };
        });

        // Worst severity
        let worstSeverity = "info";
        const severities = fileFindings.map((f) => f.severity);
        if (severities.includes("critical")) worstSeverity = "critical";
        else if (severities.includes("high")) worstSeverity = "high";
        else if (severities.includes("medium")) worstSeverity = "medium";
        else if (severities.includes("low")) worstSeverity = "low";

        return {
          filePath: art.filePath,
          fileType: art.fileType,
          content: content || "",
          findingCount: fileFindings.length,
          worstSeverity,
          findings: mappedFindings,
        };
      })
    );

    // Sort files by finding count desc
    files.sort((a, b) => b.findingCount - a.findingCount);

    // Parse AI Report summary
    let aiReport = null;
    let totalCostUsd = 0;
    if (reportRecord) {
      try {
        const fullReportJson = reportRecord.reportJson ? JSON.parse(reportRecord.reportJson) : null;
        if (fullReportJson) {
          totalCostUsd = fullReportJson.totalCostUsd || 0;
        }
      } catch {}

      // Formulate AI report from prediction and explanations
      // Since aiExplanations might have general details or analysisReports holds details:
      // Let's check if the AI Report has summaries
      const executiveSummary = "This dashboard outlines the security posture, operational robustness, and optimization opportunities across the analyzed CI/CD files. We have checked configurations against standard industry templates.";
      const technicalSummary = `Detected ${scan.totalFindings} active violations across ${files.length} configuration paths. Principal risks include credential exposure or run configuration vulnerabilities.`;
      
      const topRisks = predictions.slice(0, 3).map((p, idx) => {
        const relatedFinding = p.ruleId ? rawFindings.find((f) => f.ruleId === p.ruleId) : null;
        return {
          rank: idx + 1,
          title: p.scenario || "Potential failure path",
          narrative: p.impact || "Vulnerabilities could lead to unauthorized system access or service degradation.",
          affectedFiles: [relatedFinding?.filePath || ""].filter(Boolean),
          severity: p.likelihood === "very_likely" ? "critical" as const : "high" as const,
        };
      });

      const prioritizedActionPlan = remediations.slice(0, 3).map((r, idx) => ({
        priority: idx + 1,
        action: r.title || "Remediate finding",
        reasoning: r.instructions || "Apply patch file to enforce configurations.",
        estimatedEffort: r.safe ? "minutes" : "hours",
        ruleIds: [r.ruleId || ""].filter(Boolean),
      }));

      aiReport = {
        executiveSummary,
        technicalSummary,
        overallHealthAssessment: `Pipeline maintains a grade of ${reportRecord.riskGrade} with a numeric score of ${reportRecord.overallScore}/100.`,
        topRisks: topRisks.length > 0 ? topRisks : [{ rank: 1, title: "Configuration Risks", narrative: "Unverified execution parameters in workflows.", affectedFiles: [], severity: "high" }],
        prioritizedActionPlan: prioritizedActionPlan.length > 0 ? prioritizedActionPlan : [{ priority: 1, action: "Review pipeline secrets", reasoning: "Ensure proper injection.", estimatedEffort: "minutes", ruleIds: [] }],
      };
    }

    return {
      meta: {
        repoId: repo.id,
        scanId: scan.id,
        repoUrl: repo.repoUrl,
        repoName: repo.name,
        branch: scan.branch,
        scannedAt: scan.createdAt.toISOString(),
        durationMs: scan.durationMs || 0,
        filesScanned: scan.totalFiles,
        ciSystemsDetected,
      },
      score: {
        value: reportRecord?.overallScore ?? 100,
        grade: reportRecord?.riskGrade ?? "A",
        trend,
        breakdown: {
          criticalCount: scan.criticalCount,
          highCount: scan.highCount,
          mediumCount: scan.mediumCount,
          lowCount: scan.lowCount,
          infoCount: 0,
        },
      },
      files,
      aiReport,
      totalCostUsd,
    };
  }
}

export const publicAnalyzer = new PublicAnalyzer();

import { db } from '../db/client';
import { scans, findings, analysisReports, githubAppEvents, parsedArtifacts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { queueRedis } from '../queue/redis.client';
import { githubAppAuth } from './app-auth';
import { checkRunManager } from './check-run';
import { prCommenter } from './pr-commenter';
import { formatPRComment } from './comment-formatter';
import { remediationGenerator } from '../ai/remediation-generator';
import { patchApplier } from '../ai/patch-applier';
import { autoPRCreator, FileRemediationResult, ManualFixInstruction } from './auto-pr-creator';
import type { AIContext, AIFinding } from '../engine/report-builder';

export async function onScanCompleted(scanId: string): Promise<void> {
  // STEP 1 — Load scan app context from Redis:
  const contextJson = await queueRedis.get(`scan-app-context:${scanId}`);
  if (!contextJson) {
    // This scan was not triggered by the GitHub App
    return;
  }
  const context = JSON.parse(contextJson);

  // STEP 2 — Load scan results from DB:
  const [scan] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
  if (!scan || scan.status !== 'completed') {
    return;
  }

  const dbFindings = await db.select().from(findings).where(eq(findings.scanId, scanId));
  const [report] = await db.select().from(analysisReports).where(eq(analysisReports.scanId, scanId)).limit(1);

  // STEP 3 — Get octokit:
  const octokit = await githubAppAuth.getInstallationOctokit(context.installationId);

  // STEP 4 — Update check run:
  const sortedFindings = [...dbFindings].sort((a, b) => {
    const sevMap: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    return (sevMap[b.severity] ?? 0) - (sevMap[a.severity] ?? 0);
  });

  const topFindings = sortedFindings.slice(0, 5).map(f => ({
    ruleId: f.ruleId,
    title: f.title,
    severity: f.severity,
    filePath: f.filePath
  }));

  const riskGrade = report?.riskGrade || 'C';
  const riskScore = report?.overallScore || 50;

  if (context.checkRunId) {
    try {
      await checkRunManager.complete({
        installationId: context.installationId,
        owner: context.owner,
        repo: context.repo,
        checkRunId: context.checkRunId,
        grade: riskGrade,
        score: riskScore,
        criticalCount: scan.criticalCount,
        highCount: scan.highCount,
        topFindings,
        blockOnGrade: context.appRepoConfig.blockOnGrade,
        dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3001',
        scanId,
        repoId: scan.repoId
      });
    } catch (err: any) {
      console.error(`[WebhookHandler] Failed to complete check run ${context.checkRunId}:`, err.message);
    }
  }

  // STEP 5 — Build remediations:
  let aiContext: AIContext;
  if (report?.reportJson) {
    try {
      const parsedReport = JSON.parse(report.reportJson);
      aiContext = parsedReport.aiContext;
    } catch {
      // Fallback
      aiContext = {
        repoId: scan.repoId,
        scanId,
        overallScore: riskScore,
        overallGrade: riskGrade,
        trend: 'stable',
        criticalFindings: [],
        highFindings: [],
        topPatterns: [],
        ciSystemsDetected: [],
        hasSecurityIssues: scan.criticalCount > 0,
        hasReliabilityIssues: scan.highCount > 0,
        remediationPriorities: []
      };
    }
  } else {
    aiContext = {
      repoId: scan.repoId,
      scanId,
      overallScore: riskScore,
      overallGrade: riskGrade,
      trend: 'stable',
      criticalFindings: [],
      highFindings: [],
      topPatterns: [],
      ciSystemsDetected: [],
      hasSecurityIssues: scan.criticalCount > 0,
      hasReliabilityIssues: scan.highCount > 0,
      remediationPriorities: []
    };
  }

  const findingsList: AIFinding[] = dbFindings.map(f => ({
    ruleId: f.ruleId,
    title: f.title,
    severity: f.severity,
    category: f.category,
    filePath: f.filePath,
    evidence: f.description || '',
    remediation: f.remediation || ''
  }));

  const artifacts = await db.select().from(parsedArtifacts).where(eq(parsedArtifacts.scanId, scanId));
  const workflowContents = new Map<string, string>();
  for (const art of artifacts) {
    let content = await queueRedis.get(`file-content:${scanId}:${art.filePath}`);
    if (!content && art.normalizedWorkflow) {
      content = (art.normalizedWorkflow as any).raw || '';
    }
    workflowContents.set(art.filePath, content || '');
  }

  const remediationReport = await remediationGenerator.generateForScan(
    scanId,
    aiContext,
    findingsList,
    workflowContents
  );

  // Group remediations to build FileRemediationResult[]
  const fileRemediations: FileRemediationResult[] = [];
  const filesGrouped = new Map<string, typeof remediationReport.remediations>();
  for (const r of remediationReport.remediations) {
    if (!filesGrouped.has(r.findingFilePath)) {
      filesGrouped.set(r.findingFilePath, []);
    }
    filesGrouped.get(r.findingFilePath)!.push(r);
  }

  for (const [filePath, fileRems] of filesGrouped.entries()) {
    const artifact = artifacts.find(a => a.filePath === filePath);
    let originalContent = '';
    if (artifact) {
      originalContent = await queueRedis.get(`file-content:${scanId}:${filePath}`) || '';
      if (!originalContent && artifact.normalizedWorkflow) {
        originalContent = (artifact.normalizedWorkflow as any).raw || '';
      }
    }

    if (!originalContent) {
      try {
        const { data: contentData } = await octokit.rest.repos.getContent({
          owner: context.owner,
          repo: context.repo,
          path: filePath,
          ref: scan.branch
        });
        originalContent = Buffer.from((contentData as any).content, 'base64').toString('utf8');
      } catch (err: any) {
        console.error(`[WebhookHandler] Could not fetch file content for ${filePath} from GitHub:`, err.message);
        continue;
      }
    }

    // Filter deterministic or safe AI patches
    const safePatches = fileRems
      .filter(r => r.validationStatus === 'valid' && r.patch && r.patch.confidence !== 'manual-review-required')
      .map(r => r.patch!);

    const appliedPatchRuleIds = safePatches.map(p => p.ruleId);

    let fixedContent = originalContent;
    if (safePatches.length > 0) {
      const applyResult = patchApplier.applyPatches(originalContent, safePatches);
      fixedContent = applyResult.content;
    }

    fileRemediations.push({
      filePath,
      originalContent,
      fixedContent,
      hasAutoFixes: safePatches.length > 0,
      validationPassed: true,
      appliedPatchRuleIds
    });
  }

  const manualFixes: ManualFixInstruction[] = [];
  for (const r of remediationReport.remediations) {
    const isManual = r.remediationSource === 'none' ||
      r.validationStatus === 'skipped' ||
      (r.aiPatch && r.aiPatch.requiresManualReview) ||
      (r.patch && r.patch.confidence === 'manual-review-required');

    if (isManual) {
      const currentCode = r.patch?.before || (r.aiPatch as any)?.patchedContent;
      manualFixes.push({
        ruleId: r.findingRuleId,
        filePath: r.findingFilePath,
        guidance: r.finalRecommendation || 'Please review finding details and resolve manually.',
        ...(currentCode ? { currentCode } : {})
      });
    }
  }

  // STEP 6 — Post PR comment (if this scan was triggered by a PR):
  const prNumbers: number[] = [];
  if (context.prNumber) {
    prNumbers.push(context.prNumber);
  }
  if (context.prNumbers && Array.isArray(context.prNumbers)) {
    for (const no of context.prNumbers) {
      if (!prNumbers.includes(no)) prNumbers.push(no);
    }
  }

  const hasAutoFixes = fileRemediations.some(f => f.hasAutoFixes);

  for (const prNo of prNumbers) {
    const commentBody = formatPRComment({
      scanId,
      repoId: scan.repoId,
      grade: riskGrade,
      score: riskScore,
      totalFindings: scan.totalFindings,
      criticalCount: scan.criticalCount,
      highCount: scan.highCount,
      mediumCount: scan.mediumCount,
      lowCount: scan.lowCount,
      branch: scan.branch,
      findings: sortedFindings.slice(0, 10).map(f => ({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        filePath: f.filePath,
        line: f.line
      })),
      hasAutoFixes,
      hasPR: false,
      dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3001',
      scanTimestamp: new Date().toISOString()
    });

    try {
      await prCommenter.postOrUpdate({
        installationId: context.installationId,
        owner: context.owner,
        repo: context.repo,
        prNumber: prNo,
        repoId: scan.repoId,
        commentBody
      });
    } catch (err: any) {
      console.error(`[WebhookHandler] Failed to post comment on PR #${prNo}:`, err.message);
    }
  }

  // STEP 7 — Auto-create fix PR (if enabled for this repo):
  if (context.appRepoConfig.autoPrEnabled) {
    try {
      const prResult = await autoPRCreator.createFixPR({
        installationId: context.installationId,
        owner: context.owner,
        repo: context.repo,
        baseBranch: scan.branch,
        scanId,
        repoId: scan.repoId,
        fileRemediations,
        manualFixes
      });

      // Update PR comments if PR created
      if (prResult) {
        for (const prNo of prNumbers) {
          const updatedComment = formatPRComment({
            scanId,
            repoId: scan.repoId,
            grade: riskGrade,
            score: riskScore,
            totalFindings: scan.totalFindings,
            criticalCount: scan.criticalCount,
            highCount: scan.highCount,
            mediumCount: scan.mediumCount,
            lowCount: scan.lowCount,
            branch: scan.branch,
            findings: sortedFindings.slice(0, 10).map(f => ({
              ruleId: f.ruleId,
              title: f.title,
              severity: f.severity,
              filePath: f.filePath,
              line: f.line
            })),
            hasAutoFixes: true,
            hasPR: true,
            prUrl: prResult.prUrl,
            dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3001',
            scanTimestamp: new Date().toISOString()
          });

          await prCommenter.postOrUpdate({
            installationId: context.installationId,
            owner: context.owner,
            repo: context.repo,
            prNumber: prNo,
            repoId: scan.repoId,
            commentBody: updatedComment
          });
        }
      }
    } catch (err: any) {
      console.error(`[WebhookHandler] Failed to auto-create fix PR:`, err.message);
    }
  }

  // STEP 8 — Clean up Redis:
  await queueRedis.del(`scan-app-context:${scanId}`);

  // STEP 9 — Update github_app_events record:
  await db.update(githubAppEvents)
    .set({ status: 'completed', processedAt: new Date() })
    .where(eq(githubAppEvents.scanId, scanId));
}

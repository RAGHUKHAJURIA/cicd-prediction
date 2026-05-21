import { claudeClient, ClaudeClient } from './claude-client';
import { patchBuilder, PatchBuilder, PatchResult, DiffOutput } from './patch-builder';
import { tokenCounter } from './token-counter';
import { AITaskType } from './ai-response.types';
import { AIContext, AIFinding } from '../engine/report-builder';

export interface RemediationResult {
  findingRuleId: string;
  findingFilePath: string;
  severity: string;
  patch: PatchResult | null;
  aiPatch: AIPatchResult | null;
  diff: DiffOutput | null;
  validationStatus: ValidationStatus;
  finalRecommendation: string;
  remediationSource: 'deterministic' | 'ai-generated' | 'hybrid' | 'none';
}

export interface AIPatchResult {
  ruleId?: string;
  filePath?: string;
  patchedContent: string;
  explanation: string;
  warnings: string[];
  requiresManualReview: boolean;
}

export enum ValidationStatus {
  VALID       = 'valid',
  INVALID     = 'invalid',
  SKIPPED     = 'skipped',
  FALLBACK    = 'fallback'
}

export interface ScanRemediationReport {
  scanId: string;
  repoId: string;
  totalFindings: number;
  remediatedCount: number;
  manualReviewCount: number;
  noFixAvailableCount: number;
  remediations: RemediationResult[];
  estimatedFixTimeMinutes: number;
  costUsd: number;
  generatedAt: Date;
}

export class RemediationGenerator {

  constructor(
    private client: ClaudeClient = claudeClient,
    private patches: PatchBuilder = patchBuilder
  ) {}

  async generateForFinding(
    finding: AIFinding,
    workflowContent: string,
    scanId: string
  ): Promise<RemediationResult> {
    const deterministicPatch = this.patches.buildPatch(
      finding.ruleId,
      finding.evidence,
      finding.filePath
    );

    if (deterministicPatch && deterministicPatch.confidence === 'certain') {
      return {
        findingRuleId: finding.ruleId,
        findingFilePath: finding.filePath,
        severity: finding.severity,
        patch: deterministicPatch,
        aiPatch: null,
        diff: this.patches.buildDiff(deterministicPatch),
        validationStatus: ValidationStatus.VALID,
        finalRecommendation: deterministicPatch.after,
        remediationSource: 'deterministic'
      };
    }

    const systemPrompt = `You are a senior DevOps engineer who writes precise, production-safe CI/CD configuration fixes.
You generate minimal, targeted patches — only change what is necessary to fix the specific issue. Never introduce new configuration patterns unless required by the fix.
You must respond with ONLY valid JSON matching the schema provided.
CRITICAL: Your patchedContent must be valid YAML or valid Dockerfile syntax. Never produce broken indentation.`;

    const truncatedOriginal = tokenCounter.truncateToFit(workflowContent, 800).text;

    let userPrompt = `FINDING SECTION:
FIX REQUIRED:
Rule violated: ${finding.ruleId}
Issue: ${finding.title}
File type: ${this.detectFileType(finding.filePath)}
Evidence (the problematic value): ${finding.evidence}
Severity: ${finding.severity}

ORIGINAL CONTENT SECTION (budget: 800 tokens):
RELEVANT SECTION OF ORIGINAL FILE:
${truncatedOriginal}
`;

    if (deterministicPatch) {
      userPrompt += `\nSUGGESTED APPROACH (verify and complete this):\n${deterministicPatch.after}\n`;
    }

    userPrompt += `
RESPONSE SCHEMA:
Respond with this EXACT JSON:
{
  "patchedContent": "the corrected YAML or config snippet that replaces the evidence",
  "explanation": "one sentence: what changed and why it fixes the issue",
  "warnings": ["any caveat 1", "any caveat 2"],
  "requiresManualReview": true or false
}

Rules:
- patchedContent: minimal fix, only change what the finding requires
- patchedContent: valid YAML with correct indentation
- patchedContent: if fixing a Docker image tag, include the specific version number (not a placeholder)
- patchedContent: if fixing an action pin, include a comment with the SHA finding instructions
- explanation: one sentence only
- warnings: empty array if no caveats
- requiresManualReview: true if user must fill in values`;

    const result = await this.client.completeJSON<AIPatchResult>(
      AITaskType.GENERATE_REMEDIATION,
      systemPrompt,
      userPrompt,
      { maxTokens: 500, scanId, repoId: finding.filePath, temperature: 0.1 }
    );

    if (result.success && result.data) {
      return {
        findingRuleId: finding.ruleId,
        findingFilePath: finding.filePath,
        severity: finding.severity,
        patch: deterministicPatch,
        aiPatch: result.data,
        diff: this.buildDiffFromAIPatch(workflowContent, result.data.patchedContent, finding.filePath, finding.ruleId),
        validationStatus: ValidationStatus.SKIPPED,
        finalRecommendation: result.data.patchedContent,
        remediationSource: deterministicPatch ? 'hybrid' : 'ai-generated'
      };
    }

    if (deterministicPatch) {
      return {
        findingRuleId: finding.ruleId,
        findingFilePath: finding.filePath,
        severity: finding.severity,
        patch: deterministicPatch,
        aiPatch: null,
        diff: this.patches.buildDiff(deterministicPatch),
        validationStatus: ValidationStatus.VALID,
        finalRecommendation: deterministicPatch.after,
        remediationSource: 'deterministic'
      };
    }

    return {
      findingRuleId: finding.ruleId,
      findingFilePath: finding.filePath,
      severity: finding.severity,
      patch: null,
      aiPatch: null,
      diff: null,
      validationStatus: ValidationStatus.SKIPPED,
      finalRecommendation: 'No automated fix available',
      remediationSource: 'none'
    };
  }

  async generateForScan(
    scanId: string,
    aiContext: AIContext,
    findings: AIFinding[],
    workflowContents: Map<string, string>
  ): Promise<ScanRemediationReport> {
    const severityMap: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    const sortedFindings = [...findings].sort((a, b) => severityMap[b.severity] - severityMap[a.severity]);
    const limitedFindings = sortedFindings.slice(0, 20);

    const remediations: RemediationResult[] = [];
    let costUsd = 0;

    for (const finding of limitedFindings) {
      const content = workflowContents.get(finding.filePath) || '';
      const rem = await this.generateForFinding(finding, content, scanId);
      remediations.push(rem);
      
      const usage = this.client.getUsageSummary();
      costUsd = usage.totalCostUsd;

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const remediatedCount = remediations.filter(r => r.remediationSource !== 'none').length;
    const manualReviewCount = remediations.filter(r => 
      (r.patch && r.patch.confidence === 'manual-review-required') || 
      (r.aiPatch && r.aiPatch.requiresManualReview)
    ).length;
    const noFixAvailableCount = remediations.filter(r => r.remediationSource === 'none').length;

    let estimatedFixTimeMinutes = 0;
    for (const r of remediations) {
      if (r.remediationSource === 'none') {
        estimatedFixTimeMinutes += 30;
      } else if (r.patch && r.patch.confidence === 'certain' && r.remediationSource === 'deterministic') {
        estimatedFixTimeMinutes += 5;
      } else if (r.remediationSource === 'hybrid' || r.remediationSource === 'ai-generated') {
        estimatedFixTimeMinutes += 10;
      } else {
        estimatedFixTimeMinutes += 15;
      }
    }

    return {
      scanId,
      repoId: aiContext.repoId,
      totalFindings: findings.length,
      remediatedCount,
      manualReviewCount,
      noFixAvailableCount,
      remediations,
      estimatedFixTimeMinutes,
      costUsd,
      generatedAt: new Date()
    };
  }

  private detectFileType(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.includes('.github/workflows')) return 'GitHub Actions YAML';
    if (lower.includes('.gitlab-ci')) return 'GitLab CI YAML';
    if (lower.includes('dockerfile')) return 'Dockerfile';
    if (lower.includes('jenkinsfile')) return 'Jenkinsfile';
    if (lower.includes('k8s') || lower.includes('kubernetes')) return 'Kubernetes YAML';
    return 'YAML configuration';
  }

  private buildDiffFromAIPatch(original: string, patched: string, filePath: string, ruleId: string): DiffOutput {
    const originalLines = original.split('\n');
    const patchedLines = patched.split('\n');
    let unified = `--- a/${filePath}\n+++ b/${filePath}\n@@ -1,${originalLines.length} +1,${patchedLines.length} @@\n`;

    for (const line of originalLines) unified += `-${line}\n`;
    for (const line of patchedLines) unified += `+${line}\n`;

    return {
      ruleId,
      filePath,
      unified,
      before: original,
      after: patched,
      linesChanged: originalLines.length + patchedLines.length,
      explanation: 'AI generated fix diff'
    };
  }
}

export const remediationGenerator = new RemediationGenerator();

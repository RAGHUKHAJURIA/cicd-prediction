import { AIFinding } from '../engine/report-builder';
import { PatchResult } from './patch-builder';
import { AIPatchResult } from './remediation-generator';
import { RuleSeverity, RuleResult } from '../rules/types';
import { RuleRunner } from '../rules/rule-runner';
import { ruleRegistry } from '../rules/rule-registry';
import { detectAndParse } from '../parsers';

export interface GuardrailResult {
  approved: boolean;
  patch: PatchResult | AIPatchResult;
  patchSource: 'deterministic' | 'ai-generated';
  originalFindingCount: number;
  patchedFindingCount: number;
  resolvedFindingIds: string[];
  newViolations: RuleResult[];
  rejectionReason: string | null;
  usedFallback: boolean;
}

export interface GuardrailConfig {
  strictMode: boolean;
  requireFindingResolved: boolean;
  allowedNewViolationSeverities: RuleSeverity[];
}

export class Guardrail {
  private config: GuardrailConfig;

  constructor(config?: Partial<GuardrailConfig>) {
    this.config = {
      strictMode: true,
      requireFindingResolved: true,
      allowedNewViolationSeverities: [RuleSeverity.LOW, RuleSeverity.INFO],
      ...config
    };
  }

  async validatePatch(
    originalContent: string,
    patchedContent: string,
    filePath: string,
    originalFinding: AIFinding,
    patch: PatchResult | AIPatchResult,
    patchSource: 'deterministic' | 'ai-generated'
  ): Promise<GuardrailResult> {
    
    // Step 1 - Parse patched
    const patchedParse = await detectAndParse(patchedContent, filePath, 'guardrail-check');
    if (!patchedParse.success) {
      return {
        approved: false,
        patch,
        patchSource,
        originalFindingCount: 0,
        patchedFindingCount: 0,
        resolvedFindingIds: [],
        newViolations: [],
        rejectionReason: `AI-generated patch produced invalid syntax: ${patchedParse.errors?.[0]?.message}`,
        usedFallback: false
      };
    }

    // Step 2 - Parse original
    const originalParse = await detectAndParse(originalContent, filePath, 'guardrail-check');
    if (!originalParse.success) {
      return {
        approved: true,
        patch,
        patchSource,
        originalFindingCount: 0,
        patchedFindingCount: 0,
        resolvedFindingIds: [],
        newViolations: [],
        rejectionReason: null,
        usedFallback: false
      };
    }

    // Step 3 - Run rule engine
    const runner = new RuleRunner(ruleRegistry);
    const context = { 
      repoId: 'guardrail-repo', 
      scanId: 'guardrail-scan', 
      repoMetadata: { name: 'guardrail', provider: 'guardrail', defaultBranch: 'main', isMonorepo: false } 
    };
    const originalReport = await runner.runOnWorkflow(originalParse.result!, context);
    const patchedReport = await runner.runOnWorkflow(patchedParse.result!, context);

    const originalFindings = originalReport.findings;
    const patchedFindings = patchedReport.findings;

    // Step 4 - Check finding resolved
    const originalField = (originalFinding as any).field || originalFinding.ruleId;
    const findingResolved = !patchedFindings.some((pf: RuleResult) => 
      pf.ruleId === originalFinding.ruleId && 
      (pf.location.field === originalField || pf.location.field.includes(originalFinding.ruleId))
    );

    if (this.config.requireFindingResolved && !findingResolved) {
      return {
        approved: false,
        patch,
        patchSource,
        originalFindingCount: originalFindings.length,
        patchedFindingCount: patchedFindings.length,
        resolvedFindingIds: [],
        newViolations: [],
        rejectionReason: `Patch does not resolve the '${originalFinding.ruleId}' violation. The issue is still present after applying the fix.`,
        usedFallback: false
      };
    }

    // Step 5 - Check new violations
    const newViolations = patchedFindings.filter((pf: RuleResult) => 
      originalFindings.every((of: RuleResult) => of.ruleId !== pf.ruleId || of.location.field !== pf.location.field)
    );

    if (this.config.strictMode) {
      if (newViolations.length > 0) {
        return {
          approved: false,
          patch,
          patchSource,
          originalFindingCount: originalFindings.length,
          patchedFindingCount: patchedFindings.length,
          resolvedFindingIds: [],
          newViolations,
          rejectionReason: `Patch introduces ${newViolations.length} new violation(s): ${newViolations.map(v => v.ruleName).join(', ')}`,
          usedFallback: false
        };
      }
    } else {
      const seriousNewViolations = newViolations.filter((v: RuleResult) => !this.config.allowedNewViolationSeverities.includes(v.severity));
      if (seriousNewViolations.length > 0) {
        return {
          approved: false,
          patch,
          patchSource,
          originalFindingCount: originalFindings.length,
          patchedFindingCount: patchedFindings.length,
          resolvedFindingIds: [],
          newViolations: seriousNewViolations,
          rejectionReason: `Patch introduces ${seriousNewViolations.length} serious new violation(s)`,
          usedFallback: false
        };
      }
    }

    // Step 6 - Approve
    const resolvedFindingIds = originalFindings.filter((of: RuleResult) => patchedFindings.every((pf: RuleResult) => pf.ruleId !== of.ruleId)).map((f: RuleResult) => f.ruleId);

    return {
      approved: true,
      patch,
      patchSource,
      originalFindingCount: originalFindings.length,
      patchedFindingCount: patchedFindings.length,
      resolvedFindingIds,
      newViolations: [],
      rejectionReason: null,
      usedFallback: false
    };
  }

  async validateAndFallback(
    originalContent: string,
    aiPatchContent: string,
    filePath: string,
    originalFinding: AIFinding,
    aiPatch: AIPatchResult,
    deterministicPatch: PatchResult | null
  ): Promise<GuardrailResult> {
    const aiResult = await this.validatePatch(originalContent, aiPatchContent, filePath, originalFinding, aiPatch, 'ai-generated');
    
    if (!aiResult.approved && deterministicPatch) {
      const detPatchedContent = originalContent.replace(deterministicPatch.before, deterministicPatch.after);
      const detResult = await this.validatePatch(originalContent, detPatchedContent, filePath, originalFinding, deterministicPatch, 'deterministic');
      if (detResult.approved) {
        return {
          ...detResult,
          usedFallback: true
        };
      }
    }

    return aiResult;
  }

  async validateBatch(
    validations: Array<{
      originalContent: string,
      patchedContent: string,
      filePath: string,
      finding: AIFinding,
      patch: PatchResult | AIPatchResult,
      patchSource: 'deterministic' | 'ai-generated'
    }>
  ): Promise<GuardrailResult[]> {
    const results: GuardrailResult[] = [];
    for (const v of validations) {
      results.push(await this.validatePatch(v.originalContent, v.patchedContent, v.filePath, v.finding, v.patch, v.patchSource));
      await new Promise(r => setTimeout(r, 100));
    }
    return results;
  }
}

export const guardrail = new Guardrail();
export const strictGuardrail = new Guardrail({ strictMode: true });

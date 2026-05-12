/**
 * @file rule-runner.ts
 * @description Executes registered rules against normalized workflows.
 *
 * The RuleRunner is the engine that:
 *  1. Filters which rules run based on config (disabledRules, enabled flag).
 *  2. Applies severityOverrides from config before execution.
 *  3. Wraps every rule.check() in try/catch — one broken rule cannot crash a scan.
 *  4. Applies ignorePaths glob filtering to drop findings for excluded files.
 *  5. Aggregates per-workflow reports into a full ScanRuleReport.
 *  6. Calculates a risk score and letter grade.
 *
 * The glob matcher is implemented inline with no external dependencies.
 */

import type { NormalizedWorkflow } from '../models/workflow.model';
import { RuleRegistry } from './rule-registry';
import {
  type Rule,
  type RuleConfig,
  type RuleContext,
  type RuleResult,
  type RuleExecutionError,
  type WorkflowRuleReport,
  type ScanRuleReport,
  RuleCategory,
  RuleSeverity,
} from './types';

// =============================================================================
// DEFAULT RULE CONFIG
// =============================================================================

/** Default configuration applied when no config is provided to RuleRunner. */
export const defaultRuleConfig: RuleConfig = {
  severityOverrides: {},
  disabledRules: [],
  customThresholds: {
    'maintainability-job-count':  20,
    'maintainability-step-count': 50,
    'performance-layer-count':    20,
  },
  ignorePaths: [
    '**/node_modules/**',
    '**/vendor/**',
    '**/.git/**',
  ],
};

// =============================================================================
// GLOB MATCHING HELPER (no external dependencies)
// =============================================================================

/**
 * Convert a glob pattern to a RegExp.
 *
 * Supported syntax:
 *  `**` — matches any characters including path separators.
 *  `*`  — matches any characters EXCEPT path separators.
 *  `?`  — matches a single character (except path separator).
 *
 * All other characters are treated as literals (escaped for regex).
 */
function globToRegex(pattern: string): RegExp {
  // Normalize Windows path separators to forward slash
  const normalized = pattern.replace(/\\/g, '/');

  let regexStr = '';
  let i = 0;

  while (i < normalized.length) {
    const char = normalized[i];

    if (char === '*' && normalized[i + 1] === '*') {
      // ** — match anything including slashes
      regexStr += '.*';
      i += 2;
      // Consume a trailing slash if present so **/foo matches foo at root too
      if (normalized[i] === '/') {
        regexStr += '(?:/|$)';
        i++;
      }
    } else if (char === '*') {
      // * — match anything except slash
      regexStr += '[^/]*';
      i++;
    } else if (char === '?') {
      // ? — match single char except slash
      regexStr += '[^/]';
      i++;
    } else {
      // Escape regex special characters
      regexStr += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  return new RegExp(`^${regexStr}$`);
}

/**
 * Returns true if `path` matches the glob `pattern`.
 *
 * Both strings are normalized to forward slashes before matching.
 *
 * @example
 * matchesGlob('**\/node_modules\/**', 'src/node_modules/lodash/index.js') // true
 * matchesGlob('*.yml', 'ci.yml')                                          // true
 * matchesGlob('*.yml', 'dir/ci.yml')                                      // false
 * matchesGlob('**\/*.yml', 'dir/ci.yml')                                  // true
 * matchesGlob('Dockerfile*', 'Dockerfile.prod')                           // true
 * matchesGlob('Dockerfile*', 'src/Dockerfile')                            // false
 */
export function matchesGlob(pattern: string, path: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/');
  const regex = globToRegex(pattern);
  return regex.test(normalizedPath);
}

/**
 * Returns true if `path` matches ANY of the given glob patterns.
 */
function matchesAnyGlob(patterns: string[], path: string): boolean {
  return patterns.some((p) => matchesGlob(p, path));
}

// =============================================================================
// HELPERS — zero-filled report maps
// =============================================================================

function emptySeverityMap(): Record<RuleSeverity, RuleResult[]> {
  return {
    [RuleSeverity.CRITICAL]: [],
    [RuleSeverity.HIGH]:     [],
    [RuleSeverity.MEDIUM]:   [],
    [RuleSeverity.LOW]:      [],
    [RuleSeverity.INFO]:     [],
  };
}

function emptyCategoryMap(): Record<RuleCategory, RuleResult[]> {
  return {
    [RuleCategory.SECURITY]:        [],
    [RuleCategory.RELIABILITY]:     [],
    [RuleCategory.PERFORMANCE]:     [],
    [RuleCategory.MAINTAINABILITY]: [],
    [RuleCategory.DEPENDENCY]:      [],
    [RuleCategory.DAG]:             [],
  };
}

function emptySeverityCount(): Record<RuleSeverity, number> {
  return {
    [RuleSeverity.CRITICAL]: 0,
    [RuleSeverity.HIGH]:     0,
    [RuleSeverity.MEDIUM]:   0,
    [RuleSeverity.LOW]:      0,
    [RuleSeverity.INFO]:     0,
  };
}

function emptyCategoryCount(): Record<RuleCategory, number> {
  return {
    [RuleCategory.SECURITY]:        0,
    [RuleCategory.RELIABILITY]:     0,
    [RuleCategory.PERFORMANCE]:     0,
    [RuleCategory.MAINTAINABILITY]: 0,
    [RuleCategory.DEPENDENCY]:      0,
    [RuleCategory.DAG]:             0,
  };
}

// =============================================================================
// RISK SCORE
// =============================================================================

/**
 * Simple risk score formula.
 * score = min(100, critical×20 + high×8 + medium×3 + low×1)
 */
function calculateRiskScore(counts: Record<RuleSeverity, number>): number {
  const raw =
    counts[RuleSeverity.CRITICAL] * 20 +
    counts[RuleSeverity.HIGH]     *  8 +
    counts[RuleSeverity.MEDIUM]   *  3 +
    counts[RuleSeverity.LOW]      *  1;
  return Math.min(100, raw);
}

/**
 * Map a numeric risk score to a letter grade.
 *
 *  0–10   → A
 * 11–25   → B
 * 26–45   → C
 * 46–70   → D
 * 71–100  → F
 */
function calculateRiskGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score <= 10) return 'A';
  if (score <= 25) return 'B';
  if (score <= 45) return 'C';
  if (score <= 70) return 'D';
  return 'F';
}

// =============================================================================
// RULE RUNNER
// =============================================================================

/**
 * Executes rule plugins against one or more NormalizedWorkflow objects.
 *
 * @example
 * const runner = new RuleRunner(ruleRegistry);
 * const report = runner.runOnWorkflow(workflow, {
 *   repoId: 'repo-1',
 *   scanId: 'scan-abc',
 *   repoMetadata: { name: 'my-repo', provider: 'github', defaultBranch: 'main', isMonorepo: false },
 * });
 */
export class RuleRunner {
  constructor(
    private readonly registry: RuleRegistry,
    private readonly config: RuleConfig = defaultRuleConfig,
  ) {}

  // ---------------------------------------------------------------------------
  // runOnWorkflow
  // ---------------------------------------------------------------------------

  /**
   * Run all enabled rules against a single workflow.
   *
   * The full RuleContext is constructed from the provided partial context plus
   * this runner's config. allWorkflows defaults to [workflow] if not provided.
   *
   * Execution steps:
   *  1. Filter rules: enabled + not in disabledRules.
   *  2. Apply severityOverrides to a working copy of each rule.
   *  3. Call rule.check() inside try/catch; capture errors as RuleExecutionError.
   *  4. Apply ignorePaths filtering to the combined findings.
   *  5. Build and return WorkflowRuleReport.
   */
  async runOnWorkflow(
    workflow: NormalizedWorkflow,
    partialContext: Omit<RuleContext, 'config' | 'allWorkflows' | 'filePath' | 'ciSystem'> & {
      filePath?: string;
      ciSystem?: string;
      allWorkflows?: NormalizedWorkflow[];
    },
  ): Promise<WorkflowRuleReport> {
    const startTime = Date.now();

    const context: RuleContext = {
      repoId:        partialContext.repoId,
      scanId:        partialContext.scanId,
      filePath:      partialContext.filePath ?? workflow.sourceFile,
      ciSystem:      partialContext.ciSystem  ?? workflow.metadata.ciSystem,
      config:        this.config,
      allWorkflows:  partialContext.allWorkflows ?? [workflow],
      repoMetadata:  partialContext.repoMetadata,
    };

    // STEP 1 — Filter rules to run
    const disabledSet = new Set(this.config.disabledRules);
    const rulesToRun = this.registry
      .getAllEnabled()
      .filter((r) => !disabledSet.has(r.id));

    // STEP 2 + 3 — Execute each rule safely
    const allFindings: RuleResult[] = [];
    const executionErrors: RuleExecutionError[] = [];
    let rulesPassed = 0;
    let rulesFailed = 0;

    for (const rule of rulesToRun) {
      // Apply severityOverride to a shallow proxy so we don't mutate the rule
      const effectiveSeverity = this.config.severityOverrides[rule.id] ?? rule.severity;

      let findings: RuleResult[];

      try {
        findings = await Promise.resolve(rule.check(workflow, context));

        // Apply per-finding severity override
        if (effectiveSeverity !== rule.severity) {
          findings = findings.map((f) => ({ ...f, severity: effectiveSeverity }));
        }

        if (findings.length === 0) {
          rulesPassed++;
        }
      } catch (err: unknown) {
        rulesFailed++;
        const execErr: RuleExecutionError = {
          ruleId:   rule.id,
          ruleName: rule.name,
          error:    err instanceof Error ? err.message : String(err),
          ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
        };
        executionErrors.push(execErr);
        findings = [];
      }

      allFindings.push(...findings);
    }

    // STEP 4 — Apply ignorePaths filtering
    const filteredFindings = allFindings.filter(
      (f) => !matchesAnyGlob(this.config.ignorePaths, f.location.filePath),
    );

    // STEP 5 — Build WorkflowRuleReport
    const findingsBySeverity = emptySeverityMap();
    const findingsByCategory = emptyCategoryMap();

    for (const finding of filteredFindings) {
      findingsBySeverity[finding.severity].push(finding);
      findingsByCategory[finding.category].push(finding);
    }

    return {
      workflowId:        workflow.id,
      filePath:          context.filePath,
      ciSystem:          context.ciSystem,
      rulesRun:          rulesToRun.length,
      rulesPassed,
      rulesFailed,
      findings:          filteredFindings,
      findingsBySeverity,
      findingsByCategory,
      executionTimeMs:   Date.now() - startTime,
      errors:            executionErrors,
    };
  }

  // ---------------------------------------------------------------------------
  // runOnScan
  // ---------------------------------------------------------------------------

  /**
   * Run rules against ALL workflows in a scan.
   *
   * Each workflow is analyzed independently via runOnWorkflow, with allWorkflows
   * set to the full list for cross-workflow rules.
   * Results are aggregated into a ScanRuleReport with combined counts, risk score,
   * and letter grade.
   */
  async runOnScan(
    workflows: NormalizedWorkflow[],
    baseContext: Omit<RuleContext, 'config' | 'allWorkflows' | 'filePath' | 'ciSystem'>,
  ): Promise<ScanRuleReport> {
    const startTime = Date.now();

    const workflowReports: WorkflowRuleReport[] = [];

    for (const wf of workflows) {
      const report = await this.runOnWorkflow(wf, {
        ...baseContext,
        filePath:     wf.sourceFile,
        ciSystem:     wf.metadata.ciSystem,
        allWorkflows: workflows,
      });
      workflowReports.push(report);
    }

    // Aggregate counts
    const findingsBySeverity = emptySeverityCount();
    const findingsByCategory = emptyCategoryCount();
    let totalFindings  = 0;
    let totalRulesRun  = 0;

    for (const wr of workflowReports) {
      totalRulesRun += wr.rulesRun;
      totalFindings += wr.findings.length;

      for (const sev of Object.values(RuleSeverity)) {
        findingsBySeverity[sev] += wr.findingsBySeverity[sev].length;
      }
      for (const cat of Object.values(RuleCategory)) {
        findingsByCategory[cat] += wr.findingsByCategory[cat].length;
      }
    }

    const riskScore = calculateRiskScore(findingsBySeverity);
    const riskGrade = calculateRiskGrade(riskScore);

    return {
      scanId:            baseContext.scanId,
      repoId:            baseContext.repoId,
      totalWorkflows:    workflows.length,
      totalRulesRun,
      totalFindings,
      findingsBySeverity,
      findingsByCategory,
      workflowReports,
      riskScore,
      riskGrade,
      executionTimeMs:   Date.now() - startTime,
      completedAt:       new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // runOnWorkflowWithRules
  // ---------------------------------------------------------------------------

  /**
   * Run ONLY the specified rules (by id) against a workflow.
   *
   * Used for targeted re-runs, CI annotations, and tests.
   *
   * @throws {Error} If any ruleId in the list is not found in the registry.
   */
  async runOnWorkflowWithRules(
    workflow: NormalizedWorkflow,
    ruleIds: string[],
    partialContext: Omit<RuleContext, 'config' | 'allWorkflows'>,
  ): Promise<WorkflowRuleReport> {
    const startTime = Date.now();

    // Validate all requested rule ids up front
    const rulesToRun: Rule[] = [];
    for (const id of ruleIds) {
      const rule = this.registry.getById(id);
      if (!rule) {
        throw new Error(
          `Rule not found: '${id}'. Make sure the rule is registered before calling runOnWorkflowWithRules.`,
        );
      }
      rulesToRun.push(rule);
    }

    const context: RuleContext = {
      repoId:       partialContext.repoId,
      scanId:       partialContext.scanId,
      filePath:     partialContext.filePath,
      ciSystem:     partialContext.ciSystem,
      config:       this.config,
      allWorkflows: [workflow],
      repoMetadata: partialContext.repoMetadata,
    };

    const allFindings: RuleResult[] = [];
    const executionErrors: RuleExecutionError[] = [];
    let rulesPassed = 0;
    let rulesFailed = 0;

    for (const rule of rulesToRun) {
      const effectiveSeverity = this.config.severityOverrides[rule.id] ?? rule.severity;
      let findings: RuleResult[];

      try {
        findings = await Promise.resolve(rule.check(workflow, context));

        if (effectiveSeverity !== rule.severity) {
          findings = findings.map((f) => ({ ...f, severity: effectiveSeverity }));
        }

        if (findings.length === 0) {
          rulesPassed++;
        }
      } catch (err: unknown) {
        rulesFailed++;
        const execErr2: RuleExecutionError = {
          ruleId:   rule.id,
          ruleName: rule.name,
          error:    err instanceof Error ? err.message : String(err),
          ...(err instanceof Error && err.stack ? { stack: err.stack } : {}),
        };
        executionErrors.push(execErr2);
        findings = [];
      }

      allFindings.push(...findings);
    }

    const filteredFindings = allFindings.filter(
      (f) => !matchesAnyGlob(this.config.ignorePaths, f.location.filePath),
    );

    const findingsBySeverity = emptySeverityMap();
    const findingsByCategory = emptyCategoryMap();

    for (const finding of filteredFindings) {
      findingsBySeverity[finding.severity].push(finding);
      findingsByCategory[finding.category].push(finding);
    }

    return {
      workflowId:        workflow.id,
      filePath:          context.filePath,
      ciSystem:          context.ciSystem,
      rulesRun:          rulesToRun.length,
      rulesPassed,
      rulesFailed,
      findings:          filteredFindings,
      findingsBySeverity,
      findingsByCategory,
      executionTimeMs:   Date.now() - startTime,
      errors:            executionErrors,
    };
  }

  // ---------------------------------------------------------------------------
  // getSupportedRules
  // ---------------------------------------------------------------------------

  /**
   * Return all rules that the runner would execute with the current config.
   * Respects the enabled flag and disabledRules config list.
   */
  getSupportedRules(): Rule[] {
    const disabledSet = new Set(this.config.disabledRules);
    return this.registry
      .getAllEnabled()
      .filter((r) => !disabledSet.has(r.id));
  }
}

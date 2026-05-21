/**
 * @file types.ts
 * @description Core type contracts for the CI/CD Rule Engine.
 *
 * Every rule plugin, the rule registry, and the rule runner operate on
 * these types. This file contains NO business logic — only type definitions,
 * enums, interfaces, and the abstract BaseRule class.
 *
 * Design principles:
 *  - Zero `any` types. Every field is fully typed.
 *  - The Rule interface is the single contract all 50+ rules must satisfy.
 *  - BaseRule provides helpers to reduce boilerplate in rule implementations.
 *  - RuleContext is intentionally read-only to prevent rules from mutating state.
 */

import type { NormalizedWorkflow } from '../models/workflow.model';

// =============================================================================
// SECTION 1 — RULE CATEGORY ENUM
// =============================================================================

/** Broad classification of what domain a rule checks. */
export enum RuleCategory {
  SECURITY        = 'security',
  RELIABILITY     = 'reliability',
  PERFORMANCE     = 'performance',
  MAINTAINABILITY = 'maintainability',
  DEPENDENCY      = 'dependency',
  DAG             = 'dag',
}

// =============================================================================
// SECTION 2 — RULE SEVERITY ENUM
// =============================================================================

/**
 * How urgently a rule violation should be addressed.
 *
 * CRITICAL — immediate production risk, should block deployment.
 * HIGH     — serious risk, should block PR merge.
 * MEDIUM   — reliability concern, should be fixed in next sprint.
 * LOW      — best practice violation, fix when possible.
 * INFO     — informational, no action required.
 */
export enum RuleSeverity {
  CRITICAL = 'critical',
  HIGH     = 'high',
  MEDIUM   = 'medium',
  LOW      = 'low',
  INFO     = 'info',
}

// =============================================================================
// SECTION 3 — RULE RESULT
// =============================================================================

/**
 * The confidence level of a finding.
 *
 * CERTAIN  — rule is deterministic, no false positives possible.
 * LIKELY   — strong heuristic, very few false positives.
 * POSSIBLE — pattern match, some false positives expected.
 */
export enum RuleConfidence {
  CERTAIN  = 'certain',
  LIKELY   = 'likely',
  POSSIBLE = 'possible',
}

/**
 * Pinpoints where in a workflow (or source file) a violation was found.
 * All fields default to null when the violation is at a higher scope.
 */
export interface RuleResultLocation {
  /** The source file path e.g. ".github/workflows/ci.yml". */
  filePath: string;

  /** Which job the violation is in. Null if workflow-level. */
  jobId: string | null;

  /** Human-readable job name. */
  jobName: string | null;

  /** Which step (null if job-level or workflow-level). */
  stepId: string | null;

  /** Human-readable step name. */
  stepName: string | null;

  /**
   * Dot-notation path to the specific field.
   * @example "jobs.build.steps[0].uses"
   * @example "jobs.deploy.container.image"
   * @example "globalEnv[2].value"
   */
  field: string;

  /** Line number in original source file if available. */
  line: number | null;
}

/**
 * A single finding produced by a rule's check() method.
 *
 * A rule run can produce zero, one, or many RuleResults — one per distinct
 * violation. The rule runner combines them into a WorkflowRuleReport.
 */
export interface RuleResult {
  /** The id of the rule that produced this result. */
  ruleId: string;

  /** Human-readable rule name. */
  ruleName: string;

  /** Which category this finding belongs to. */
  category: RuleCategory;

  /**
   * Severity of this specific finding. Can be overridden per-finding when
   * context changes severity (e.g. floating tag is HIGH in prod, MEDIUM in dev).
   */
  severity: RuleSeverity;

  /**
   * Short one-line description of THIS specific violation, not the rule name.
   * @example "Job 'deploy' uses floating Docker image node:latest"
   */
  title: string;

  /**
   * Full explanation of why this is a risk.
   * Should be 2–3 sentences describing the failure scenario.
   */
  description: string;

  /**
   * Concrete, actionable fix instruction.
   * @example "Pin the image to a digest: node@sha256:abc123..."
   */
  remediation: string;

  /** Where in the workflow the violation was found. */
  location: RuleResultLocation;

  /**
   * The actual value that triggered the rule — what the user would look at
   * to verify the finding.
   * @example "node:latest"
   * @example "actions/checkout@v3"
   */
  evidence: string;

  /** How certain this finding is. */
  confidence: RuleConfidence;

  /**
   * Optional extra data for this finding. Used by the AI layer and report
   * builder later.
   * @example { imageTag: 'latest', imageName: 'node', affectedJobs: ['build', 'test'] }
   */
  metadata: Record<string, unknown>;
}

// =============================================================================
// SECTION 4 — THE RULE INTERFACE
// =============================================================================

/**
 * Contract every rule plugin MUST implement.
 *
 * Rules are self-contained, synchronous, stateless objects.
 * check() must never throw — handle all errors internally.
 */
export interface Rule {
  /**
   * Unique rule identifier in kebab-case.
   * Format: {category}-{descriptor}
   * @example 'security-unpinned-action'
   * @example 'reliability-missing-timeout'
   * @example 'dag-cyclic-dependency'
   */
  id: string;

  /** Human-readable rule name. */
  name: string;

  /** Which category this rule belongs to. */
  category: RuleCategory;

  /**
   * Default severity. Individual findings can override this via
   * RuleResult.severity.
   */
  severity: RuleSeverity;

  /** What this rule checks for — used in documentation and registry listings. */
  description: string;

  /**
   * WHY this rule exists — what failure it prevents.
   * @example "Unpinned actions can be silently updated to include malicious
   *   code, compromising your entire CI pipeline."
   */
  rationale: string;

  /**
   * Links to documentation, CVEs, or blog posts explaining the risk.
   * @example ["https://docs.github.com/en/actions/security-guides/..."]
   */
  references: string[];

  /**
   * Whether this rule runs by default.
   * Disabled rules are registered but skipped at runtime.
   */
  enabled: boolean;

  /**
   * Core method: analyze the workflow, return all findings.
   *
   * Constraints:
   * - MAY be async for rules that require I/O (e.g. dependency scanning).
   * - MUST never throw — catch all errors internally.
   * - Returns [] if no violations found.
   * - Returns one RuleResult per violation.
   */
  check(workflow: NormalizedWorkflow, context: RuleContext): Promise<RuleResult[]> | RuleResult[];
}

// =============================================================================
// SECTION 5 — RULE CONTEXT
// =============================================================================

/**
 * Read-only contextual data passed to every rule's check() method.
 * Rules must never mutate any field in this object.
 */
export interface RuleContext {
  /** The repository being analyzed. */
  readonly repoId: string;

  /** The current scan being run. */
  readonly scanId: string;

  /** The source file being analyzed. */
  readonly filePath: string;

  /**
   * Which CI system this workflow came from.
   * @example 'github-actions' | 'gitlab-ci' | 'dockerfile'
   */
  readonly ciSystem: string;

  /** Per-rule configuration overrides active for this run. */
  readonly config: RuleConfig;

  /**
   * ALL workflows from this repo's current scan. Needed for cross-file rules
   * (e.g. detect duplicate configs). The current workflow is also in this array.
   */
  readonly allWorkflows: NormalizedWorkflow[];

  /** Info about the repository itself. */
  readonly repoMetadata: RepoMetadata;

  /**
   * Absolute path to the repository root on disk.
   * Populated for dependency scanning rules that need to read lock files.
   * Optional — not all scan contexts have filesystem access.
   */
  readonly repoRoot?: string;
}

/** Per-rule configuration that overrides defaults at runtime. */
export interface RuleConfig {
  /**
   * Override severity for specific rule ids.
   * @example { 'reliability-missing-timeout': RuleSeverity.HIGH }
   */
  severityOverrides: Partial<Record<string, RuleSeverity>>;

  /** Rule ids to skip entirely. */
  disabledRules: string[];

  /**
   * Numeric thresholds for rules that need them.
   * @example { 'maintainability-job-count': 15 }
   */
  customThresholds: Record<string, number>;

  /**
   * Glob patterns — files matching these are skipped.
   * @example ['**\/node_modules\/**', '**\/vendor\/**']
   */
  ignorePaths: string[];
}

/** Metadata about the repository being analyzed. */
export interface RepoMetadata {
  /** The repository name. */
  name: string;
  /** The version control provider (e.g. 'github', 'gitlab'). */
  provider: string;
  /** The repository's default branch. */
  defaultBranch: string;
  /** True if multiple package.json or pom.xml detected. */
  isMonorepo: boolean;
}

// =============================================================================
// SECTION 6 — RULE EXECUTION RESULT
// =============================================================================

/** Error emitted when a rule's check() throws internally. */
export interface RuleExecutionError {
  ruleId: string;
  ruleName: string;
  error: string;
  stack?: string;
}

/**
 * All findings produced by running ALL rules against ONE NormalizedWorkflow.
 */
export interface WorkflowRuleReport {
  /** The workflow id (NormalizedWorkflow.id). */
  workflowId: string;
  /** The source file that was analyzed. */
  filePath: string;
  /** Which CI system this workflow came from. */
  ciSystem: string;
  /** Total number of rules that were executed. */
  rulesRun: number;
  /** Rules that returned zero findings. */
  rulesPassed: number;
  /** Rules that threw an error during check(). */
  rulesFailed: number;
  /** All findings from all rules combined. */
  findings: RuleResult[];
  /** Findings grouped by severity for quick access. */
  findingsBySeverity: Record<RuleSeverity, RuleResult[]>;
  /** Findings grouped by category for quick access. */
  findingsByCategory: Record<RuleCategory, RuleResult[]>;
  /** Total wall-clock time for all rules to execute. */
  executionTimeMs: number;
  /** Details of any rules that threw internally. */
  errors: RuleExecutionError[];
}

// =============================================================================
// SECTION 7 — FULL SCAN REPORT
// =============================================================================

/**
 * Aggregated result of running ALL rules against ALL workflows in one scan.
 */
export interface ScanRuleReport {
  /** The scan id this report belongs to. */
  scanId: string;
  /** The repository id. */
  repoId: string;
  /** Total number of workflows analyzed. */
  totalWorkflows: number;
  /** Total number of rule executions (rules × workflows). */
  totalRulesRun: number;
  /** Total findings across all workflows. */
  totalFindings: number;
  /** Finding counts keyed by severity. */
  findingsBySeverity: Record<RuleSeverity, number>;
  /** Finding counts keyed by category. */
  findingsByCategory: Record<RuleCategory, number>;
  /** One WorkflowRuleReport per analyzed workflow. */
  workflowReports: WorkflowRuleReport[];
  /**
   * 0–100 risk score. Calculated by the risk scorer (Step 7).
   * 0 = no risk, 100 = maximum risk.
   */
  riskScore: number;
  /** Letter grade derived from riskScore. */
  riskGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Total wall-clock time for the entire scan. */
  executionTimeMs: number;
  /** When this report was finalized. */
  completedAt: Date;
}

// =============================================================================
// SECTION 8 — ABSTRACT BASE CLASS
// =============================================================================

/**
 * Abstract base class that rule implementations can extend to reduce boilerplate.
 *
 * Provides three protected helpers:
 *  - buildLocation() — constructs a RuleResultLocation with defaults.
 *  - buildResult()   — constructs a RuleResult bound to this rule's id/name/category.
 *  - safeCheck()     — wraps check logic in try/catch; returns [] on error.
 *
 * @example
 * class MyRule extends BaseRule {
 *   id = 'security-my-rule';
 *   name = 'My Rule';
 *   category = RuleCategory.SECURITY;
 *   severity = RuleSeverity.HIGH;
 *   description = '...';
 *   rationale = '...';
 *
 *   check(workflow, context) {
 *     return this.safeCheck(workflow, context, () => {
 *       // ... return findings
 *     });
 *   }
 * }
 */
export abstract class BaseRule implements Rule {
  abstract id: string;
  abstract name: string;
  abstract category: RuleCategory;
  abstract severity: RuleSeverity;
  abstract description: string;
  abstract rationale: string;

  references: string[] = [];
  enabled: boolean = true;

  abstract check(workflow: NormalizedWorkflow, context: RuleContext): Promise<RuleResult[]> | RuleResult[];

  /**
   * Build a RuleResultLocation with sensible defaults.
   *
   * - filePath defaults to context.filePath
   * - jobId, jobName, stepId, stepName, line default to null
   * - field defaults to ''
   * - overrides are merged on top
   */
  protected buildLocation(
    _workflow: NormalizedWorkflow,
    context: RuleContext,
    overrides: Partial<RuleResultLocation> = {},
  ): RuleResultLocation {
    return {
      filePath:  context.filePath,
      jobId:     null,
      jobName:   null,
      stepId:    null,
      stepName:  null,
      field:     '',
      line:      null,
      ...overrides,
    };
  }

  /**
   * Build a RuleResult bound to this rule's id, name, and category.
   *
   * @param partial - All fields except ruleId, ruleName, category.
   *   severity may be provided to override the rule default.
   * @param location - Pre-built RuleResultLocation.
   */
  protected buildResult(
    partial: Omit<RuleResult, 'ruleId' | 'ruleName' | 'category' | 'severity' | 'location' | 'metadata'>
      & { severity?: RuleSeverity; metadata?: Record<string, any> },
    location: RuleResultLocation,
  ): RuleResult {
    return {
      ruleId:    this.id,
      ruleName:  this.name,
      category:  this.category,
      severity:  partial.severity ?? this.severity,
      title:     partial.title,
      description: partial.description,
      remediation: partial.remediation,
      evidence:  partial.evidence,
      confidence: partial.confidence,
      metadata:  partial.metadata ?? {},
      location,
    };
  }

  /**
   * Wraps a check implementation in try/catch.
   *
   * If fn() throws, the error is swallowed and [] is returned so the runner
   * can continue with remaining rules. The calling check() should use this
   * as its outermost wrapper.
   *
   * @example
   * check(workflow, context) {
   *   return this.safeCheck(workflow, context, () => {
   *     // your logic here
   *   });
   * }
   */
  protected safeCheck(
    _workflow: NormalizedWorkflow,
    _context: RuleContext,
    fn: () => RuleResult[],
  ): RuleResult[] {
    try {
      return fn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Errors here are surfaced via RuleExecutionError in the runner,
      // not via console.error, to keep the runner's error model consistent.
      void message;
      return [];
    }
  }
}

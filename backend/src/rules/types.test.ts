/**
 * @file types.test.ts
 * @description 25-test suite for the rule engine types, registry, and runner.
 *
 * Run with:  npx ts-node src/rules/types.test.ts
 *
 * Zero external dependencies — uses only Node.js built-in `assert`.
 */

import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';

import type { NormalizedWorkflow, Job, DockerImageRef } from '../models/workflow.model';
import {
  WorkflowSource,
  RunnerType,
} from '../models/workflow.model';

import {
  BaseRule,
  RuleCategory,
  RuleConfidence,
  RuleResult,
  RuleContext,
  RuleSeverity,
} from './types';

import { RuleRegistry } from './rule-registry';
import { RuleRunner, defaultRuleConfig, matchesGlob } from './rule-runner';

// =============================================================================
// TEST UTILITIES
// =============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL  ${name}\n        ${msg}`);
    failed++;
  }
}

// =============================================================================
// MINIMAL WORKFLOW FACTORY
// =============================================================================

function makeWorkflow(overrides: Partial<NormalizedWorkflow> = {}): NormalizedWorkflow {
  return {
    id:       uuidv4(),
    source:   WorkflowSource.GITHUB_ACTIONS,
    sourceFile: '.github/workflows/ci.yml',
    repoId:   'repo-1',
    parsedAt: new Date(),
    jobs:     [],
    triggers: [],
    globalEnv:     [],
    globalSecrets: [],
    permissions:   [],
    metadata: {
      name:              'CI',
      description:       null,
      totalJobs:         0,
      totalSteps:        0,
      hasDockerImages:   false,
      hasSecrets:        false,
      hasExternalActions:false,
      ciSystem:          'github-actions',
    },
    ...overrides,
  };
}

function makeFloatingImageRef(): DockerImageRef {
  return {
    registry:   null,
    image:      'node',
    tag:        'latest',
    digest:     null,
    isFloating: true,
    isPinned:   false,
  };
}

function makePinnedImageRef(): DockerImageRef {
  return {
    registry:   null,
    image:      'node',
    tag:        '20-alpine',
    digest:     'sha256:abc123',
    isFloating: false,
    isPinned:   true,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:              uuidv4(),
    name:            'build',
    steps:           [],
    needs:           [],
    env:             [],
    secrets:         [],
    services:        [],
    runsOn:          { type: RunnerType.GITHUB_HOSTED, labels: ['ubuntu-latest'], image: null },
    conditions:      [],
    strategy:        null,
    timeoutMinutes:  null,
    continueOnError: false,
    retryStrategy:   null,
    artifacts:       [],
    container:       null,
    ...overrides,
  };
}

const mockRepoMetadata = {
  name:          'test-repo',
  provider:      'github',
  defaultBranch: 'main',
  isMonorepo:    false,
};

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  const wf = makeWorkflow();
  return {
    repoId:       'repo-1',
    scanId:       'scan-1',
    filePath:     '.github/workflows/ci.yml',
    ciSystem:     'github-actions',
    config:       defaultRuleConfig,
    allWorkflows: [wf],
    repoMetadata: mockRepoMetadata,
    ...overrides,
  };
}

// =============================================================================
// MOCK RULE — FloatingDockerTagMockRule
// =============================================================================

class FloatingDockerTagMockRule extends BaseRule {
  id       = 'reliability-floating-docker-tag';
  name     = 'Floating Docker Image Tag';
  category = RuleCategory.RELIABILITY;
  severity = RuleSeverity.HIGH;
  description = 'Detects Docker images using floating tags like :latest or no tag';
  rationale   = 'Floating tags can silently pull breaking changes into your pipeline';
  references  = ['https://docs.docker.com/develop/dev-best-practices/'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      for (const job of workflow.jobs) {
        if (job.container?.imageRef.isFloating) {
          results.push(
            this.buildResult(
              {
                title:       `Job '${job.name}' uses floating Docker image`,
                description: `The container image ${job.container.imageRef.image} uses a floating tag.`,
                remediation: 'Pin the image to a specific digest using @sha256:...',
                evidence:    `${job.container.imageRef.image}:${job.container.imageRef.tag ?? 'latest'}`,
                confidence:  RuleConfidence.CERTAIN,
                metadata:    { jobId: job.id, imageName: job.container.imageRef.image },
              },
              this.buildLocation(workflow, context, {
                jobId:   job.id,
                jobName: job.name,
                field:   `jobs.${job.id}.container.image`,
              }),
            ),
          );
        }
      }

      return results;
    });
  }
}

// =============================================================================
// TESTS
// =============================================================================

console.log('\nRunning rule engine tests...\n');

// ---------------------------------------------------------------------------
// TEST 1 — Rule interface shape
// ---------------------------------------------------------------------------
test('TEST 1 — Rule interface shape', () => {
  const rule = new FloatingDockerTagMockRule();
  assert.strictEqual(rule.id,       'reliability-floating-docker-tag');
  assert.strictEqual(rule.name,     'Floating Docker Image Tag');
  assert.strictEqual(rule.category, RuleCategory.RELIABILITY);
  assert.strictEqual(rule.severity, RuleSeverity.HIGH);
  assert.strictEqual(rule.enabled,  true);
  assert.strictEqual(typeof rule.check, 'function');
});

// ---------------------------------------------------------------------------
// TEST 2 — Rule returns empty array when no violations
// ---------------------------------------------------------------------------
test('TEST 2 — Rule returns empty array when no violations', () => {
  const rule = new FloatingDockerTagMockRule();
  const wf   = makeWorkflow(); // no jobs, no containers
  const ctx  = makeContext({ allWorkflows: [wf] });
  const result = rule.check(wf, ctx);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 3 — Rule detects floating docker tag
// ---------------------------------------------------------------------------
test('TEST 3 — Rule detects floating docker tag', () => {
  const rule  = new FloatingDockerTagMockRule();
  const jobId = uuidv4();
  const job   = makeJob({
    id:        jobId,
    name:      'build',
    container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] },
  });
  const wf  = makeWorkflow({ jobs: [job] });
  const ctx = makeContext({ allWorkflows: [wf] });
  const result = rule.check(wf, ctx);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].ruleId,    'reliability-floating-docker-tag');
  assert.strictEqual(result[0].severity,  RuleSeverity.HIGH);
  assert.strictEqual(result[0].confidence, RuleConfidence.CERTAIN);
  assert.strictEqual(result[0].location.jobId, jobId);
  assert.ok(result[0].evidence.includes('node'));
});

// ---------------------------------------------------------------------------
// TEST 4 — Rule returns multiple results for multiple violations
// ---------------------------------------------------------------------------
test('TEST 4 — Rule returns multiple results for multiple violations', () => {
  const rule = new FloatingDockerTagMockRule();
  const j1   = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const j2   = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const wf   = makeWorkflow({ jobs: [j1, j2] });
  const ctx  = makeContext({ allWorkflows: [wf] });
  const result = rule.check(wf, ctx);
  assert.strictEqual(result.length, 2);
});

// ---------------------------------------------------------------------------
// TEST 5 — Rule does NOT flag pinned image
// ---------------------------------------------------------------------------
test('TEST 5 — Rule does NOT flag pinned image', () => {
  const rule = new FloatingDockerTagMockRule();
  const job  = makeJob({ container: { image: 'node:20-alpine', imageRef: makePinnedImageRef(), env: [], ports: [], volumes: [] } });
  const wf   = makeWorkflow({ jobs: [job] });
  const ctx  = makeContext({ allWorkflows: [wf] });
  const result = rule.check(wf, ctx);
  assert.strictEqual(result.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 6 — safeCheck catches thrown errors
// ---------------------------------------------------------------------------
test('TEST 6 — safeCheck catches thrown errors', () => {
  class ThrowingRule extends BaseRule {
    id       = 'test-throwing-rule';
    name     = 'Throwing Rule';
    category = RuleCategory.SECURITY;
    severity = RuleSeverity.HIGH;
    description = 'throws';
    rationale   = 'throws';

    check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
      return this.safeCheck(workflow, context, () => {
        throw new Error('deliberate error');
      });
    }
  }

  const rule   = new ThrowingRule();
  const wf     = makeWorkflow();
  const ctx    = makeContext({ allWorkflows: [wf] });
  const result = rule.check(wf, ctx);
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 7 — RuleRegistry register and retrieve
// ---------------------------------------------------------------------------
test('TEST 7 — RuleRegistry register and retrieve', () => {
  const registry = new RuleRegistry();
  const rule = new FloatingDockerTagMockRule();
  registry.register(rule);
  assert.strictEqual(registry.has('reliability-floating-docker-tag'), true);
  assert.strictEqual(registry.count(), 1);
  assert.strictEqual(registry.getById('reliability-floating-docker-tag'), rule);
});

// ---------------------------------------------------------------------------
// TEST 8 — RuleRegistry prevents duplicate registration
// ---------------------------------------------------------------------------
test('TEST 8 — RuleRegistry prevents duplicate registration', () => {
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  assert.throws(
    () => registry.register(new FloatingDockerTagMockRule()),
    /already registered/,
  );
});

// ---------------------------------------------------------------------------
// TEST 9 — RuleRegistry getByCategory
// ---------------------------------------------------------------------------
test('TEST 9 — RuleRegistry getByCategory', () => {
  class SecRule extends BaseRule {
    id = 'security-test-rule'; name = 'Sec'; category = RuleCategory.SECURITY;
    severity = RuleSeverity.HIGH; description = 'd'; rationale = 'r';
    check() { return []; }
  }
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  registry.register(new class extends FloatingDockerTagMockRule { id = 'reliability-floating-docker-tag-2'; }());
  registry.register(new SecRule());

  assert.strictEqual(registry.getByCategory(RuleCategory.RELIABILITY).length, 2);
  assert.strictEqual(registry.getByCategory(RuleCategory.SECURITY).length,    1);
  assert.strictEqual(registry.getByCategory(RuleCategory.DAG).length,         0);
});

// ---------------------------------------------------------------------------
// TEST 10 — RuleRegistry getAll sorted by severity
// ---------------------------------------------------------------------------
test('TEST 10 — RuleRegistry getAll sorted by severity', () => {
  class MkRule extends BaseRule {
    constructor(public id: string, public severity: RuleSeverity) { super(); }
    name = 'n'; category = RuleCategory.RELIABILITY; description = 'd'; rationale = 'r';
    check() { return []; }
  }
  const registry = new RuleRegistry();
  registry.register(new MkRule('reliability-low',      RuleSeverity.LOW));
  registry.register(new MkRule('reliability-critical', RuleSeverity.CRITICAL));
  registry.register(new MkRule('reliability-high',     RuleSeverity.HIGH));
  registry.register(new MkRule('reliability-medium',   RuleSeverity.MEDIUM));

  const all = registry.getAll();
  assert.strictEqual(all[0].severity, RuleSeverity.CRITICAL);
  assert.strictEqual(all[all.length - 1].severity, RuleSeverity.LOW);
});

// ---------------------------------------------------------------------------
// TEST 11 — RuleRegistry summary
// ---------------------------------------------------------------------------
test('TEST 11 — RuleRegistry summary', () => {
  class DisabledRule extends FloatingDockerTagMockRule {
    id = 'reliability-disabled-rule';
    enabled = false;
  }
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  registry.register(new class extends FloatingDockerTagMockRule { id = 'reliability-r2'; }());
  registry.register(new class extends FloatingDockerTagMockRule { id = 'reliability-r3'; }());
  registry.register(new DisabledRule());

  const s = registry.summary();
  assert.strictEqual(s.total,   4);
  assert.strictEqual(s.enabled, 3);
  assert.strictEqual(s.disabled, 1);
});

// ---------------------------------------------------------------------------
// TEST 12 — RuleRunner runs rules and returns WorkflowRuleReport
// ---------------------------------------------------------------------------
test('TEST 12 — RuleRunner runs rules and returns WorkflowRuleReport', () => {
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  const runner = new RuleRunner(registry);

  const job = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const wf  = makeWorkflow({ jobs: [job] });
  const report = runner.runOnWorkflow(wf, { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });

  assert.strictEqual(report.rulesRun,  1);
  assert.strictEqual(report.findings.length, 1);
  assert.strictEqual(report.rulesPassed, 0);
  assert.strictEqual(report.findingsBySeverity[RuleSeverity.HIGH].length,     1);
  assert.strictEqual(report.findingsByCategory[RuleCategory.RELIABILITY].length, 1);
  assert.ok(report.executionTimeMs >= 0);
});

// ---------------------------------------------------------------------------
// TEST 13 — RuleRunner passes when no violations
// ---------------------------------------------------------------------------
test('TEST 13 — RuleRunner passes when no violations', () => {
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  const runner = new RuleRunner(registry);
  const wf = makeWorkflow();
  const report = runner.runOnWorkflow(wf, { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });
  assert.strictEqual(report.findings.length, 0);
  assert.strictEqual(report.rulesPassed, 1);
});

// ---------------------------------------------------------------------------
// TEST 14 — RuleRunner skips disabled rules
// ---------------------------------------------------------------------------
test('TEST 14 — RuleRunner skips disabled rules', () => {
  class DisabledFloatingRule extends FloatingDockerTagMockRule {
    enabled = false;
  }
  const registry = new RuleRegistry();
  registry.register(new DisabledFloatingRule());
  const runner = new RuleRunner(registry);

  const job = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const wf  = makeWorkflow({ jobs: [job] });
  const report = runner.runOnWorkflow(wf, { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });

  assert.strictEqual(report.rulesRun,  0);
  assert.strictEqual(report.findings.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 15 — RuleRunner skips rules in disabledRules config
// ---------------------------------------------------------------------------
test('TEST 15 — RuleRunner skips rules in disabledRules config', () => {
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  const runner = new RuleRunner(registry, {
    ...defaultRuleConfig,
    disabledRules: ['reliability-floating-docker-tag'],
  });

  const job = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const wf  = makeWorkflow({ jobs: [job] });
  const report = runner.runOnWorkflow(wf, { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });
  assert.strictEqual(report.findings.length, 0);
});

// ---------------------------------------------------------------------------
// TEST 16 — RuleRunner handles rule that throws internally
// ---------------------------------------------------------------------------
test('TEST 16 — RuleRunner handles rule that throws internally', () => {
  class AlwaysThrowRule extends BaseRule {
    id = 'test-always-throw'; name = 'Thrower';
    category = RuleCategory.SECURITY; severity = RuleSeverity.HIGH;
    description = 'd'; rationale = 'r';
    check(): RuleResult[] { throw new Error('rule explosion'); }
  }
  const registry = new RuleRegistry();
  registry.register(new AlwaysThrowRule());
  const runner = new RuleRunner(registry);
  const wf = makeWorkflow();

  let report: ReturnType<typeof runner.runOnWorkflow>;
  assert.doesNotThrow(() => {
    report = runner.runOnWorkflow(wf, { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });
  });
  assert.strictEqual(report!.rulesFailed, 1);
  assert.strictEqual(report!.errors[0].ruleId, 'test-always-throw');
});

// ---------------------------------------------------------------------------
// TEST 17 — RuleRunner.runOnScan aggregates multiple workflows
// ---------------------------------------------------------------------------
test('TEST 17 — RuleRunner.runOnScan aggregates multiple workflows', () => {
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  const runner = new RuleRunner(registry);

  const job1 = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const job2 = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const wf1 = makeWorkflow({ jobs: [job1] });
  const wf2 = makeWorkflow({ jobs: [job2] });

  const report = runner.runOnScan([wf1, wf2], { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });
  assert.strictEqual(report.totalWorkflows,  2);
  assert.strictEqual(report.totalFindings,   2);
  assert.strictEqual(report.workflowReports.length, 2);
});

// ---------------------------------------------------------------------------
// TEST 18 — Risk score calculation
// ---------------------------------------------------------------------------
test('TEST 18 — Risk score calculation', () => {
  // Inject a crafted scan report via runOnScan with no rules but inject findings manually.
  // Instead, build 2 critical, 3 high, 5 medium, 2 low violations directly via custom rules.
  class SeverityRule extends BaseRule {
    constructor(
      public id: string,
      public severity: RuleSeverity,
      private count: number,
    ) { super(); }
    name = 'SR'; category = RuleCategory.SECURITY; description = 'd'; rationale = 'r';
    check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
      return this.safeCheck(workflow, context, () => {
        const results: RuleResult[] = [];
        for (let i = 0; i < this.count; i++) {
          results.push(this.buildResult({
            title: `t${i}`, description: 'd', remediation: 'r',
            evidence: 'e', confidence: RuleConfidence.CERTAIN, metadata: {},
          }, this.buildLocation(workflow, context, {})));
        }
        return results;
      });
    }
  }

  const reg2 = new RuleRegistry();
  reg2.register(new SeverityRule('sec-c1', RuleSeverity.CRITICAL, 2));
  reg2.register(new SeverityRule('sec-h1', RuleSeverity.HIGH,     3));
  reg2.register(new SeverityRule('sec-m1', RuleSeverity.MEDIUM,   5));
  reg2.register(new SeverityRule('sec-l1', RuleSeverity.LOW,      2));

  const runner2 = new RuleRunner(reg2);
  const wf = makeWorkflow();
  const report = runner2.runOnScan([wf], { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });

  // score = min(100, 2×20 + 3×8 + 5×3 + 2×1) = min(100, 40+24+15+2) = 81
  assert.strictEqual(report.riskScore, 81);
  assert.strictEqual(report.riskGrade, 'F');
});

// ---------------------------------------------------------------------------
// TEST 19 — Risk grade A for clean repo
// ---------------------------------------------------------------------------
test('TEST 19 — Risk grade A for clean repo', () => {
  const registry = new RuleRegistry();
  const runner   = new RuleRunner(registry);
  const wf = makeWorkflow();
  const report = runner.runOnScan([wf], { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });
  assert.strictEqual(report.riskScore, 0);
  assert.strictEqual(report.riskGrade, 'A');
});

// ---------------------------------------------------------------------------
// TEST 20 — Glob matching helper
// ---------------------------------------------------------------------------
test('TEST 20 — Glob matching helper', () => {
  assert.strictEqual(matchesGlob('**/node_modules/**', 'src/node_modules/lodash'),     true);
  assert.strictEqual(matchesGlob('*.yml', 'ci.yml'),                                   true);
  assert.strictEqual(matchesGlob('*.yml', 'dir/ci.yml'),                               false);
  assert.strictEqual(matchesGlob('**/*.yml', 'dir/subdir/ci.yml'),                     true);
  assert.strictEqual(matchesGlob('Dockerfile*', 'Dockerfile.prod'),                    true);
  assert.strictEqual(matchesGlob('Dockerfile*', 'src/Dockerfile'),                     false);
});

// ---------------------------------------------------------------------------
// TEST 21 — buildLocation helper defaults
// ---------------------------------------------------------------------------
test('TEST 21 — buildLocation helper defaults', () => {
  class LocationTestRule extends FloatingDockerTagMockRule {
    id = 'reliability-location-test';
    testBuildLocation(wf: NormalizedWorkflow, ctx: RuleContext) {
      return this.buildLocation(wf, ctx, { jobId: 'job-abc' });
    }
  }
  const rule = new LocationTestRule();
  const wf  = makeWorkflow();
  const ctx = makeContext({ allWorkflows: [wf] });
  const loc = rule.testBuildLocation(wf, ctx);

  assert.strictEqual(loc.filePath, ctx.filePath);
  assert.strictEqual(loc.jobId,    'job-abc');
  assert.strictEqual(loc.stepId,   null);
  assert.strictEqual(loc.line,     null);
});

// ---------------------------------------------------------------------------
// TEST 22 — RuleRegistry clear() blocked in production
// ---------------------------------------------------------------------------
test('TEST 22 — RuleRegistry clear() blocked in production', () => {
  const registry = new RuleRegistry();
  const original = process.env['NODE_ENV'];
  process.env['NODE_ENV'] = 'production';
  assert.throws(() => registry.clear(), /not allowed in production/);
  process.env['NODE_ENV'] = original ?? 'test';
});

// ---------------------------------------------------------------------------
// TEST 23 — RuleContext is passed correctly to check()
// ---------------------------------------------------------------------------
test('TEST 23 — RuleContext is passed correctly to check()', () => {
  let capturedContext: RuleContext | null = null;

  class SpyRule extends BaseRule {
    id = 'reliability-spy-rule'; name = 'Spy';
    category = RuleCategory.RELIABILITY; severity = RuleSeverity.LOW;
    description = 'd'; rationale = 'r';
    check(_workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
      capturedContext = context;
      return [];
    }
  }

  const registry = new RuleRegistry();
  registry.register(new SpyRule());
  const runner = new RuleRunner(registry);
  const wf = makeWorkflow();

  runner.runOnWorkflow(wf, {
    repoId: 'repo-xyz', scanId: 'scan-abc', repoMetadata: mockRepoMetadata,
    allWorkflows: [wf],
  });

  assert.ok(capturedContext !== null);
  const ctx2 = capturedContext as RuleContext;
  assert.strictEqual(ctx2.repoId,   'repo-xyz');
  assert.strictEqual(ctx2.scanId,   'scan-abc');
  assert.strictEqual(ctx2.filePath, wf.sourceFile);
  assert.strictEqual(ctx2.ciSystem, wf.metadata.ciSystem);
});

// ---------------------------------------------------------------------------
// TEST 24 — severityOverride in config changes finding severity
// ---------------------------------------------------------------------------
test('TEST 24 — severityOverride in config changes finding severity', () => {
  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  const runner = new RuleRunner(registry, {
    ...defaultRuleConfig,
    severityOverrides: { 'reliability-floating-docker-tag': RuleSeverity.CRITICAL },
  });

  const job = makeJob({ container: { image: 'node:latest', imageRef: makeFloatingImageRef(), env: [], ports: [], volumes: [] } });
  const wf  = makeWorkflow({ jobs: [job] });
  const report = runner.runOnWorkflow(wf, { repoId: 'r1', scanId: 's1', repoMetadata: mockRepoMetadata });

  assert.strictEqual(report.findings[0].severity, RuleSeverity.CRITICAL);
});

// ---------------------------------------------------------------------------
// TEST 25 — RuleRunner.runOnWorkflowWithRules only runs specified rules
// ---------------------------------------------------------------------------
test('TEST 25 — RuleRunner.runOnWorkflowWithRules only runs specified rules', () => {
  class ExtraRule extends BaseRule {
    id = 'security-extra'; name = 'Extra';
    category = RuleCategory.SECURITY; severity = RuleSeverity.MEDIUM;
    description = 'd'; rationale = 'r';
    check() { return []; }
  }
  class ThirdRule extends BaseRule {
    id = 'dag-third'; name = 'Third';
    category = RuleCategory.DAG; severity = RuleSeverity.LOW;
    description = 'd'; rationale = 'r';
    check() { return []; }
  }

  const registry = new RuleRegistry();
  registry.register(new FloatingDockerTagMockRule());
  registry.register(new ExtraRule());
  registry.register(new ThirdRule());
  const runner = new RuleRunner(registry);

  const wf = makeWorkflow();
  const ctx = {
    repoId: 'r1', scanId: 's1',
    filePath: wf.sourceFile,
    ciSystem: wf.metadata.ciSystem,
    repoMetadata: mockRepoMetadata,
  };

  const report = runner.runOnWorkflowWithRules(wf, ['reliability-floating-docker-tag'], ctx);
  assert.strictEqual(report.rulesRun, 1);

  // Non-existent rule id must throw
  assert.throws(
    () => runner.runOnWorkflowWithRules(wf, ['no-such-rule'], ctx),
    /Rule not found/,
  );
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log(`${'─'.repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}

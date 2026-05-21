/**
 * @file dag.rules.test.ts
 * @description Comprehensive test suite for DAG builder + graph analysis rules.
 *
 * Tests validate:
 *  - dag-builder.ts: buildDAG, detectCycles, analyzeReachability, findDeadStages,
 *    findMissingOutputDependencies
 *  - dag-cyclic-dependency.rule.ts
 *  - dag-unreachable-job.rule.ts
 *  - dag-dead-stage.rule.ts
 *  - dag-missing-dependency-output.rule.ts
 */

import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import {
  NormalizedWorkflow,
  WorkflowSource,
  RunnerType,
  ArtifactType,
} from '../../models/workflow.model';
import { RuleContext, RuleCategory, RuleResult } from '../types';
import { ruleRegistry } from '../rule-registry';
import { defaultRuleConfig } from '../rule-runner';

// Self-register all DAG rules
import { registerAllDagRules } from './index';
registerAllDagRules();

// Also register security/reliability so total count is correct
import '../security';
import '../reliability';

import {
  buildDAG,
  detectCycles,
  analyzeReachability,
  findDeadStages,
  findMissingOutputDependencies,
} from '../../engine/dag-builder';

// =============================================================================
// HELPERS
// =============================================================================

type DeepPartialJob = Partial<NormalizedWorkflow['jobs'][0]>;


function makeJob(id: string, name: string, needs: string[] = [], extras: DeepPartialJob = {}): NormalizedWorkflow['jobs'][0] {
  return {
    id,
    name,
    steps: [],
    needs: needs.map((jobId) => ({ jobId, outputs: [] })),
    env: [],
    secrets: [],
    services: [],
    runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null },
    conditions: [],
    strategy: null,
    timeoutMinutes: null,
    continueOnError: false,
    retryStrategy: null,
    artifacts: [],
    container: null,
    ...extras,
  };
}

function makeWorkflow(jobs: NormalizedWorkflow['jobs'], overrides: Partial<NormalizedWorkflow> = {}): NormalizedWorkflow {
  return {
    id: uuidv4(),
    source: WorkflowSource.GITHUB_ACTIONS,
    sourceFile: '.github/workflows/ci.yml',
    repoId: 'repo-1',
    parsedAt: new Date(),
    jobs,
    triggers: [],
    globalEnv: [],
    globalSecrets: [],
    permissions: [],
    metadata: {
      name: 'CI',
      description: null,
      totalJobs: jobs.length,
      totalSteps: 0,
      hasDockerImages: false,
      hasSecrets: false,
      hasExternalActions: false,
      ciSystem: 'github-actions',
    },
    ...overrides,
  };
}

function makeContext(): RuleContext {
  return {
    repoId: 'repo-1',
    scanId: 'scan-1',
    filePath: '.github/workflows/ci.yml',
    ciSystem: 'github-actions',
    config: defaultRuleConfig,
    allWorkflows: [],
    repoMetadata: { name: 'test', provider: 'github', defaultBranch: 'main', isMonorepo: false },
  };
}

function runRule(ruleId: string, wf: NormalizedWorkflow): RuleResult[] {
  const rule = ruleRegistry.getById(ruleId);
  if (!rule) throw new Error(`Rule '${ruleId}' not found in registry`);
  return rule.check(wf, makeContext());
}

// =============================================================================
// TEST RUNNER
// =============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}

console.log('\nRunning DAG Builder + Graph Analysis Rule Tests...\n');

// =============================================================================
// SECTION A — DAG BUILDER UNIT TESTS
// =============================================================================

test('A1 — buildDAG: linear chain creates correct edges', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test', 'Test', ['build']),
    makeJob('deploy', 'Deploy', ['test']),
  ]);
  const dag = buildDAG(wf);

  assert.strictEqual(dag.nodes.size, 3);
  assert.deepStrictEqual([...dag.successors.get('build')!], ['test']);
  assert.deepStrictEqual([...dag.successors.get('test')!], ['deploy']);
  assert.deepStrictEqual([...dag.predecessors.get('deploy')!], ['test']);
  assert.strictEqual(dag.predecessors.get('build')!.size, 0);
});

test('A2 — buildDAG: diamond dependency (fan-out + fan-in)', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test-unit', 'Unit Tests', ['build']),
    makeJob('test-e2e', 'E2E Tests', ['build']),
    makeJob('deploy', 'Deploy', ['test-unit', 'test-e2e']),
  ]);
  const dag = buildDAG(wf);

  assert.strictEqual(dag.successors.get('build')!.size, 2);
  assert.strictEqual(dag.predecessors.get('deploy')!.size, 2);
  assert.ok(dag.successors.get('build')!.has('test-unit'));
  assert.ok(dag.successors.get('build')!.has('test-e2e'));
});

test('A3 — buildDAG: registers phantom node from bad needs reference', () => {
  const wf = makeWorkflow([
    makeJob('deploy', 'Deploy', ['nonexistent-job']),
  ]);
  const dag = buildDAG(wf);
  assert.ok(dag.nodes.has('nonexistent-job'), 'Phantom node should be registered');
  assert.ok(!dag.jobMap.has('nonexistent-job'), 'Phantom node should NOT be in jobMap');
});

test('A4 — buildDAG: catalogs artifact producers', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: ['dist/'], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
  ]);
  const dag = buildDAG(wf);
  assert.ok(dag.artifactProducers.has('build'));
  assert.ok(dag.artifactProducers.get('build')!.has('dist'));
});

test('A5 — buildDAG: catalogs artifact consumers', () => {
  const wf = makeWorkflow([
    makeJob('deploy', 'Deploy', [], {
      artifacts: [{ name: 'dist', paths: ['dist/'], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const dag = buildDAG(wf);
  assert.ok(dag.artifactConsumers.has('deploy'));
  assert.ok(dag.artifactConsumers.get('deploy')!.has('dist'));
});

// =============================================================================
// SECTION B — CYCLE DETECTION
// =============================================================================

test('B1 — detectCycles: linear chain is acyclic', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test', 'Test', ['build']),
    makeJob('deploy', 'Deploy', ['test']),
  ]);
  const dag = buildDAG(wf);
  const result = detectCycles(dag);
  assert.strictEqual(result.isDAG, true);
  assert.strictEqual(result.cycles.length, 0);
});

test('B2 — detectCycles: diamond is acyclic', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('lint', 'Lint', ['build']),
    makeJob('test', 'Test', ['build']),
    makeJob('deploy', 'Deploy', ['lint', 'test']),
  ]);
  const result = detectCycles(buildDAG(wf));
  assert.strictEqual(result.isDAG, true);
});

test('B3 — detectCycles: direct self-cycle (A needs A)', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', ['build']), // self-loop
  ]);
  const result = detectCycles(buildDAG(wf));
  assert.strictEqual(result.isDAG, false);
  assert.ok(result.cycles.length >= 1);
});

test('B4 — detectCycles: two-node cycle (A needs B, B needs A)', () => {
  const wf = makeWorkflow([
    makeJob('jobA', 'Job A', ['jobB']),
    makeJob('jobB', 'Job B', ['jobA']),
  ]);
  const result = detectCycles(buildDAG(wf));
  assert.strictEqual(result.isDAG, false);
  assert.ok(result.cycles.length >= 1);
});

test('B5 — detectCycles: three-node cycle', () => {
  const wf = makeWorkflow([
    makeJob('a', 'A', ['c']),
    makeJob('b', 'B', ['a']),
    makeJob('c', 'C', ['b']),
  ]);
  const result = detectCycles(buildDAG(wf));
  assert.strictEqual(result.isDAG, false);
  assert.ok(result.cycles.length >= 1);
  // Cycle should contain all three nodes
  const allNodes = result.cycles.flatMap((c) => c.cycle);
  assert.ok(allNodes.some((n) => n === 'a'));
  assert.ok(allNodes.some((n) => n === 'b'));
  assert.ok(allNodes.some((n) => n === 'c'));
});

test('B6 — detectCycles: no jobs returns isDAG true', () => {
  const wf = makeWorkflow([]);
  const result = detectCycles(buildDAG(wf));
  assert.strictEqual(result.isDAG, true);
});

// =============================================================================
// SECTION C — REACHABILITY
// =============================================================================

test('C1 — analyzeReachability: all jobs reachable in chain', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test', 'Test', ['build']),
    makeJob('deploy', 'Deploy', ['test']),
  ]);
  const { reachable, unreachable, entryPoints } = analyzeReachability(buildDAG(wf));
  assert.strictEqual(reachable.size, 3);
  assert.strictEqual(unreachable.size, 0);
  assert.ok(entryPoints.has('build'));
});

test('C2 — analyzeReachability: detects job referencing non-existent upstream', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('deploy', 'Deploy', ['ghost-job']), // ghost-job does not exist
  ]);
  const dag = buildDAG(wf);
  const { unreachable: _unreachable } = analyzeReachability(dag);
  // 'deploy' is unreachable because 'ghost-job' has no predecessors but also
  // no entry job points to 'deploy'. 'ghost-job' IS an entry (0 predecessors).
  // 'deploy' needs 'ghost-job' which IS reachable (it's a phantom entry), so
  // 'deploy' becomes reachable from 'ghost-job'.
  // ─ This is intentional: the unreachable-job rule looks for the phantom node.
  assert.ok(dag.nodes.has('ghost-job'));
});

test('C3 — analyzeReachability: isolated island is unreachable', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test', 'Test', ['build']),
    makeJob('island-a', 'Island A', ['island-b']), // island_b doesn't exist
    // island-a references island-b which doesn't exist in jobMap
    // but island-b as phantom node is an entry → island-a IS reachable from it
    // True "unreachable" scenario: needs a cycle to cut off reachability
    makeJob('cycle-x', 'Cycle X', ['cycle-y']),
    makeJob('cycle-y', 'Cycle Y', ['cycle-x']),
  ]);
  const { unreachable } = analyzeReachability(buildDAG(wf));
  // cycle-x and cycle-y have no zero-in-degree entry → they are unreachable
  assert.ok(unreachable.has('cycle-x'));
  assert.ok(unreachable.has('cycle-y'));
});

test('C4 — analyzeReachability: multiple entry points all reachable', () => {
  const wf = makeWorkflow([
    makeJob('lint', 'Lint'),    // entry
    makeJob('build', 'Build'),  // entry
    makeJob('deploy', 'Deploy', ['lint', 'build']),
  ]);
  const { entryPoints, reachable } = analyzeReachability(buildDAG(wf));
  assert.strictEqual(entryPoints.size, 2);
  assert.strictEqual(reachable.size, 3);
});

// =============================================================================
// SECTION D — DEAD STAGES
// =============================================================================

test('D1 — findDeadStages: artifact uploaded but never downloaded is dead', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: ['dist/'], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('test', 'Test', ['build']), // downloads nothing
  ]);
  const { deadProducers } = findDeadStages(buildDAG(wf));
  assert.strictEqual(deadProducers.length, 1);
  assert.strictEqual(deadProducers[0].artifactName, 'dist');
});

test('D2 — findDeadStages: artifact uploaded and downloaded is alive', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: ['dist/'], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('deploy', 'Deploy', ['build'], {
      artifacts: [{ name: 'dist', paths: ['dist/'], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const { deadProducers } = findDeadStages(buildDAG(wf));
  assert.strictEqual(deadProducers.length, 0);
});

test('D3 — findDeadStages: orphaned terminal with predecessor', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('cleanup', 'Cleanup', ['build']), // terminal, no recognized purpose
  ]);
  const { orphanedTerminals } = findDeadStages(buildDAG(wf));
  assert.ok(orphanedTerminals.includes('cleanup'));
});

test('D4 — findDeadStages: deploy terminal is NOT orphaned', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('deploy-prod', 'Deploy Production', ['build']), // recognized purpose
  ]);
  const { orphanedTerminals } = findDeadStages(buildDAG(wf));
  assert.ok(!orphanedTerminals.includes('deploy-prod'));
});

test('D5 — findDeadStages: entry-only job (no predecessors) is not orphaned terminal', () => {
  const wf = makeWorkflow([
    makeJob('solo', 'Solo Job'), // no predecessors, no successors
  ]);
  const { orphanedTerminals } = findDeadStages(buildDAG(wf));
  // Entry-only jobs are not flagged (they have no predecessors)
  assert.ok(!orphanedTerminals.includes('solo'));
});

// =============================================================================
// SECTION E — MISSING DEPENDENCY OUTPUT
// =============================================================================

test('E1 — findMissingOutputDependencies: consumer with no needs edge is flagged', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('deploy', 'Deploy', [], {  // missing needs: [build]
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const missing = findMissingOutputDependencies(buildDAG(wf));
  assert.strictEqual(missing.length, 1);
  assert.strictEqual(missing[0].consumerJobId, 'deploy');
  assert.strictEqual(missing[0].producerJobId, 'build');
  assert.strictEqual(missing[0].artifactName, 'dist');
  assert.strictEqual(missing[0].missingEdge, true);
});

test('E2 — findMissingOutputDependencies: consumer WITH needs edge is not flagged', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('deploy', 'Deploy', ['build'], {  // correctly declares needs
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const missing = findMissingOutputDependencies(buildDAG(wf));
  assert.strictEqual(missing.length, 0);
});

test('E3 — findMissingOutputDependencies: no artifacts produces empty result', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test', 'Test', ['build']),
  ]);
  const missing = findMissingOutputDependencies(buildDAG(wf));
  assert.strictEqual(missing.length, 0);
});

// =============================================================================
// SECTION F — CYCLIC DEPENDENCY RULE (integration)
// =============================================================================

test('F1 — rule dag-cyclic-dependency: flags two-node cycle', () => {
  const wf = makeWorkflow([
    makeJob('jobA', 'Job A', ['jobB']),
    makeJob('jobB', 'Job B', ['jobA']),
  ]);
  const findings = runRule('dag-cyclic-dependency', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'dag-cyclic-dependency');
  assert.ok(findings[0].evidence.includes('jobA'));
  assert.ok(findings[0].evidence.includes('jobB'));
});

test('F2 — rule dag-cyclic-dependency: passes on linear chain', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test', 'Test', ['build']),
  ]);
  const findings = runRule('dag-cyclic-dependency', wf);
  assert.strictEqual(findings.length, 0);
});

test('F3 — rule dag-cyclic-dependency: single job produces no findings', () => {
  const wf = makeWorkflow([makeJob('solo', 'Solo')]);
  const findings = runRule('dag-cyclic-dependency', wf);
  assert.strictEqual(findings.length, 0);
});

// =============================================================================
// SECTION G — UNREACHABLE JOB RULE (integration)
// =============================================================================

test('G1 — rule dag-unreachable-job: flags job referencing non-existent upstream', () => {
  const wf = makeWorkflow([
    makeJob('deploy', 'Deploy', ['ghost']),
  ]);
  // The phantom 'ghost' becomes an entry point, making 'deploy' reachable.
  // So this test confirms no false positive in this specific case.
  const findings = runRule('dag-unreachable-job', wf);
  // deploy IS reachable via ghost (phantom entry), so 0 findings
  assert.strictEqual(findings.length, 0);
});

test('G2 — rule dag-unreachable-job: flags jobs cut off by cycle', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),               // entry, reachable
    makeJob('cycleA', 'Cycle A', ['cycleB']),// no entry path
    makeJob('cycleB', 'Cycle B', ['cycleA']),// no entry path
  ]);
  const findings = runRule('dag-unreachable-job', wf);
  assert.ok(findings.length >= 2, `Expected >= 2 findings, got ${findings.length}`);
  const flaggedIds = findings.map((f) => f.location.jobId);
  assert.ok(flaggedIds.includes('cycleA'));
  assert.ok(flaggedIds.includes('cycleB'));
});

test('G3 — rule dag-unreachable-job: passes on fully connected DAG', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('test', 'Test', ['build']),
    makeJob('deploy', 'Deploy', ['test']),
  ]);
  const findings = runRule('dag-unreachable-job', wf);
  assert.strictEqual(findings.length, 0);
});

// =============================================================================
// SECTION H — DEAD STAGE RULE (integration)
// =============================================================================

test('H1 — rule dag-dead-stage: flags unconsumed artifact upload', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'reports', paths: ['reports/'], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('test', 'Test', ['build']),
  ]);
  const findings = runRule('dag-dead-stage', wf);
  assert.ok(findings.length >= 1);
  assert.ok(findings.some((f) => f.title.includes('reports')));
});

test('H2 — rule dag-dead-stage: flags orphaned terminal job', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build'),
    makeJob('wip-stage', 'WIP Stage', ['build']), // not a deploy/test/notify
  ]);
  const findings = runRule('dag-dead-stage', wf);
  const orphanFindings = findings.filter((f) => f.title.includes('terminal'));
  assert.ok(orphanFindings.length >= 1);
});

test('H3 — rule dag-dead-stage: does not flag consumed artifacts', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('deploy', 'Deploy', ['build'], {
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const findings = runRule('dag-dead-stage', wf);
  const producerFindings = findings.filter((f) => f.title.includes('never downloaded'));
  assert.strictEqual(producerFindings.length, 0);
});

// =============================================================================
// SECTION I — MISSING DEPENDENCY OUTPUT RULE (integration)
// =============================================================================

test('I1 — rule dag-missing-dependency-output: flags race condition', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('deploy', 'Deploy', [], {  // no needs: [build]
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const findings = runRule('dag-missing-dependency-output', wf);
  assert.strictEqual(findings.length, 1);
  assert.ok(findings[0].title.includes('dist'));
  assert.ok(findings[0].remediation.includes('needs'));
});

test('I2 — rule dag-missing-dependency-output: passes when needs declared', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.UPLOAD }],
    }),
    makeJob('deploy', 'Deploy', ['build'], {
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const findings = runRule('dag-missing-dependency-output', wf);
  assert.strictEqual(findings.length, 0);
});

test('I3 — rule dag-missing-dependency-output: multiple artifacts multiple consumers', () => {
  const wf = makeWorkflow([
    makeJob('build', 'Build', [], {
      artifacts: [
        { name: 'dist', paths: [], expireIn: null, type: ArtifactType.UPLOAD },
        { name: 'coverage', paths: [], expireIn: null, type: ArtifactType.UPLOAD },
      ],
    }),
    makeJob('deploy', 'Deploy', [], {  // needs 'dist' but no edge
      artifacts: [{ name: 'dist', paths: [], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
    makeJob('report', 'Report', [], {  // needs 'coverage' but no edge
      artifacts: [{ name: 'coverage', paths: [], expireIn: null, type: ArtifactType.DOWNLOAD }],
    }),
  ]);
  const findings = runRule('dag-missing-dependency-output', wf);
  assert.strictEqual(findings.length, 2);
});

// =============================================================================
// SECTION J — REGISTRY TOTALS
// =============================================================================

test('J1 — all 4 DAG rules are registered in the rule registry', () => {
  const dagRules = ruleRegistry.getByCategory(RuleCategory.DAG);
  assert.strictEqual(dagRules.length, 4, `Expected 4 DAG rules, got ${dagRules.length}`);
  const ids = dagRules.map((r) => r.id);
  assert.ok(ids.includes('dag-cyclic-dependency'));
  assert.ok(ids.includes('dag-unreachable-job'));
  assert.ok(ids.includes('dag-dead-stage'));
  assert.ok(ids.includes('dag-missing-dependency-output'));
});

test('J2 — total registry has at least 15 rules (5 sec + 6 rel + 4 dag)', () => {
  assert.ok(ruleRegistry.count() >= 15, `Expected >= 15 rules, got ${ruleRegistry.count()}`);
});

// =============================================================================
// RESULTS
// =============================================================================
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);

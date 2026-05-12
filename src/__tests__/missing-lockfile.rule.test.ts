/**
 * @file missing-lockfile.rule.test.ts
 * Run with: npx ts-node src/__tests__/missing-lockfile.rule.test.ts
 */

import assert from 'assert';
import { RuleSeverity, RuleCategory } from '../rules/types';
import type { DependencyGraph } from '../engine/dependency-graph';

// =============================================================================
// MANUAL MOCK — replace DependencyGraphBuilder before the rule imports
// =============================================================================

let _mockGraph: DependencyGraph = {
  packages: [], lockfilesFound: [], manifestsFound: [], missingLockfiles: [],
  ecosystems: new Set(), parseErrors: [],
};
let _buildShouldThrow = false;

// Override module via require cache patching
const depGraphMod = require('../engine/dependency-graph');
depGraphMod.DependencyGraphBuilder = class {
  async build(): Promise<DependencyGraph> {
    if (_buildShouldThrow) throw new Error('ENOENT');
    return _mockGraph;
  }
};

// Now import the rule (which will use the patched DependencyGraphBuilder)
import { MissingLockfileRule } from '../rules/dependencies/missing-lockfile.rule';

// =============================================================================
// HELPERS
// =============================================================================

function makeCtx(): any {
  return {
    repoId: 'r1', scanId: 's1', filePath: '/repo/.github/workflows/ci.yml',
    ciSystem: 'github-actions', config: { severityOverrides: {}, disabledRules: [], customThresholds: {}, ignorePaths: [] },
    allWorkflows: [], repoMetadata: { name: 'test', provider: 'github', defaultBranch: 'main', isMonorepo: false },
    repoRoot: '/repo',
  };
}

function makeWf(): any {
  return { id: 'wf1', source: 'GITHUB_ACTIONS', sourceFile: '/repo/.github/workflows/ci.yml', repoId: 'r1', parsedAt: new Date(), jobs: [], triggers: [], globalEnv: [], globalSecrets: [], permissions: [], metadata: { name: 'CI', description: null, totalJobs: 0, totalSteps: 0, hasDockerImages: false, hasSecrets: false, hasExternalActions: false, ciSystem: 'github-actions' } };
}

// =============================================================================
// TEST RUNNER
// =============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(() => {
    console.log(`  PASS  ${name}`);
    passed++;
  }).catch((e: Error) => {
    console.error(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  });
}

// =============================================================================
// TESTS
// =============================================================================

console.log('\nRunning MissingLockfileRule Tests...\n');

async function runAll(): Promise<void> {
  const rule = new MissingLockfileRule();

  await test('T1 — emits one finding per missing lockfile', async () => {
    _buildShouldThrow = false;
    _mockGraph = { packages: [], lockfilesFound: [], manifestsFound: ['package.json'], missingLockfiles: ['package.json'], ecosystems: new Set(), parseErrors: [] };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]!.ruleId, 'dependency-missing-lockfile');
    assert.strictEqual(findings[0]!.category, RuleCategory.DEPENDENCY);
  });

  await test('T2 — HIGH severity for npm missing lockfile', async () => {
    _mockGraph = { packages: [], lockfilesFound: [], manifestsFound: ['package.json'], missingLockfiles: ['package.json'], ecosystems: new Set(), parseErrors: [] };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings[0]!.severity, RuleSeverity.HIGH);
  });

  await test('T3 — MEDIUM severity for pip missing lockfile', async () => {
    _mockGraph = { packages: [], lockfilesFound: [], manifestsFound: ['requirements.txt'], missingLockfiles: ['requirements.txt'], ecosystems: new Set(), parseErrors: [] };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings[0]!.severity, RuleSeverity.MEDIUM);
  });

  await test('T4 — no findings when all lock files present', async () => {
    _mockGraph = { packages: [], lockfilesFound: ['package-lock.json'], manifestsFound: ['package.json'], missingLockfiles: [], ecosystems: new Set(), parseErrors: [] };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('T5 — returns [] when builder.build throws', async () => {
    _buildShouldThrow = true;
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
    _buildShouldThrow = false;
  });

  await test('T6 — two missing lockfiles produces two findings', async () => {
    _mockGraph = { packages: [], lockfilesFound: [], manifestsFound: ['package.json', 'requirements.txt'], missingLockfiles: ['package.json', 'requirements.txt'], ecosystems: new Set(), parseErrors: [] };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 2);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed > 0) process.exit(1);
}

runAll().catch((e) => { console.error(e); process.exit(1); });

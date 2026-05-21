/**
 * @file version-conflict.rule.test.ts
 * Run with: npx ts-node src/__tests__/version-conflict.rule.test.ts
 */

import assert from 'assert';
import { RuleSeverity } from '../rules/types';
import type { DependencyGraph, ParsedPackage } from '../engine/dependency-graph';

// =============================================================================
// MOCK
// =============================================================================

let _mockGraph: DependencyGraph = {
  packages: [], lockfilesFound: [], manifestsFound: [], missingLockfiles: [],
  ecosystems: new Set(), parseErrors: [],
};

const depGraphMod = require('../engine/dependency-graph');
depGraphMod.DependencyGraphBuilder = class {
  async build(): Promise<DependencyGraph> {
    return _mockGraph;
  }
};

import { VersionConflictRule } from '../rules/dependencies/version-conflict.rule';

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

function makeWf(jobs: any[] = []): any {
  return { id: 'wf1', source: 'GITHUB_ACTIONS', sourceFile: '/repo/.github/workflows/ci.yml', repoId: 'r1', parsedAt: new Date(), jobs, triggers: [], globalEnv: [], globalSecrets: [], permissions: [], metadata: { name: 'CI', description: null, totalJobs: 0, totalSteps: 0, hasDockerImages: false, hasSecrets: false, hasExternalActions: false, ciSystem: 'github-actions' } };
}

function makePkg(name: string, version: string, ecosystem = 'npm', lockfile = 'package-lock.json'): ParsedPackage {
  return { name, version, requestedVersion: version, ecosystem: ecosystem as any, isDev: false, lockfile };
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

console.log('\nRunning VersionConflictRule Tests...\n');

async function runAll(): Promise<void> {
  const rule = new VersionConflictRule();

  // ── Type A ────────────────────────────────────────────────────────────────

  await test('A1 — flags same package with two different resolved versions', async () => {
    _mockGraph = {
      packages: [
        makePkg('lodash', '3.10.1', 'npm', 'package-lock.json'),
        makePkg('lodash', '4.17.21', 'npm', 'yarn.lock'),
      ],
      lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [],
    };
    const findings = await rule.check(makeWf(), makeCtx());
    const conflict = findings.filter((f) => f.title.includes('lodash'));
    assert.ok(conflict.length >= 1, `Expected conflict finding, got ${conflict.length}`);
    assert.strictEqual(conflict[0]!.severity, RuleSeverity.HIGH);
    const versions = conflict[0]!.metadata?.['conflictingVersions'] as string[];
    assert.ok(versions.includes('3.10.1'));
    assert.ok(versions.includes('4.17.21'));
  });

  await test('A2 — same package same version → no conflict finding', async () => {
    _mockGraph = {
      packages: [
        makePkg('lodash', '4.17.21', 'npm', 'package-lock.json'),
        makePkg('lodash', '4.17.21', 'npm', 'yarn.lock'),
      ],
      lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [],
    };
    const findings = await rule.check(makeWf(), makeCtx());
    const conflict = findings.filter((f) => f.title.includes('Version conflict'));
    assert.strictEqual(conflict.length, 0);
  });

  await test('A3 — different ecosystems same name → no conflict', async () => {
    _mockGraph = {
      packages: [
        makePkg('requests', '2.28.0', 'pypi', 'requirements.txt'),
        makePkg('requests', '1.0.0', 'npm', 'package-lock.json'),
      ],
      lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(), parseErrors: [],
    };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('A4 — three distinct versions for same package → one conflict finding', async () => {
    _mockGraph = {
      packages: [
        makePkg('chalk', '2.0.0', 'npm', 'package-lock.json'),
        makePkg('chalk', '4.0.0', 'npm', 'package-lock.json'),
        makePkg('chalk', '5.0.0', 'npm', 'yarn.lock'),
      ],
      lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [],
    };
    const findings = await rule.check(makeWf(), makeCtx());
    const conflict = findings.filter((f) => f.title.includes('chalk'));
    assert.strictEqual(conflict.length, 1); // One finding per conflicting package
    const versions = conflict[0]!.metadata?.['conflictingVersions'] as string[];
    assert.strictEqual(versions.length, 3);
  });

  await test('A5 — empty packages produces no findings', async () => {
    _mockGraph = { packages: [], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(), parseErrors: [] };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed > 0) process.exit(1);
}

runAll().catch((e) => { console.error(e); process.exit(1); });

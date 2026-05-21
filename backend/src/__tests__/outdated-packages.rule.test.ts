/**
 * @file outdated-packages.rule.test.ts
 * Run with: npx ts-node src/__tests__/outdated-packages.rule.test.ts
 */

import assert from 'assert';
import type { DependencyGraph, ParsedPackage } from '../engine/dependency-graph';
import { HttpTimeoutError } from '../engine/http-client';


// =============================================================================
// MOCKS — must be before rule import
// =============================================================================

let _mockGraph: DependencyGraph = {
  packages: [], lockfilesFound: [], manifestsFound: [], missingLockfiles: [],
  ecosystems: new Set(), parseErrors: [],
};

const depGraphMod = require('../engine/dependency-graph');
depGraphMod.DependencyGraphBuilder = class {
  async build(): Promise<DependencyGraph> { return _mockGraph; }
};

type FetchStub = (url: string, options?: any) => Promise<{ ok: boolean; json: () => Promise<any> }>;
let _fetchStub: FetchStub = async () => ({ ok: true, json: async () => ({}) });

const httpMod = require('../engine/http-client');
httpMod.fetchWithTimeout = async (url: string, options?: any) => _fetchStub(url, options);

import { OutdatedPackagesRule, clearRegistryCache } from '../rules/dependencies/outdated-packages.rule';


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

function makePkg(name: string, version: string, isDev = false, ecosystem = 'npm'): ParsedPackage {
  return { name, version, requestedVersion: version, ecosystem: ecosystem as any, isDev, lockfile: 'package-lock.json' };
}

function mockNpmResponse(latestVersion: string): FetchStub {
  return async () => ({ ok: true, json: async () => ({ version: latestVersion }) });
}

// =============================================================================
// TEST RUNNER
// =============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void>): Promise<void> {
  clearRegistryCache(); // reset module-level cache between tests
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

console.log('\nRunning OutdatedPackagesRule Tests...\n');

async function runAll(): Promise<void> {
  const rule = new OutdatedPackagesRule();

  await test('T1 — emits finding for package 2+ major versions behind', async () => {
    _mockGraph = { packages: [makePkg('lodash', '2.0.0')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _fetchStub = mockNpmResponse('5.0.0'); // 3 majors ahead
    const findings = await rule.check(makeWf(), makeCtx());
    assert.ok(findings.length >= 1, `Expected >= 1 finding, got ${findings.length}`);
    assert.ok(findings[0]!.title.includes('lodash'));
    assert.strictEqual(findings[0]!.metadata?.['currentVersion'], '2.0.0');
    assert.strictEqual(findings[0]!.metadata?.['latestVersion'], '5.0.0');
  });

  await test('T2 — no finding when only 1 minor version behind', async () => {
    _mockGraph = { packages: [makePkg('express', '4.17.0')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _fetchStub = mockNpmResponse('4.18.2');
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('T3 — no finding when only 1 major version behind (threshold is 2)', async () => {
    _mockGraph = { packages: [makePkg('react', '17.0.2')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _fetchStub = mockNpmResponse('18.2.0');
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('T4 — skips dev dependencies (no fetch call for dev pkgs)', async () => {
    _mockGraph = { packages: [makePkg('jest', '26.0.0', true /* isDev */)], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    let fetchCalled = false;
    _fetchStub = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
    assert.strictEqual(fetchCalled, false, 'Should not fetch for dev dependencies');
  });

  await test('T5 — timeout produces no finding (graceful skip)', async () => {
    _mockGraph = { packages: [makePkg('lodash', '1.0.0')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _fetchStub = async () => { throw new HttpTimeoutError('https://registry.npmjs.org/lodash/latest', 5000); };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('T6 — skips packages with unknown version', async () => {
    _mockGraph = { packages: [{ name: 'mylib', version: 'unknown', requestedVersion: '*', ecosystem: 'npm' as any, isDev: false, lockfile: 'package-lock.json' }], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    let fetchCalled = false;
    _fetchStub = async () => { fetchCalled = true; return { ok: true, json: async () => ({}) }; };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
    assert.strictEqual(fetchCalled, false, 'Should not fetch for unknown version packages');
  });

  await test('T7 — exactly 2 major versions behind emits a finding', async () => {
    _mockGraph = { packages: [makePkg('mylib', '1.0.0')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _fetchStub = mockNpmResponse('3.0.0'); // exactly 2 majors ahead
    const findings = await rule.check(makeWf(), makeCtx());
    assert.ok(findings.length >= 1, 'Exactly 2 major versions behind should trigger finding');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed > 0) process.exit(1);
}

runAll().catch((e) => { console.error(e); process.exit(1); });

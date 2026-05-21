/**
 * @file vulnerable-package.rule.test.ts
 * Run with: npx ts-node src/__tests__/vulnerable-package.rule.test.ts
 */

import assert from 'assert';
import { RuleSeverity } from '../rules/types';
import type { DependencyGraph, ParsedPackage } from '../engine/dependency-graph';
import { HttpTimeoutError, HttpError } from '../engine/http-client';

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

type PostStub = (url: string, body: unknown, options?: any) => Promise<{ ok: boolean; json: () => Promise<any> }>;
let _postStub: PostStub = async () => ({ ok: true, json: async () => ({ results: [] }) });

const httpMod = require('../engine/http-client');
httpMod.postWithTimeout = async (url: string, body: unknown, options?: any) => _postStub(url, body, options);

import { VulnerablePackageRule } from '../rules/dependencies/vulnerable-package.rule';

// =============================================================================
// OSV FIXTURE VULNERABILITIES
// =============================================================================

const VULN_CVSS_91 = {
  id: 'GHSA-xxxx-yyyy-zzzz',
  summary: 'Critical RCE in lodash',
  severity: [{ type: 'CVSS_V3', score: '9.1' }],
  affected: [{ ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }],
  references: [{ type: 'WEB', url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz' }],
};

const VULN_CVSS_53 = {
  id: 'GHSA-aaaa-bbbb-cccc',
  summary: 'Moderate DoS in express',
  severity: [{ type: 'CVSS_V3', score: '5.3' }],
  affected: [{ ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.19.0' }] }] }],
  references: [],
};

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

function makePkg(name: string, version: string, ecosystem = 'npm'): ParsedPackage {
  return { name, version, requestedVersion: version, ecosystem: ecosystem as any, isDev: false, lockfile: 'package-lock.json' };
}

function mockOsvResponse(vulns: any[]): PostStub {
  return async () => ({ ok: true, json: async () => ({ results: [{ vulns }] }) });
}

function mockOsvEmpty(): PostStub {
  return async () => ({ ok: true, json: async () => ({ results: [{}] }) });
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

console.log('\nRunning VulnerablePackageRule Tests...\n');

async function runAll(): Promise<void> {
  const rule = new VulnerablePackageRule();

  await test('T1 — CRITICAL finding for CVSS 9.1', async () => {
    _mockGraph = { packages: [makePkg('lodash', '4.17.20')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _postStub = mockOsvResponse([VULN_CVSS_91]);
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]!.severity, RuleSeverity.CRITICAL);
    assert.strictEqual(findings[0]!.metadata?.['cveId'], 'GHSA-xxxx-yyyy-zzzz');
    assert.strictEqual(findings[0]!.metadata?.['cvssScore'], 9.1);
  });

  await test('T2 — HIGH finding for CVSS 5.3', async () => {
    _mockGraph = { packages: [makePkg('express', '4.18.0')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _postStub = mockOsvResponse([VULN_CVSS_53]);
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0]!.severity, RuleSeverity.HIGH);
  });

  await test('T3 — fixedVersion extracted from affected[].ranges events', async () => {
    _mockGraph = { packages: [makePkg('lodash', '4.17.20')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _postStub = mockOsvResponse([VULN_CVSS_91]);
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings[0]!.metadata?.['fixedVersion'], '4.17.21');
    assert.ok(findings[0]!.remediation.includes('4.17.21'));
  });

  await test('T4 — one finding per vuln when package has multiple CVEs', async () => {
    _mockGraph = { packages: [makePkg('lodash', '4.17.0')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _postStub = async () => ({ ok: true, json: async () => ({ results: [{ vulns: [VULN_CVSS_91, VULN_CVSS_53] }] }) });
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 2);
  });

  await test('T5 — empty OSV result (no vulns) → no finding', async () => {
    _mockGraph = { packages: [makePkg('lodash', '4.17.21')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _postStub = mockOsvEmpty();
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('T6 — OSV network error → no findings, no throw', async () => {
    _mockGraph = { packages: [makePkg('lodash', '4.17.20')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _postStub = async () => { throw new HttpError('https://api.osv.dev/v1/querybatch', 503); };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('T7 — OSV timeout → no findings, no throw', async () => {
    _mockGraph = { packages: [makePkg('lodash', '4.17.20')], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(['npm' as any]), parseErrors: [] };
    _postStub = async () => { throw new HttpTimeoutError('https://api.osv.dev/v1/querybatch', 10000); };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
  });

  await test('T8 — empty packages → no findings, no POST call', async () => {
    _mockGraph = { packages: [], lockfilesFound: [], manifestsFound: [], missingLockfiles: [], ecosystems: new Set(), parseErrors: [] };
    let postCalled = false;
    _postStub = async () => { postCalled = true; return { ok: true, json: async () => ({}) }; };
    const findings = await rule.check(makeWf(), makeCtx());
    assert.strictEqual(findings.length, 0);
    assert.strictEqual(postCalled, false, 'Should not call OSV API with no packages');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed > 0) process.exit(1);
}

runAll().catch((e) => { console.error(e); process.exit(1); });

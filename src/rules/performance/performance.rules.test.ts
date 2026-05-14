import * as assert from 'assert';
import { RedundantInstallRule, MissingCacheRule, SequentialBottleneckRule } from './index';
import { NormalizedWorkflow, Job as NormalizedJob } from '../../models/workflow.model';
import { RuleContext, RuleSeverity } from '../types';

function buildMockWorkflow(jobs: NormalizedJob[]): NormalizedWorkflow {
  return {
    id: 'wf1',
    metadata: { name: 'wf1' } as any,
    sourceFile: 'ci.yml',
    globalEnv: [],
    jobs
  } as unknown as NormalizedWorkflow;
}

function buildMockContext(overrides?: Partial<RuleContext>): RuleContext {
  return {
    repoId: 'repo1',
    scanId: 'scan1',
    filePath: 'ci.yml',
    ciSystem: 'github-actions',
    config: { severityOverrides: {}, disabledRules: [], customThresholds: {}, ignorePaths: [] },
    allWorkflows: [],
    repoMetadata: { name: 'test', provider: 'github', defaultBranch: 'main', isMonorepo: false },
    ...overrides
  };
}

async function runTests() {
  const redundantRule = new RedundantInstallRule();
  const cacheRule = new MissingCacheRule();
  const seqRule = new SequentialBottleneckRule();
  const context = buildMockContext();

  console.log("TEST 1 - redundant-install detects npm ci in 3 jobs without cache");
  const w1 = buildMockWorkflow([
    { id: 'j1', name: 'j1', steps: [{ id: 's1', run: 'npm ci' }] } as unknown as NormalizedJob,
    { id: 'j2', name: 'j2', steps: [{ id: 's2', run: 'npm ci' }] } as unknown as NormalizedJob,
    { id: 'j3', name: 'j3', steps: [{ id: 's3', run: 'npm ci' }] } as unknown as NormalizedJob
  ]);
  let findings = await redundantRule.check(w1, context);
  assert.ok(findings.length >= 1, "Findings should have at least 1");
  assert.strictEqual(findings[0].ruleId, 'performance-redundant-install');
  assert.strictEqual((findings[0].metadata.affectedJobs as string[]).length, 3);

  console.log("TEST 2 - redundant-install passes when only 1 job installs");
  const w2 = buildMockWorkflow([
    { id: 'j1', name: 'j1', steps: [{ id: 's1', run: 'npm ci' }] } as unknown as NormalizedJob
  ]);
  findings = await redundantRule.check(w2, context);
  assert.strictEqual(findings.length, 0);

  console.log("TEST 3 - redundant-install passes when cache is configured");
  const w3 = buildMockWorkflow([
    { id: 'j1', name: 'j1', steps: [{ id: 's1', run: 'npm ci' }, { id: 's2', uses: 'actions/cache@v3' }] } as unknown as NormalizedJob,
    { id: 'j2', name: 'j2', steps: [{ id: 's3', run: 'npm ci' }, { id: 's4', uses: 'actions/cache@v3' }] } as unknown as NormalizedJob
  ]);
  findings = await redundantRule.check(w3, context);
  assert.strictEqual(findings.length, 0);

  console.log("TEST 4 - missing-cache detects npm ci without cache");
  const w4 = buildMockWorkflow([
    { id: 'j1', name: 'j1', steps: [{ id: 's1', run: 'npm ci' }, { id: 's2', run: 'npm test' }] } as unknown as NormalizedJob
  ]);
  findings = await cacheRule.check(w4, context);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'performance-missing-cache');

  console.log("TEST 5 - missing-cache passes when actions/cache present");
  const w5 = buildMockWorkflow([
    { id: 'j1', name: 'j1', steps: [{ id: 's0', uses: 'actions/cache@v3' }, { id: 's1', run: 'npm ci' }] } as unknown as NormalizedJob
  ]);
  findings = await cacheRule.check(w5, context);
  assert.strictEqual(findings.find(f => f.metadata.operation === 'npm dependencies'), undefined);

  console.log("TEST 6 - missing-cache detects docker build without layer cache");
  const w6 = buildMockWorkflow([
    { id: 'j1', name: 'j1', steps: [{ id: 's1', uses: 'docker/build-push-action@v4', with: {} }] } as unknown as NormalizedJob
  ]);
  findings = await cacheRule.check(w6, context);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.LOW);
  assert.strictEqual(findings[0].metadata.operation, 'Docker layer cache');

  console.log("TEST 7 - missing-cache detects pip install without cache");
  const w7 = buildMockWorkflow([
    { id: 'j1', name: 'j1', steps: [{ id: 's1', run: 'pip install -r requirements.txt' }] } as unknown as NormalizedJob
  ]);
  findings = await cacheRule.check(w7, context);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].metadata.operation, 'pip packages');

  console.log("TEST 8 - sequential-bottleneck detects false dependency");
  const w8 = buildMockWorkflow([
    { id: 'j1', name: 'jobA', steps: [] } as unknown as NormalizedJob,
    { id: 'j2', name: 'jobB', needs: [{ jobId: 'j1', outputs: [] }], steps: [{ id: 's1', run: 'echo hello' }] } as unknown as NormalizedJob
  ]);
  findings = await seqRule.check(w8, context);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'performance-sequential-bottleneck');

  console.log("TEST 9 - sequential-bottleneck passes when outputs are consumed");
  const w9 = buildMockWorkflow([
    { id: 'j1', name: 'jobA', steps: [] } as unknown as NormalizedJob,
    { id: 'j2', name: 'jobB', needs: [{ jobId: 'j1', outputs: [] }], steps: [{ id: 's1', run: 'echo ${{ needs.j1.outputs.artifact }}' }] } as unknown as NormalizedJob
  ]);
  findings = await seqRule.check(w9, context);
  assert.strictEqual(findings.length, 0);

  console.log("TEST 10 - sequential-bottleneck detects deep critical path");
  const w10 = buildMockWorkflow([
    { id: 'A', name: 'A', steps: [] } as unknown as NormalizedJob,
    { id: 'B', name: 'B', needs: [{ jobId: 'A', outputs: [] }], steps: [{ id: 's1', run: 'echo ${{ needs.A.outputs.o }}' }] } as unknown as NormalizedJob,
    { id: 'C', name: 'C', needs: [{ jobId: 'B', outputs: [] }], steps: [{ id: 's1', run: 'echo ${{ needs.B.outputs.o }}' }] } as unknown as NormalizedJob,
    { id: 'D', name: 'D', needs: [{ jobId: 'C', outputs: [] }], steps: [{ id: 's1', run: 'echo ${{ needs.C.outputs.o }}' }] } as unknown as NormalizedJob,
    { id: 'E', name: 'E', needs: [{ jobId: 'D', outputs: [] }], steps: [{ id: 's1', run: 'echo ${{ needs.D.outputs.o }}' }] } as unknown as NormalizedJob,
    { id: 'F', name: 'F', needs: [{ jobId: 'E', outputs: [] }], steps: [{ id: 's1', run: 'echo ${{ needs.E.outputs.o }}' }] } as unknown as NormalizedJob,
    { id: 'G', name: 'G', needs: [{ jobId: 'F', outputs: [] }], steps: [{ id: 's1', run: 'echo ${{ needs.F.outputs.o }}' }] } as unknown as NormalizedJob
  ]);
  findings = await seqRule.check(w10, context);
  const cpFinding = findings.find(f => f.metadata.criticalPathLength !== undefined);
  assert.ok(cpFinding);
  assert.ok((cpFinding.metadata.criticalPathLength as number) >= 6);

  console.log("PASS");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

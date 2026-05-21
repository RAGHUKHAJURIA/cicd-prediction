import * as assert from 'assert';
import { DuplicatedWorkflowRule, MonolithicPipelineRule } from './index';
import { NormalizedWorkflow, Job as NormalizedJob } from '../../models/workflow.model';
import { RuleContext, RuleSeverity } from '../types';

function buildMockWorkflow(sourceFile: string, jobs: NormalizedJob[]): NormalizedWorkflow {
  return {
    id: sourceFile,
    metadata: { name: sourceFile } as any,
    sourceFile,
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
  const dupRule = new DuplicatedWorkflowRule();
  const monoRule = new MonolithicPipelineRule();

  console.log("TEST 1 - duplicated-workflow detects 80% similar workflows");
  const w1 = buildMockWorkflow('w1.yml', [
    { id: 'j1', name: 'j1', steps: [{ id: 's1', run: 'cmd1' }] } as NormalizedJob,
    { id: 'j2', name: 'j2', steps: [{ id: 's2', run: 'cmd2' }] } as NormalizedJob,
    { id: 'j3', name: 'j3', steps: [{ id: 's3', run: 'cmd3' }] } as NormalizedJob,
    { id: 'j4', name: 'j4', steps: [{ id: 's4', run: 'cmd4' }] } as NormalizedJob,
    { id: 'j5', name: 'j5', steps: [{ id: 's5', run: 'cmd5' }] } as NormalizedJob
  ]);
  const w2 = buildMockWorkflow('w2.yml', [
    { id: 'j1', name: 'j1', steps: [{ id: 's1', run: 'cmd1' }] } as NormalizedJob,
    { id: 'j2', name: 'j2', steps: [{ id: 's2', run: 'cmd2' }] } as NormalizedJob,
    { id: 'j3', name: 'j3', steps: [{ id: 's3', run: 'cmd3' }] } as NormalizedJob,
    { id: 'j4', name: 'j4', steps: [{ id: 's4', run: 'cmd4' }] } as NormalizedJob,
    { id: 'j6', name: 'j6', steps: [{ id: 's6', run: 'cmd6' }] } as NormalizedJob
  ]);
  let ctx = buildMockContext({ allWorkflows: [w1, w2], filePath: 'w1.yml' });
  let findings = await dupRule.check(w1, ctx);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'maintainability-duplicated-workflow');
  assert.ok((findings[0].metadata.similarity as number) >= 0.8);

  console.log("TEST 2 - duplicated-workflow passes for clearly different workflows");
  const w3 = buildMockWorkflow('w3.yml', [
    { id: 'j1', name: 'build', steps: [{ id: 's1', run: 'build' }] } as NormalizedJob
  ]);
  const w4 = buildMockWorkflow('w4.yml', [
    { id: 'j2', name: 'deploy', steps: [{ id: 's2', run: 'deploy' }] } as NormalizedJob
  ]);
  ctx = buildMockContext({ allWorkflows: [w3, w4], filePath: 'w3.yml' });
  findings = await dupRule.check(w3, ctx);
  assert.strictEqual(findings.length, 0);

  console.log("TEST 3 - duplicated-workflow detects duplicate jobs within workflow");
  const w5 = buildMockWorkflow('w5.yml', [
    { id: 'j1', name: 'jobA', steps: [{ id: 's1', run: 'echo 1' }, { id: 's2', run: 'echo 2' }] } as NormalizedJob,
    { id: 'j2', name: 'jobB', steps: [{ id: 's1', run: 'echo 1' }, { id: 's2', run: 'echo 2' }] } as NormalizedJob
  ]);
  ctx = buildMockContext({ allWorkflows: [w5], filePath: 'w5.yml' });
  findings = await dupRule.check(w5, ctx);
  assert.ok(findings.find(f => f.title.includes('identical')));

  console.log("TEST 4 - duplicated-workflow detects repeated env vars");
  const w6 = buildMockWorkflow('w6.yml', [
    { id: 'j1', name: 'j1', env: { 'NODE_ENV': 'production' }, steps: [] } as unknown as NormalizedJob,
    { id: 'j2', name: 'j2', env: { 'NODE_ENV': 'production' }, steps: [] } as unknown as NormalizedJob,
    { id: 'j3', name: 'j3', env: { 'NODE_ENV': 'production' }, steps: [] } as unknown as NormalizedJob
  ]);
  findings = await dupRule.check(w6, ctx);
  assert.ok(findings.find(f => f.title.includes('NODE_ENV')));

  console.log("TEST 5 - monolithic-pipeline flags 25 jobs");
  const jobs25 = Array.from({ length: 25 }, (_, i) => ({ id: `j${i}`, name: `j${i}`, steps: [] } as unknown as NormalizedJob));
  const w7 = buildMockWorkflow('w7.yml', jobs25);
  findings = await monoRule.check(w7, ctx);
  const jFinding = findings.find(f => f.ruleId === 'maintainability-monolithic-pipeline' && f.title.includes('jobs'));
  assert.ok(jFinding);
  assert.strictEqual(jFinding.severity, RuleSeverity.LOW);

  console.log("TEST 6 - monolithic-pipeline passes with 15 jobs");
  const jobs15 = Array.from({ length: 15 }, (_, i) => ({ id: `j${i}`, name: `test${i}`, steps: [] } as unknown as NormalizedJob));
  const w8 = buildMockWorkflow('w8.yml', jobs15);
  findings = await monoRule.check(w8, ctx);
  assert.strictEqual(findings.find(f => f.title.includes('jobs — consider')), undefined);

  console.log("TEST 7 - monolithic-pipeline flags job with 60 steps");
  const steps60 = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, run: 'echo' }));
  const w9 = buildMockWorkflow('w9.yml', [{ id: 'j1', name: 'j1', steps: steps60 } as unknown as NormalizedJob]);
  findings = await monoRule.check(w9, ctx);
  assert.ok(findings.find(f => f.title.includes('steps — consider')));

  console.log("TEST 8 - monolithic-pipeline flags pipeline with no test stage");
  const w10 = buildMockWorkflow('w10.yml', [
    { id: 'j1', name: 'build', steps: [] } as unknown as NormalizedJob,
    { id: 'j2', name: 'package', steps: [] } as unknown as NormalizedJob,
    { id: 'j3', name: 'deploy', steps: [] } as unknown as NormalizedJob
  ]);
  findings = await monoRule.check(w10, ctx);
  assert.ok(findings.find(f => f.title.includes('no identifiable test stage')));

  console.log("TEST 9 - monolithic-pipeline flags deploy without security scan");
  assert.ok(findings.find(f => f.title.includes('deploys without security scanning')));

  console.log("TEST 10 - monolithic-pipeline passes with test + security jobs");
  const w11 = buildMockWorkflow('w11.yml', [
    { id: 'j1', name: 'build', steps: [] } as unknown as NormalizedJob,
    { id: 'j2', name: 'test', steps: [] } as unknown as NormalizedJob,
    { id: 'j3', name: 'trivy-scan', steps: [] } as unknown as NormalizedJob,
    { id: 'j4', name: 'deploy', steps: [] } as unknown as NormalizedJob
  ]);
  findings = await monoRule.check(w11, ctx);
  assert.strictEqual(findings.find(f => f.title.includes('no identifiable test stage')), undefined);
  assert.strictEqual(findings.find(f => f.title.includes('deploys without security scanning')), undefined);

  console.log("PASS");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

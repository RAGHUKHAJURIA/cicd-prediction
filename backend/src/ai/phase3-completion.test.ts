import assert from 'assert';
import { 
  tokenCounter, geminiClient, explanationEngine, failurePredictor, 
  patchBuilder, remediationGenerator, guardrail, 
  outputValidator, fallbackGenerator, aiOrchestrator, PatchType,
  AITaskType, AIResult, ValidationStatus, RemediationGenerator,
  ExplanationEngine, FailurePredictor, AIOrchestrator, AIPatchResult
} from './index';
import { aiRoutes } from '../routes/ai.routes';
import { AIFinding, AIContext } from '../engine/report-builder';
import { ScanExplanation, FindingExplanation } from './ai-response.types';
import { ClaudeClient } from './claude-client';
import '../rules/reliability/flaky-install.rule';
class MockClaudeClient extends ClaudeClient {
  public callLog: Array<any> = [];
  public mockResponses: Map<AITaskType, unknown> = new Map();

  constructor() {
    super({ enableUsageTracking: false });
  }

  setMockResponse(taskType: AITaskType, response: unknown): void {
    this.mockResponses.set(taskType, response);
  }

  async completeJSON<T>(
    taskType: AITaskType,
    systemPrompt: string,
    userPrompt: string,
    _options?: Record<string, unknown>
  ): Promise<AIResult<T>> {
    this.callLog.push({ taskType, systemPrompt, userPrompt });
    const mockData = this.mockResponses.get(taskType);
    
    return {
      success: true,
      data: mockData as T,
      raw: {
        requestId: 'mock-request-id',
        content: JSON.stringify(mockData),
        inputTokens: 100, outputTokens: 200, totalTokens: 300,
        model: 'mock', stopReason: 'end', latencyMs: 50,
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 }
      }
    };
  }
}

function buildMockAIFinding(overrides?: Partial<AIFinding>): AIFinding {
  return { ruleId: 'rule-id', title: 'title', filePath: 'filePath', evidence: 'evidence', remediation: 'remediation', severity: 'high', category: 'security', ...overrides };
}

function buildMockAIContext(overrides?: Partial<AIContext>): AIContext {
  return { repoId: 'repo-id', scanId: 'scan-id', overallScore: 80, overallGrade: 'B', trend: 'improving', ciSystemsDetected: ['github-actions'], hasSecurityIssues: true, hasReliabilityIssues: false, criticalFindings: [], highFindings: [], mediumFindings: [], lowFindings: [], infoFindings: [], topPatterns: [], remediationPriorities: [], ...overrides } as any;
}

function buildMockScanExplanation(): ScanExplanation {
  return { executiveSummary: 'exe', technicalSummary: 'tech', topRisks: [{ rank: 1, title: 'Risk 1', narrative: 'narr', affectedFiles: [], severity: 'high' }], overallHealthAssessment: 'This pipeline is okay', prioritizedActionPlan: [{ priority: 1, action: 'Fix', reasoning: 'Res', estimatedEffort: 'minutes', ruleIds: [] }] };
}

function buildMockExplanation(): FindingExplanation {
  return { ruleId: 'r', plainEnglishRisk: 'risk', technicalDetail: 'tech', failureScenario: 'fail', businessImpact: 'biz', confidence: 'high' };
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('--- PATCH BUILDER TESTS ---');

  // TEST 1
  assert.strictEqual(patchBuilder.buildPatch('unknown-rule-id', 'evidence', 'file.yml'), null);
  console.log('TEST 1 PASS');

  // TEST 2
  const t2 = patchBuilder.buildPatch('reliability-flaky-install', 'npm install', '.github/workflows/ci.yml');
  assert.ok(t2 !== null);
  assert.ok(t2.before.includes('npm install'));
  assert.ok(t2.after.includes('npm ci'));
  assert.strictEqual(t2.confidence, 'certain');
  assert.strictEqual(t2.patchType, PatchType.REPLACE_VALUE);
  console.log('TEST 2 PASS');

  // TEST 3
  const t3 = patchBuilder.buildPatch('reliability-missing-timeout', 'build', '.github/workflows/ci.yml', { jobName: 'build' });
  assert.ok(t3 !== null);
  assert.ok(t3.after.includes('timeout-minutes'));
  assert.strictEqual(t3.confidence, 'certain');
  console.log('TEST 3 PASS');

  // TEST 4
  const t4 = patchBuilder.buildPatch('security-unpinned-action', 'actions/checkout@v4', '.github/workflows/ci.yml');
  assert.ok(t4 !== null);
  assert.ok(t4.before.includes('actions/checkout@v4'));
  assert.ok(t4.after.includes('actions/checkout@'));
  assert.ok(t4.after.includes('REPLACE_WITH_SHA'));
  assert.strictEqual(t4.confidence, 'manual-review-required');
  console.log('TEST 4 PASS');

  // TEST 5
  const t5patch = patchBuilder.buildPatch('reliability-flaky-install', 'npm install', 'ci.yml');
  const t5 = patchBuilder.buildDiff(t5patch!);
  assert.ok(t5.unified.includes('--- a/ci.yml'));
  assert.ok(t5.unified.includes('+++ b/ci.yml'));
  assert.ok(t5.linesChanged > 0);
  console.log('TEST 5 PASS');

  // TEST 6
  const f1 = buildMockAIFinding({ ruleId: 'reliability-flaky-install', filePath: 'ci.yml', evidence: 'npm install' });
  const f2 = buildMockAIFinding({ ruleId: 'reliability-flaky-install', filePath: 'ci.yml', evidence: 'npm install' });
  const t6 = patchBuilder.buildMultiplePatches([f1, f2], []);
  assert.strictEqual(t6.length, 1);
  console.log('TEST 6 PASS');

  console.log('--- OUTPUT VALIDATOR TESTS ---');

  // TEST 7
  const validExp = { ruleId: 'test-rule', plainEnglishRisk: 'This is risky because...', technicalDetail: 'The technical reason is...', failureScenario: 'This will break when...', businessImpact: 'Business impact is...', confidence: 'high' };
  const t7 = outputValidator.validateFindingExplanation(validExp);
  assert.strictEqual(t7.valid, true);
  assert.strictEqual(t7.errors.length, 0);
  console.log('TEST 7 PASS');

  // TEST 8
  const t8 = outputValidator.validateFindingExplanation({ ruleId: 'test', plainEnglishRisk: 'risk' });
  assert.strictEqual(t8.valid, false);
  assert.ok(t8.errors.length >= 3);
  console.log('TEST 8 PASS');

  // TEST 9
  const t9 = outputValidator.validateFindingExplanation({ ...validExp, confidence: 'very-certain' });
  assert.strictEqual(t9.valid, false);
  assert.ok(t9.errors.some(e => e.field === 'confidence'));
  console.log('TEST 9 PASS');

  // TEST 10
  const t10Data: AIPatchResult = { patchedContent: 'run: YOUR_COMMAND_HERE', explanation: 'Fix the issue', warnings: [], requiresManualReview: false };
  const t10 = outputValidator.validateAIPatchResult(t10Data);
  assert.strictEqual(t10.valid, false);
  assert.ok(t10.errors[0].message.includes('placeholder'));
  console.log('TEST 10 PASS');

  // TEST 11
  const t11Data = { patchedContent: 'run: npm ci', explanation: 'Use npm ci instead of npm install', warnings: [], requiresManualReview: false };
  const t11 = outputValidator.validateAIPatchResult(t11Data);
  assert.strictEqual(t11.valid, true);
  console.log('TEST 11 PASS');

  // TEST 12
  const t12Data = { executiveSummary: 'x'.repeat(50), technicalSummary: 'y'.repeat(50), overallHealthAssessment: 'This pipeline ...', prioritizedActionPlan: [{ priority: 1, action: 'A', reasoning: 'R', estimatedEffort: 'E', ruleIds: [] }], topRisks: [{ rank: 3, title: 'C' }, { rank: 1, title: 'A' }, { rank: 2, title: 'B' }] };
  const t12 = outputValidator.validateScanExplanation(t12Data);
  assert.strictEqual(t12.valid, true);
  const sortedRisks = (t12.sanitized as any).topRisks;
  assert.strictEqual(sortedRisks[0].rank, 1);
  assert.strictEqual(sortedRisks[1].rank, 2);
  assert.strictEqual(sortedRisks[2].rank, 3);
  console.log('TEST 12 PASS');

  console.log('--- GUARDRAIL TESTS ---');

  // TEST 13
  const origWorkflow = `name: CI\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm install`;
  const patchedWorkflow = origWorkflow.replace('npm install', 'npm ci');
  const t13Finding = buildMockAIFinding({ ruleId: 'reliability-flaky-install', evidence: 'npm install' });
  const t13Patch: AIPatchResult = { patchedContent: patchedWorkflow, explanation: 'x', warnings: [], requiresManualReview: false };
  const t13 = await guardrail.validatePatch(origWorkflow, patchedWorkflow, '.github/workflows/ci.yml', t13Finding, t13Patch, 'ai-generated');
  assert.strictEqual(t13.approved, true);
  assert.ok(t13.patchedFindingCount < t13.originalFindingCount || t13.resolvedFindingIds.includes('reliability-flaky-install'));
  console.log('TEST 13 PASS');

  // TEST 14
  const brokenWorkflow = `{ this is: [broken yaml`;
  const t14 = await guardrail.validatePatch(origWorkflow, brokenWorkflow, 'ci.yml', t13Finding, t13Patch, 'ai-generated');
  assert.strictEqual(t14.approved, false);
  assert.ok(t14.rejectionReason!.includes('invalid') || t14.rejectionReason!.includes('syntax') || t14.rejectionReason!.includes('Fail to parse') || t14.rejectionReason!.includes('Unknown format'));
  console.log('TEST 14 PASS');

  // TEST 15
  const detPatch = patchBuilder.buildPatch('reliability-flaky-install', 'npm install', 'ci.yml');
  const t15 = await guardrail.validateAndFallback(origWorkflow, brokenWorkflow, 'ci.yml', t13Finding, t13Patch, detPatch!);
  assert.strictEqual(t15.usedFallback, true);
  console.log('TEST 15 PASS');

  console.log('--- FALLBACK GENERATOR TESTS ---');

  // TEST 16
  const t16 = fallbackGenerator.generateFallback('security-unpinned-action', buildMockAIFinding({ ruleId: 'security-unpinned-action' }), 'Validation failed');
  assert.ok(t16.finalRecommendation.length > 50);
  assert.ok(t16.finalRecommendation.includes('SHA') || t16.finalRecommendation.includes('pin'));
  assert.strictEqual(t16.validationStatus, ValidationStatus.FALLBACK);
  console.log('TEST 16 PASS');

  // TEST 17
  const t17 = fallbackGenerator.generateFallback('unknown-rule-xyz', buildMockAIFinding({ ruleId: 'unknown-rule-xyz' }), 'No rule match');
  assert.ok(t17.finalRecommendation.length > 20);
  assert.ok(t17 !== null);
  console.log('TEST 17 PASS');

  console.log('--- REMEDIATION GENERATOR TESTS ---');

  // TEST 18
  const mockC1 = new MockClaudeClient();
  const remGen = new RemediationGenerator(mockC1, patchBuilder);
  const t18 = await remGen.generateForFinding(buildMockAIFinding({ ruleId: 'reliability-flaky-install', evidence: 'npm install' }), 'run: npm install\n', 'scan-1');
  assert.strictEqual(t18.remediationSource, 'deterministic');
  assert.strictEqual(mockC1.callLog.length, 0);
  assert.ok(t18.patch !== null);
  assert.ok(t18.patch!.after.includes('npm ci'));
  console.log('TEST 18 PASS');

  // TEST 19
  const mockC2 = new MockClaudeClient();
  mockC2.setMockResponse(AITaskType.GENERATE_REMEDIATION, { patchedContent: 'run: npm ci', explanation: 'Use npm ci for deterministic installs', warnings: [], requiresManualReview: false });
  const remGen2 = new RemediationGenerator(mockC2, patchBuilder);
  const t19 = await remGen2.generateForFinding(buildMockAIFinding({ ruleId: 'reliability-missing-rollback', evidence: 'deploy-production' }), 'jobs:\n  deploy:\n    steps:\n      - run: deploy.sh', 'scan-1');
  assert.strictEqual(mockC2.callLog.length, 1);
  assert.ok(t19.aiPatch !== null);
  console.log('TEST 19 PASS');

  console.log('--- AI ORCHESTRATOR TESTS ---');

  // TEST 20
  const mockC3 = new MockClaudeClient();
  const orch = new AIOrchestrator(new ExplanationEngine(mockC3), new FailurePredictor(mockC3));
  mockC3.setMockResponse(AITaskType.EXPLAIN_SCAN, buildMockScanExplanation());
  mockC3.setMockResponse(AITaskType.EXPLAIN_FINDING, buildMockExplanation());
  const jobId = await orch.startExplainJob('scan-1', 'repo-1', buildMockAIContext());
  assert.strictEqual(typeof jobId, 'string');
  assert.ok(jobId.length > 0);
  console.log('TEST 20 PASS');

  // TEST 21
  const jobStatus = orch.getJob(jobId);
  assert.ok(jobStatus !== null);
  assert.strictEqual(jobStatus!.jobId, jobId);
  assert.ok(['pending', 'running', 'completed'].includes(jobStatus!.status));
  console.log('TEST 21 PASS');

  // TEST 22
  let attempts = 0;
  while (!orch.isJobComplete(jobId) && attempts < 50) {
    await sleep(100);
    attempts++;
  }
  const finalStatus = orch.getJob(jobId);
  assert.strictEqual(finalStatus!.status, 'completed');
  assert.ok(finalStatus!.result?.explanation !== undefined);
  assert.ok(finalStatus!.result!.explanation!.executiveSummary.length > 0);
  console.log('TEST 22 PASS');

  // TEST 23
  orch.getJob(jobId)!.completedAt = new Date(Date.now() - 7200000);
  const removed = orch.cleanupOldJobs(3600000);
  assert.ok(removed >= 1);
  assert.strictEqual(orch.getJob(jobId), null);
  console.log('TEST 23 PASS');

  console.log('--- ROUTE VALIDATION TESTS ---');

  // TEST 24
  assert.ok(typeof aiRoutes === 'function');
  assert.ok(typeof (aiRoutes as any).get === 'function');
  console.log('TEST 24 PASS');

  // TEST 25
  assert.ok(tokenCounter !== undefined);
  assert.ok(geminiClient !== undefined);
  assert.ok(explanationEngine !== undefined);
  assert.ok(failurePredictor !== undefined);
  assert.ok(patchBuilder !== undefined);
  assert.ok(remediationGenerator !== undefined);
  assert.ok(guardrail !== undefined);
  assert.ok(outputValidator !== undefined);
  assert.ok(fallbackGenerator !== undefined);
  assert.ok(aiOrchestrator !== undefined);
  console.log('TEST 25 PASS');

  console.log('ALL TESTS PASSED');
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});

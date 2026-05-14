import assert from 'assert';
import { tokenCounter } from './token-counter';
import { ClaudeClient } from './claude-client';
import { ExplanationEngine } from './explanation-engine';
import { FailurePredictor } from './failure-predictor';
import { AITaskType, AIErrorCode, AIResult, FindingExplanation, ScanExplanation, FailurePrediction, SingleFailurePrediction } from './ai-response.types';
import { AIContext, AIFinding } from '../engine/report-builder';

class MockClaudeClient extends ClaudeClient {
  public callLog: Array<{ taskType: AITaskType, systemPrompt: string, userPrompt: string }> = [];
  public mockResponses: Map<AITaskType, unknown> = new Map();
  public shouldFail: boolean = false;
  public failCode: AIErrorCode = AIErrorCode.API_ERROR;

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

    if (this.shouldFail) {
      return {
        success: false,
        error: {
          code: this.failCode,
          message: 'Mock failure',
          retryable: false
        }
      };
    }

    const mockData = this.mockResponses.get(taskType);
    if (!mockData) {
      return {
        success: false,
        error: {
          code: AIErrorCode.INVALID_RESPONSE,
          message: `No mock response set for ${taskType}`,
          retryable: false
        }
      };
    }

    return {
      success: true,
      data: mockData as T,
      raw: {
        requestId: 'mock-request-id',
        content: JSON.stringify(mockData),
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        model: 'claude-sonnet-4-20250514',
        stopReason: 'end_turn',
        latencyMs: 50,
        cost: { inputCostUsd: 0.0003, outputCostUsd: 0.003, totalCostUsd: 0.0033 }
      }
    };
  }
}

function buildMockAIFinding(overrides?: Partial<AIFinding>): AIFinding {
  return {
    ruleId: 'rule-id',
    title: 'title',
    filePath: 'filePath',
    evidence: 'evidence',
    remediation: 'remediation',
    severity: 'high',
    category: 'security',
    ...overrides
  };
}

function buildMockAIContext(overrides?: Partial<AIContext>): AIContext {
  return {
    repoId: 'repo-id',
    scanId: 'scan-id',
    overallScore: 80,
    overallGrade: 'B',
    trend: 'improving',
    ciSystemsDetected: ['github-actions'],
    hasSecurityIssues: true,
    hasReliabilityIssues: false,
    criticalFindings: [],
    highFindings: [],
    mediumFindings: [],
    lowFindings: [],
    infoFindings: [],
    topPatterns: ['pattern1'],
    remediationPriorities: ['priority1'],
    ...overrides
  } as any;
}

async function runTests() {
  console.log('--- TOKEN COUNTER TESTS ---');
  
  // TEST 1
  {
    const est = tokenCounter.estimateTokens('hello world');
    assert.ok(est > 0);
    assert.ok(est <= 5);
    console.log('TEST 1 PASS');
  }

  // TEST 2
  {
    const short = tokenCounter.estimateTokens('hi');
    const long = tokenCounter.estimateTokens('a'.repeat(1000));
    assert.ok(long > short);
    console.log('TEST 2 PASS');
  }

  // TEST 3
  {
    const cost = tokenCounter.estimateCost(1000, 1000, 'claude-sonnet-4-20250514');
    assert.strictEqual(cost.inputCostUsd, 0.003);
    assert.strictEqual(cost.outputCostUsd, 0.015);
    assert.strictEqual(cost.totalCostUsd, 0.018);
    console.log('TEST 3 PASS');
  }

  // TEST 4
  {
    const cost = tokenCounter.estimateCost(0, 0, 'claude-sonnet-4-20250514');
    assert.strictEqual(cost.totalCostUsd, 0);
    console.log('TEST 4 PASS');
  }

  // TEST 5
  {
    const longText = 'word '.repeat(1000);
    const result = tokenCounter.truncateToFit(longText, 50, '...[truncated]');
    assert.strictEqual(result.truncated, true);
    assert.ok(tokenCounter.estimateTokens(result.text) <= 65);
    assert.ok(result.text.endsWith('...[truncated]'));
    console.log('TEST 5 PASS');
  }

  // TEST 6
  {
    const shortText = 'hello world';
    const result = tokenCounter.truncateToFit(shortText, 100);
    assert.strictEqual(result.truncated, false);
    assert.strictEqual(result.text, shortText);
    console.log('TEST 6 PASS');
  }

  // TEST 7
  {
    const budget = 1000;
    const parts = [
      { name: 'critical', priority: 5, minTokens: 100 },
      { name: 'high', priority: 3, minTokens: 50 },
      { name: 'info', priority: 1, minTokens: 20 }
    ];
    const result = tokenCounter.budgetSplit(budget, parts);
    assert.ok(result.critical >= 100);
    assert.ok(result.high >= 50);
    assert.ok(result.info >= 20);
    assert.ok(result.critical > result.high);
    assert.ok(result.high > result.info);
    const totalAllocated = Object.values(result).reduce((a, b) => a + b, 0);
    assert.ok(totalAllocated <= budget + 3);
    console.log('TEST 7 PASS');
  }

  // TEST 8
  {
    assert.strictEqual(tokenCounter.fitsInContext('system prompt', 'user prompt', 100, 'claude-sonnet-4-20250514'), true);
    console.log('TEST 8 PASS');
  }

  // TEST 9
  {
    const hugeText = 'x '.repeat(200000);
    assert.strictEqual(tokenCounter.fitsInContext(hugeText, hugeText, 8192, 'claude-sonnet-4-20250514'), false);
    console.log('TEST 9 PASS');
  }

  console.log('--- EXPLANATION ENGINE TESTS ---');

  const mockExplanation: FindingExplanation = {
    ruleId: 'security-unpinned-action',
    plainEnglishRisk: 'Using a tag instead of SHA means...',
    technicalDetail: 'GitHub resolves the tag at runtime...',
    failureScenario: 'A malicious commit to the action repo...',
    businessImpact: 'Could compromise your entire pipeline...',
    confidence: 'high'
  };

  // TEST 10
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const finding = buildMockAIFinding({ ruleId: 'security-unpinned-action' });
    mock.setMockResponse(AITaskType.EXPLAIN_FINDING, mockExplanation);

    const result = await engine.explainFinding(finding, { repoId: 'repo-1', ciSystemsDetected: ['github-actions'] }, 'scan-1');

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.ruleId, 'security-unpinned-action');
    }
    assert.strictEqual(mock.callLog.length, 1);
    assert.strictEqual(mock.callLog[0].taskType, AITaskType.EXPLAIN_FINDING);
    console.log('TEST 10 PASS');
  }

  // TEST 11
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const finding = buildMockAIFinding({ ruleId: 'security-unpinned-action', evidence: 'some evidence', filePath: 'some/path' });
    mock.setMockResponse(AITaskType.EXPLAIN_FINDING, mockExplanation);

    await engine.explainFinding(finding, { repoId: 'repo-1', ciSystemsDetected: ['github-actions'] }, 'scan-1');

    assert.ok(mock.callLog[0].userPrompt.includes(finding.ruleId));
    assert.ok(mock.callLog[0].userPrompt.includes(finding.evidence));
    assert.ok(mock.callLog[0].userPrompt.includes(finding.filePath));
    assert.ok(mock.callLog[0].systemPrompt.length > 50);
    console.log('TEST 11 PASS');
  }

  // TEST 12
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const finding = buildMockAIFinding();
    mock.shouldFail = true;
    mock.failCode = AIErrorCode.RATE_LIMITED;

    const result = await engine.explainFinding(finding, { repoId: 'repo-1', ciSystemsDetected: ['github-actions'] }, 'scan-1');

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.error.code, AIErrorCode.RATE_LIMITED);
    }
    console.log('TEST 12 PASS');
  }

  // TEST 13
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const aiContext = buildMockAIContext();

    const mockScanExplanation: ScanExplanation = {
      executiveSummary: 'This pipeline has critical security issues...',
      technicalSummary: 'Three GitHub Actions are not pinned...',
      topRisks: [
        { rank: 1, title: 'Unpinned actions', narrative: '...', affectedFiles: [], severity: 'high' },
        { rank: 2, title: 'Missing timeouts', narrative: '...', affectedFiles: [], severity: 'medium' },
        { rank: 3, title: 'Floating tags', narrative: '...', affectedFiles: [], severity: 'high' }
      ],
      overallHealthAssessment: 'This pipeline is fragile because...',
      prioritizedActionPlan: [
        { priority: 1, action: 'Pin all GitHub Actions', reasoning: '...', estimatedEffort: 'minutes', ruleIds: [] }
      ]
    };
    mock.setMockResponse(AITaskType.EXPLAIN_SCAN, mockScanExplanation);

    const result = await engine.explainScan(aiContext, 'scan-1');

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.topRisks.length, 3);
      assert.ok(result.data.prioritizedActionPlan.length >= 1);
      assert.ok(result.data.overallHealthAssessment.startsWith('This pipeline'));
    }
    assert.strictEqual(mock.callLog[0].taskType, AITaskType.EXPLAIN_SCAN);
    console.log('TEST 13 PASS');
  }

  // TEST 14
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const aiContext = buildMockAIContext({ overallScore: 80, overallGrade: 'B' });
    mock.setMockResponse(AITaskType.EXPLAIN_SCAN, {});

    await engine.explainScan(aiContext, 'scan-1');

    assert.ok(mock.callLog[0].userPrompt.includes(aiContext.overallScore.toString()));
    assert.ok(mock.callLog[0].userPrompt.includes(aiContext.overallGrade));
    console.log('TEST 14 PASS');
  }

  // TEST 15
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const aiContext = buildMockAIContext({
      criticalFindings: [
        buildMockAIFinding({ ruleId: 'crit-1', title: 'crit-title-1' }),
        buildMockAIFinding({ ruleId: 'crit-2', title: 'crit-title-2' })
      ]
    });
    mock.setMockResponse(AITaskType.EXPLAIN_SCAN, {});

    await engine.explainScan(aiContext, 'scan-1');

    assert.ok(mock.callLog[0].userPrompt.includes('crit-1'));
    assert.ok(mock.callLog[0].userPrompt.includes('crit-title-1'));
    console.log('TEST 15 PASS');
  }

  // TEST 16
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const findings = Array(15).fill(null).map((_, i) => buildMockAIFinding({ ruleId: `rule-${i}`, filePath: `file${i}.yml` }));
    mock.setMockResponse(AITaskType.EXPLAIN_FINDING, { ...mockExplanation });

    const result = await engine.explainMultipleFindings(findings, buildMockAIContext(), 'scan-1', { maxFindings: 5 });

    assert.strictEqual(mock.callLog.length, 5);
    assert.strictEqual(result.size, 5);
    console.log('TEST 16 PASS');
  }

  // TEST 17
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    const findings = [
      buildMockAIFinding({ severity: 'low', ruleId: 'rule-low' }),
      buildMockAIFinding({ severity: 'critical', ruleId: 'rule-critical' }),
      buildMockAIFinding({ severity: 'high', ruleId: 'rule-high' })
    ];
    mock.setMockResponse(AITaskType.EXPLAIN_FINDING, mockExplanation);

    await engine.explainMultipleFindings(findings, buildMockAIContext(), 'scan-1', { maxFindings: 2 });

    assert.ok(mock.callLog[0].userPrompt.includes('rule-critical'));
    assert.ok(mock.callLog[1].userPrompt.includes('rule-high'));
    console.log('TEST 17 PASS');
  }

  console.log('--- FAILURE PREDICTOR TESTS ---');

  // TEST 18
  {
    const mock = new MockClaudeClient();
    const predictor = new FailurePredictor(mock);
    const aiContext = buildMockAIContext();

    const mockPrediction: FailurePrediction = {
      scanId: 'scan-1',
      predictions: [{
        ruleId: 'reliability-floating-docker-tag',
        filePath: '.github/workflows/ci.yml',
        trigger: 'Next time node:latest tag is updated',
        failureMode: 'Build fails with cryptic dependency errors',
        detectability: 'subtle',
        likelihood: 'likely',
        impact: 'deployment_failure'
      }],
      overallRiskLevel: 'high',
      timeToFailureEstimate: 'likely within weeks',
      mostLikelyFailureScenario: 'A Docker image update breaks the build...',
      confidenceStatement: 'High confidence based on observed patterns...'
    };
    mock.setMockResponse(AITaskType.PREDICT_FAILURE, mockPrediction);

    const result = await predictor.predictFailures(aiContext, 'scan-1');

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.ok(result.data.predictions.length >= 1);
      assert.strictEqual(result.data.overallRiskLevel, 'high');
    }
    assert.strictEqual(mock.callLog[0].taskType, AITaskType.PREDICT_FAILURE);
    console.log('TEST 18 PASS');
  }

  // TEST 19
  {
    const mock = new MockClaudeClient();
    const predictor = new FailurePredictor(mock);
    const aiContext = buildMockAIContext({ criticalFindings: [buildMockAIFinding({ ruleId: 'crit-rule' })] });
    mock.setMockResponse(AITaskType.PREDICT_FAILURE, {});

    await predictor.predictFailures(aiContext, 'scan-1');

    assert.ok(mock.callLog[0].userPrompt.includes('CRITICAL FINDINGS'));
    assert.ok(mock.callLog[0].userPrompt.includes('crit-rule'));
    console.log('TEST 19 PASS');
  }

  // TEST 20
  {
    const mock = new MockClaudeClient();
    const predictor = new FailurePredictor(mock);
    const finding = buildMockAIFinding({ ruleId: 'security-secret-exposure', severity: 'critical' });

    const mockSingle: SingleFailurePrediction = {
      ruleId: 'security-secret-exposure',
      filePath: finding.filePath,
      trigger: 'Repository is made public or forked',
      failureMode: 'Secrets are exposed in git history',
      detectability: 'silent',
      likelihood: 'very_likely',
      impact: 'security_breach'
    };
    mock.setMockResponse(AITaskType.PREDICT_FAILURE, mockSingle);

    const result = await predictor.predictSingleFinding(finding, 'scan-1', 'repo-1');

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.ruleId, 'security-secret-exposure');
      assert.strictEqual(result.data.impact, 'security_breach');
    }
    console.log('TEST 20 PASS');
  }

  // TEST 21
  {
    const mock = new MockClaudeClient();
    const predictor = new FailurePredictor(mock);
    const finding = buildMockAIFinding({ ruleId: 'security-secret-exposure', evidence: 'some evidence' });
    mock.setMockResponse(AITaskType.PREDICT_FAILURE, {});

    await predictor.predictSingleFinding(finding, 'scan-1', 'repo-1');

    assert.ok(mock.callLog[0].userPrompt.includes('some evidence'));
    assert.ok(mock.callLog[0].userPrompt.includes('security-secret-exposure'));
    console.log('TEST 21 PASS');
  }

  console.log('--- CLAUDE CLIENT USAGE TESTS ---');

  // TEST 22
  {
    class UsageMockClient extends ClaudeClient {
      constructor() {
        super({ enableUsageTracking: true });
        (this as any).usageHistory = [
          { totalTokens: 300, costUsd: 0.01, latencyMs: 100, success: true, taskType: AITaskType.EXPLAIN_FINDING },
          { totalTokens: 500, costUsd: 0.02, latencyMs: 200, success: true, taskType: AITaskType.EXPLAIN_SCAN },
          { totalTokens: 200, costUsd: 0.005, latencyMs: 150, success: false, taskType: AITaskType.EXPLAIN_FINDING }
        ];
      }
    }
    const client = new UsageMockClient();
    const summary = client.getUsageSummary();

    assert.strictEqual(summary.totalRequests, 3);
    assert.strictEqual(summary.totalTokens, 1000);
    assert.ok(Math.abs(summary.totalCostUsd - 0.035) < 0.001);
    assert.strictEqual(summary.successRate, 0.67);
    assert.strictEqual(summary.byTaskType[AITaskType.EXPLAIN_FINDING].count, 2);
    assert.strictEqual(summary.averageLatencyMs, 150);
    console.log('TEST 22 PASS');
  }

  // TEST 23
  {
    const successResult: AIResult<{ foo: string }> = { success: true, data: { foo: 'bar' }, raw: {} as any };
    if (successResult.success) {
      assert.strictEqual(successResult.data.foo, 'bar');
    }
    const failResult: AIResult<{ foo: string }> = { success: false, error: { code: AIErrorCode.API_ERROR, message: 'err', retryable: false } };
    if (!failResult.success) {
      assert.strictEqual(failResult.error.code, AIErrorCode.API_ERROR);
    }
    console.log('TEST 23 PASS');
  }

  // TEST 24
  {
    const cost = tokenCounter.estimateCost(5000, 2000, 'claude-sonnet-4-20250514');
    assert.ok(Math.abs(cost.totalCostUsd - (cost.inputCostUsd + cost.outputCostUsd)) < 0.000001);
    assert.strictEqual(cost.inputCostUsd, 0.015);
    assert.strictEqual(cost.outputCostUsd, 0.03);
    console.log('TEST 24 PASS');
  }

  // TEST 25
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    mock.setMockResponse(AITaskType.EXPLAIN_FINDING, mockExplanation);
    await engine.explainFinding(buildMockAIFinding(), buildMockAIContext(), 'scan-1');

    const prompt = mock.callLog[0].systemPrompt.toLowerCase();
    assert.ok(prompt.includes('devops') || prompt.includes('reliability') || prompt.includes('engineer'));
    console.log('TEST 25 PASS');
  }

  // TEST 26
  {
    const mock = new MockClaudeClient();
    const engine = new ExplanationEngine(mock);
    mock.setMockResponse(AITaskType.EXPLAIN_FINDING, mockExplanation);
    await engine.explainFinding(buildMockAIFinding(), buildMockAIContext(), 'scan-1');

    assert.ok(mock.callLog[0].systemPrompt.includes('JSON'));
    assert.ok(mock.callLog[0].userPrompt.includes('"ruleId"'));
    console.log('TEST 26 PASS');
  }

  console.log('ALL TESTS PASSED');
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});

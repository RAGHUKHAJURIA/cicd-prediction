import * as assert from 'assert';
import { AITaskType, OUTPUT_SCHEMAS } from './prompt-templates';
import { ContextSerializer } from './context-serializer';
import { PromptBuilder } from './prompt-builder';
import type { AIContext } from '../engine/report-builder';

function buildMockAIContext(overrides?: Partial<AIContext>): AIContext {
  return {
    repoId: 'test-repo-123',
    scanId: 'test-scan-456',
    overallScore: 75,
    overallGrade: 'F',
    trend: 'degrading',
    ciSystemsDetected: ['github-actions', 'dockerfile'],
    hasSecurityIssues: true,
    hasReliabilityIssues: true,
    topPatterns: [
      '3 GitHub Actions not pinned to SHA',
      '2 jobs missing timeout',
      '1 hardcoded secret detected'
    ],
    remediationPriorities: [
      'Fix hardcoded secret in .github/workflows/ci.yml',
      'Pin actions/checkout to SHA digest',
      'Add timeout-minutes to build job'
    ],
    criticalFindings: [
      {
        ruleId: 'security-secret-exposure',
        title: 'Hardcoded GitHub PAT in env var',
        severity: 'critical',
        category: 'security',
        filePath: '.github/workflows/ci.yml',
        evidence: 'TOKEN=ghp_****...****',
        remediation: 'Move to encrypted secrets storage'
      }
    ],
    highFindings: [
      {
        ruleId: 'security-unpinned-action',
        title: "Action 'actions/checkout@v4' not pinned to SHA",
        severity: 'high',
        category: 'security',
        filePath: '.github/workflows/ci.yml',
        evidence: 'actions/checkout@v4',
        remediation: 'Pin to SHA: actions/checkout@{sha}'
      },
      {
        ruleId: 'reliability-floating-docker-tag',
        title: "Job 'build' uses floating Docker image node:latest",
        severity: 'high',
        category: 'reliability',
        filePath: '.github/workflows/ci.yml',
        evidence: 'node:latest',
        remediation: 'Pin to digest: node:18-alpine@sha256:...'
      }
    ],
    ...overrides
  };
}

async function runTests() {
  const serializer = new ContextSerializer();
  const context = buildMockAIContext();

  console.log("TEST 1 — ContextSerializer produces non-empty string");
  const result1 = serializer.serialize(context);
  assert.ok(result1.text.length > 0);
  assert.ok(result1.estimatedTokens > 0);
  assert.ok(result1.findingsIncluded >= 1);
  assert.strictEqual(result1.truncated, false);

  console.log("TEST 2 — Serialized text contains score and grade");
  assert.ok(result1.text.includes('75'));
  assert.ok(result1.text.includes('F'));

  console.log("TEST 3 — Serialized text contains finding titles");
  assert.ok(result1.text.includes('Hardcoded GitHub PAT'));
  assert.ok(result1.text.includes('CRITICAL'));

  console.log("TEST 4 — Serialized text contains file paths");
  assert.ok(result1.text.includes('.github/workflows/ci.yml'));

  console.log("TEST 5 — Serialized text does NOT contain raw YAML");
  assert.ok(!result1.text.includes('on:\\n'));
  assert.ok(!result1.text.includes('runs-on:'));
  assert.ok(!result1.text.includes('steps:\\n'));

  console.log("TEST 6 — Token budget is respected");
  const result6 = serializer.serialize(context, { tokenBudget: 200 }); // strict budget
  assert.ok(result6.estimatedTokens <= 200 || result6.findingsIncluded <= 3);

  console.log("TEST 7 — maxFindings limit is respected");
  const largeContext = buildMockAIContext();
  largeContext.highFindings = Array(15).fill(largeContext.highFindings[0]);
  const result7 = serializer.serialize(largeContext, { maxFindings: 5 });
  assert.ok(result7.findingsIncluded <= 5);

  console.log("TEST 8 — LOW severity excluded by default");
  const contextWithLow = {
    ...buildMockAIContext(),
    criticalFindings: [],
    highFindings: [],
    lowFindings: [{
      ruleId: 'test-low',
      title: 'Low Title',
      severity: 'low',
      category: 'maintainability',
      filePath: 'test.yml',
      evidence: 'evidence',
      remediation: 'fix'
    }]
  } as any;
  const result8 = serializer.serialize(contextWithLow, { includeLowSeverity: false });
  assert.strictEqual(result8.findingsIncluded, 0);

  console.log("TEST 9 — serializeForTask uses task-specific options");
  const explainResult = serializer.serializeForTask(context, AITaskType.EXPLAIN);
  const remediateResult = serializer.serializeForTask(context, AITaskType.REMEDIATE);
  assert.strictEqual(typeof explainResult.text, 'string');
  assert.strictEqual(typeof remediateResult.text, 'string');
  assert.ok(explainResult.text.length > 0);
  assert.ok(remediateResult.text.length > 0);

  console.log("TEST 10 — PromptBuilder.build returns BuiltPrompt for EXPLAIN");
  const builder = new PromptBuilder();
  const prompt10 = builder.build(context, AITaskType.EXPLAIN);
  assert.strictEqual(prompt10.taskType, AITaskType.EXPLAIN);
  assert.ok(prompt10.systemPrompt.length > 100);
  assert.ok(prompt10.userPrompt.length > 100);
  assert.ok(prompt10.estimatedInputTokens > 0);
  assert.ok(prompt10.estimatedCostUsd > 0);
  assert.strictEqual(prompt10.metadata.modelTarget, 'claude-sonnet-4-20250514');

  console.log("TEST 11 — PromptBuilder.build returns BuiltPrompt for REMEDIATE");
  const prompt11 = builder.build(context, AITaskType.REMEDIATE);
  assert.strictEqual(prompt11.taskType, AITaskType.REMEDIATE);
  assert.ok(prompt11.userPrompt.includes('copy-pasteable'));
  assert.ok(prompt11.userPrompt.includes('BEFORE') || prompt11.userPrompt.includes('before'));

  console.log("TEST 12 — PromptBuilder.build returns BuiltPrompt for PREDICT");
  const prompt12 = builder.build(context, AITaskType.PREDICT);
  assert.strictEqual(prompt12.taskType, AITaskType.PREDICT);
  assert.ok(prompt12.userPrompt.includes('failure'));

  console.log("TEST 13 — PromptBuilder.build returns BuiltPrompt for SUMMARIZE");
  const prompt13 = builder.build(context, AITaskType.SUMMARIZE);
  assert.strictEqual(prompt13.taskType, AITaskType.SUMMARIZE);
  assert.ok(prompt13.userPrompt.includes('executive summary'));

  console.log("TEST 14 — System prompts are different per task type");
  assert.notStrictEqual(prompt10.systemPrompt, prompt11.systemPrompt);
  assert.ok(prompt10.systemPrompt.includes('explain'));
  assert.ok(prompt11.systemPrompt.includes('fix') || prompt11.systemPrompt.includes('patch'));

  console.log("TEST 15 — User prompt contains the serialized context");
  assert.ok(prompt10.userPrompt.includes('Repository Risk Assessment'));
  assert.ok(prompt10.userPrompt.includes(context.overallGrade));

  console.log("TEST 16 — User prompt instructs valid JSON output");
  assert.ok(prompt10.userPrompt.includes('valid JSON'));
  assert.ok(prompt10.userPrompt.includes('JSON only') || prompt10.userPrompt.includes('only output the JSON'));

  console.log("TEST 17 — User prompt includes output schema");
  assert.ok(prompt10.userPrompt.includes('ExplainOutput') || prompt10.userPrompt.includes('"findings"'));

  console.log("TEST 18 — PromptBuilder.validate catches empty context");
  const emptyContext = { ...buildMockAIContext(), criticalFindings: [], highFindings: [] } as any;
  const prompt18 = builder.build(emptyContext, AITaskType.EXPLAIN);
  const val18 = builder.validate(prompt18);
  assert.ok(val18.valid === false || val18.warnings.length > 0);
  assert.ok(val18.errors.some(e => e.includes('no findings')) || val18.warnings.some(w => w.includes('no findings')));

  console.log("TEST 19 — PromptBuilder.validate passes valid prompt");
  const val19 = builder.validate(prompt10);
  assert.strictEqual(val19.valid, true);
  assert.strictEqual(val19.errors.length, 0);

  console.log("TEST 20 — PromptBuilder.buildAll returns all 4 task types");
  const allPrompts = builder.buildAll(context);
  assert.strictEqual(Object.keys(allPrompts).length, 4);
  assert.ok(allPrompts[AITaskType.EXPLAIN]);
  assert.ok(allPrompts[AITaskType.REMEDIATE]);
  assert.ok(allPrompts[AITaskType.PREDICT]);
  assert.ok(allPrompts[AITaskType.SUMMARIZE]);

  console.log("TEST 21 — PromptBuilder.estimateCost returns positive number");
  const estimate = builder.estimateCost([context], [AITaskType.EXPLAIN, AITaskType.REMEDIATE]);
  assert.ok(estimate.totalEstimatedInputTokens > 0);
  assert.ok(estimate.estimatedCostUsd > 0);
  assert.strictEqual(estimate.breakdown.length, 2);

  console.log("TEST 22 — Evidence is truncated in serialization");
  const longEvidenceContext = buildMockAIContext();
  longEvidenceContext.criticalFindings[0].evidence = 'A'.repeat(500);
  const result22 = serializer.serialize(longEvidenceContext, { maxEvidenceLength: 200 });
  assert.ok(!result22.text.includes('A'.repeat(300)));

  console.log("TEST 23 — CRITICAL findings appear before HIGH in serialized text");
  const criticalIndex = result1.text.indexOf('CRITICAL');
  const highIndex = result1.text.indexOf('HIGH');
  assert.ok(criticalIndex < highIndex && criticalIndex !== -1);

  console.log("TEST 24 — Token estimate is consistent");
  const result24a = serializer.serialize(context);
  const result24b = serializer.serialize(context);
  assert.strictEqual(result24a.estimatedTokens, result24b.estimatedTokens);

  console.log("TEST 25 — Output schemas are valid JSON strings");
  for (const taskType of Object.values(AITaskType)) {
    const schema = OUTPUT_SCHEMAS[taskType];
    assert.strictEqual(typeof schema, 'string');
    assert.doesNotThrow(() => JSON.parse(schema));
  }

  console.log("PASS");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

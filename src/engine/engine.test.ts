import * as assert from 'assert';
import { RiskScorer } from './risk-scorer';
import { ReportBuilder } from './report-builder';
import { AnalysisEngine } from './analysis-engine';
import { RuleResult, RuleSeverity, RuleConfidence, RuleCategory, WorkflowRuleReport } from '../rules/types';
import '../rules/index';
import { ruleRegistry } from '../rules/rule-registry';

function buildMockFinding(overrides?: Partial<RuleResult>): RuleResult {
  return {
    ruleId: 'test-rule',
    ruleName: 'Test Rule',
    category: RuleCategory.RELIABILITY,
    severity: RuleSeverity.MEDIUM,
    title: 'Test',
    description: 'Test',
    remediation: 'Fix it',
    evidence: 'evidence',
    confidence: RuleConfidence.CERTAIN,
    location: { filePath: 'ci.yml', jobId: null, jobName: null, stepId: null, stepName: null, field: '', line: null },
    metadata: {},
    ...overrides
  };
}

async function runTests() {
  const scorer = new RiskScorer();
  const builder = new ReportBuilder();

  console.log("TEST 1 - RiskScorer gives score 0 and grade A for zero findings");
  let score = scorer.calculateWorkflowScore([]);
  assert.strictEqual(score.score, 0);
  assert.strictEqual(score.grade, 'A');

  console.log("TEST 2 - RiskScorer applies floor of 50 (Grade D) for critical findings");
  score = scorer.calculateWorkflowScore([
    buildMockFinding({ severity: RuleSeverity.CRITICAL, category: RuleCategory.SECURITY })
  ]);
  assert.ok(score.score >= 50);
  assert.strictEqual(score.grade, 'D');

  console.log("TEST 3 - RiskScorer applies confidence multiplier");
  const certainScore = scorer.calculateWorkflowScore([
    buildMockFinding({ severity: RuleSeverity.MEDIUM, confidence: RuleConfidence.CERTAIN })
  ]);
  const possibleScore = scorer.calculateWorkflowScore([
    buildMockFinding({ severity: RuleSeverity.MEDIUM, confidence: RuleConfidence.POSSIBLE })
  ]);
  assert.ok(certainScore.score > possibleScore.score);

  console.log("TEST 4 - RiskScorer applies diminishing returns");
  const singleScore = scorer.calculateWorkflowScore([buildMockFinding()]).score;
  const multiScore = scorer.calculateWorkflowScore(Array.from({ length: 5 }, () => buildMockFinding())).score;
  assert.ok(multiScore < singleScore * 5);

  console.log("TEST 5 - RiskScorer applies category weight");
  const secScore = scorer.calculateWorkflowScore([
    buildMockFinding({ category: RuleCategory.SECURITY })
  ]).score;
  const maintScore = scorer.calculateWorkflowScore([
    buildMockFinding({ category: RuleCategory.MAINTAINABILITY })
  ]).score;
  assert.ok(secScore > maintScore);

  console.log("TEST 6 - RiskScorer calculateRepoScore takes max of workflows");
  const repoScore = scorer.calculateRepoScore([
    { score: 80 } as any,
    { score: 30 } as any
  ]);
  assert.ok(repoScore.score >= 80);

  console.log("TEST 7 - RiskScorer trend detection");
  assert.strictEqual(scorer.calculateTrend(30, 50), 'improving');
  assert.strictEqual(scorer.calculateTrend(50, 30), 'degrading');
  assert.strictEqual(scorer.calculateTrend(50, 50), 'stable');
  assert.strictEqual(scorer.calculateTrend(50, null), 'new');

  console.log("TEST 8 - ReportBuilder builds valid AnalysisReport");
  const mockWfReport: WorkflowRuleReport = {
    workflowId: 'wf1', filePath: 'ci.yml', ciSystem: 'github-actions',
    rulesRun: 10, rulesPassed: 5, rulesFailed: 0,
    findings: Array.from({ length: 5 }, () => buildMockFinding()),
    findingsBySeverity: {} as any, findingsByCategory: {} as any,
    executionTimeMs: 100, errors: []
  };
  const report = builder.build('scan1', 'repo1', [mockWfReport], scorer.calculateRepoScore([scorer.calculateWorkflowScore(mockWfReport.findings)]), null, 200);
  assert.strictEqual(report.meta.scanId, 'scan1');
  assert.strictEqual(report.findings.all.length, 5);
  assert.strictEqual(report.summary.totalFindings, 5);
  assert.ok(Array.isArray(report.remediationPlan.immediateActions));
  assert.strictEqual(report.aiContext.repoId, 'repo1');

  console.log("TEST 9 - ReportBuilder buildFindingsTable groups correctly");
  const fTable = builder.buildFindingsTable([
    buildMockFinding({ severity: RuleSeverity.CRITICAL }),
    buildMockFinding({ severity: RuleSeverity.HIGH }),
    buildMockFinding({ severity: RuleSeverity.HIGH }),
    buildMockFinding({ severity: RuleSeverity.MEDIUM }),
    buildMockFinding({ severity: RuleSeverity.MEDIUM })
  ]);
  assert.strictEqual(fTable.critical.length, 1);
  assert.strictEqual(fTable.high.length, 2);
  assert.strictEqual(fTable.medium.length, 2);
  assert.ok(Object.keys(fTable.byFile).length > 0);

  console.log("TEST 10 - ReportBuilder buildRemediationPlan deduplicates");
  const planFindings = [
    buildMockFinding({ ruleId: 'reliability-missing-timeout', severity: RuleSeverity.HIGH, location: { filePath: 'f1' } as any }),
    buildMockFinding({ ruleId: 'reliability-missing-timeout', severity: RuleSeverity.HIGH, location: { filePath: 'f2' } as any }),
    buildMockFinding({ ruleId: 'reliability-missing-timeout', severity: RuleSeverity.HIGH, location: { filePath: 'f3' } as any }),
  ];
  const plan = builder.buildRemediationPlan(planFindings);
  assert.strictEqual(plan.shortTermActions.length, 1);
  assert.strictEqual(plan.shortTermActions[0].findingCount, 3);

  console.log("TEST 11 - ReportBuilder buildAIContext identifies top patterns");
  const aiFindings = [
    ...Array.from({ length: 5 }, () => buildMockFinding({ ruleId: 'reliability-missing-timeout', ruleName: 'Missing Timeout' })),
    ...Array.from({ length: 3 }, () => buildMockFinding({ ruleId: 'security-unpinned-action', ruleName: 'Unpinned Action' })),
    ...Array.from({ length: 2 }, () => buildMockFinding({ ruleId: 'performance-missing-cache', ruleName: 'Missing Cache' }))
  ];
  const aiTable = builder.buildFindingsTable(aiFindings);
  const aiPlan = builder.buildRemediationPlan(aiFindings);
  const aiCtx = builder.buildAIContext('repo1', 'scan1', report.summary, aiTable, aiPlan);
  assert.ok(aiCtx.topPatterns[0].includes('5') && aiCtx.topPatterns[0].includes('Missing Timeout'));
  assert.ok(aiCtx.topPatterns.length >= 3);

  console.log("TEST 12 - AnalysisEngine analyze() end-to-end");
  const engine = new AnalysisEngine();
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
`;
  const result = await engine.analyze({ repoId: 'r1', scanId: 's1', files: [{ filePath: '.github/workflows/ci.yml', content: yaml }] });
  assert.ok(result.summary.totalFindings >= 2);
  assert.ok(result.repoScore.score > 0);
  assert.ok(result.aiContext);

  console.log("TEST 13 - AnalysisEngine handles parse failure gracefully");
  const resultInvalid = await engine.analyze({ repoId: 'r1', scanId: 's1', files: [{ filePath: '.github/workflows/bad.yml', content: 'invalid: yaml: : : 123' }] });
  assert.ok(resultInvalid);
  assert.strictEqual(resultInvalid.summary.totalFindings, 0);

  console.log("TEST 14 - All 16 rules registered after importing rules/index.ts");
  assert.strictEqual(ruleRegistry.getByCategory(RuleCategory.SECURITY).length, 5);
  assert.strictEqual(ruleRegistry.getByCategory(RuleCategory.RELIABILITY).length, 6);
  assert.strictEqual(ruleRegistry.getByCategory(RuleCategory.PERFORMANCE).length, 3);
  assert.strictEqual(ruleRegistry.getByCategory(RuleCategory.MAINTAINABILITY).length, 2);
  assert.ok(ruleRegistry.count() >= 16);

  console.log("TEST 15 - Score breakdown has correct top contributors");
  const bdFindings = [
    buildMockFinding({ ruleId: 'sec-1', category: RuleCategory.SECURITY, severity: RuleSeverity.CRITICAL }),
    buildMockFinding({ ruleId: 'sec-1', category: RuleCategory.SECURITY, severity: RuleSeverity.CRITICAL }),
    buildMockFinding({ ruleId: 'perf-1', category: RuleCategory.PERFORMANCE, severity: RuleSeverity.LOW }),
    buildMockFinding({ ruleId: 'perf-1', category: RuleCategory.PERFORMANCE, severity: RuleSeverity.LOW }),
    buildMockFinding({ ruleId: 'perf-1', category: RuleCategory.PERFORMANCE, severity: RuleSeverity.LOW })
  ];
  const bd = scorer.getScoreBreakdown(bdFindings);
  assert.strictEqual(bd.topContributors[0].category, RuleCategory.SECURITY);
  assert.ok(bd.topContributors[0].pointsContributed > bd.topContributors[bd.topContributors.length - 1].pointsContributed);

  console.log("PASS");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

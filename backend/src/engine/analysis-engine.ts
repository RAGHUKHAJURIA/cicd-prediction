import { RuleConfig, RuleRunner } from '../rules';
import { RiskScorer, WorkflowRiskScore } from './risk-scorer';
import { ReportBuilder, AnalysisReport } from './report-builder';
import { detectAndParse } from '../parsers';
import { registerAllRules, ruleRegistry } from '../rules';

import type { NormalizedWorkflow } from '../models/workflow.model';

export interface AnalysisInput {
  repoId: string;
  scanId: string;
  files?: CIFile[];
  workflows?: NormalizedWorkflow[];
  previousScore?: number;
  config?: Partial<RuleConfig>;
}

export interface CIFile {
  filePath: string;
  content: string;
  encoding?: 'utf-8';
}

export class AnalysisEngine {
  private runner: RuleRunner;
  private scorer: RiskScorer;
  private builder: ReportBuilder;

  constructor(config?: Partial<RuleConfig>) {
    registerAllRules();
    const defaultConfig: RuleConfig = {
      severityOverrides: {},
      disabledRules: [],
      customThresholds: {},
      ignorePaths: []
    };
    this.runner = new RuleRunner(ruleRegistry, { ...defaultConfig, ...config });
    this.scorer = new RiskScorer();
    this.builder = new ReportBuilder();
  }

  async analyze(input: AnalysisInput): Promise<AnalysisReport> {
    const startTime = Date.now();
    const parsedWorkflows = input.workflows ? [...input.workflows] : [];

    if (input.files) {
      // STEP 1 - Parse
      for (const file of input.files) {
        try {
          const parseResult = detectAndParse(file.content, file.filePath, input.repoId);
          if (parseResult.success && parseResult.result) {
            parseResult.result.sourceFile = file.filePath;
            parsedWorkflows.push(parseResult.result);
          }
        } catch (err) {
          // Log error
        }
      }
    }

    // STEP 2 - Run rules
    const scanReport = await this.runner.runOnScan(parsedWorkflows, {
      repoId: input.repoId,
      scanId: input.scanId,
      repoMetadata: { name: input.repoId, provider: 'unknown', defaultBranch: 'main', isMonorepo: false }
    });

    // STEP 3 - Score workflows
    const workflowScores: WorkflowRiskScore[] = [];
    for (const report of scanReport.workflowReports) {
      const score = this.scorer.calculateWorkflowScore(report.findings);
      score.workflowId = report.workflowId;
      score.filePath = report.filePath;
      score.ciSystem = report.ciSystem;
      workflowScores.push(score);
    }

    // STEP 4 - Repo Score
    const repoScore = this.scorer.calculateRepoScore(workflowScores);
    repoScore.repoId = input.repoId;
    repoScore.trend = this.scorer.calculateTrend(repoScore.score, input.previousScore ?? null);

    const topRisksRaw = scanReport.workflowReports.flatMap(r => r.findings)
      .sort((a, b) => {
        const severityRank: Record<string, number> = {
          critical: 20, high: 8, medium: 3, low: 1, info: 0
        };
        const confRank: Record<string, number> = {
          certain: 1.0, likely: 0.8, possible: 0.5
        };
        const scoreA = severityRank[a.severity] * confRank[a.confidence];
        const scoreB = severityRank[b.severity] * confRank[b.confidence];
        return scoreB - scoreA;
      }).slice(0, 10);
    
    repoScore.topRisks = topRisksRaw;

    // STEP 5 - Build report
    const durationMs = Date.now() - startTime;
    const report = this.builder.build(
      input.scanId,
      input.repoId,
      scanReport.workflowReports,
      repoScore,
      input.previousScore ?? null,
      durationMs
    );

    return report;
  }

  async analyzeFiles(
    files: CIFile[],
    repoId: string,
    scanId: string,
    previousScore?: number
  ): Promise<AnalysisReport> {
    return this.analyze({
      repoId,
      scanId,
      files,
      ...(previousScore !== undefined ? { previousScore } : {})
    });
  }

  getSupportedFileTypes(): string[] {
    return [
      '.github/workflows/*.yml',
      '.github/workflows/*.yaml',
      '.gitlab-ci.yml',
      'Dockerfile',
      'Jenkinsfile',
      'kubernetes/*.yml',
      'kubernetes/*.yaml',
      'docker-compose.yml',
      'docker-compose.yaml'
    ];
  }

  getRulesSummary() {
    return ruleRegistry.summary();
  }
}

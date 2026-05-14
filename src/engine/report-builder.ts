import { RuleResult, RuleSeverity, RuleCategory, WorkflowRuleReport } from '../rules/types';
import { RepoRiskScore, WorkflowRiskScore, ScoreTrend, RiskScorer } from './risk-scorer';

export interface AnalysisReport {
  meta: ReportMeta;
  repoScore: RepoRiskScore;
  summary: ReportSummary;
  workflows: WorkflowSummary[];
  findings: FindingsTable;
  remediationPlan: RemediationPlan;
  aiContext: AIContext;
}

export interface ReportMeta {
  scanId: string;
  repoId: string;
  generatedAt: Date;
  durationMs: number;
  rulesVersion: string;
  totalRulesRun: number;
  ciSystemsDetected: string[];
}

export interface ReportSummary {
  totalWorkflows: number;
  totalFindings: number;
  findingsBySeverity: Record<RuleSeverity, number>;
  findingsByCategory: Record<RuleCategory, number>;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  trend: ScoreTrend;
  topRisks: string[];
  blockers: RuleResult[];
  recommendations: RuleResult[];
}

export interface WorkflowSummary {
  filePath: string;
  ciSystem: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  totalFindings: number;
  findingsBySeverity: Record<RuleSeverity, number>;
  findings: RuleResult[];
  executionTimeMs: number;
}

export interface FindingsTable {
  all: RuleResult[];
  critical: RuleResult[];
  high: RuleResult[];
  medium: RuleResult[];
  low: RuleResult[];
  info: RuleResult[];
  byFile: Record<string, RuleResult[]>;
  byRule: Record<string, RuleResult[]>;
  byCategory: Record<RuleCategory, RuleResult[]>;
}

export interface RemediationPlan {
  immediateActions: RemediationAction[];
  shortTermActions: RemediationAction[];
  longTermActions: RemediationAction[];
  estimatedEffortMinutes: number;
}

export interface RemediationAction {
  priority: number;
  ruleId: string;
  title: string;
  affectedFiles: string[];
  findingCount: number;
  remediation: string;
  estimatedMinutes: number;
  severity: RuleSeverity;
}

export interface AIContext {
  repoId: string;
  scanId: string;
  overallScore: number;
  overallGrade: string;
  trend: ScoreTrend;
  criticalFindings: AIFinding[];
  highFindings: AIFinding[];
  topPatterns: string[];
  ciSystemsDetected: string[];
  hasSecurityIssues: boolean;
  hasReliabilityIssues: boolean;
  remediationPriorities: string[];
}

export interface AIFinding {
  ruleId: string;
  title: string;
  severity: string;
  category: string;
  filePath: string;
  evidence: string;
  remediation: string;
}

export class ReportBuilder {
  build(
    scanId: string,
    repoId: string,
    workflowReports: WorkflowRuleReport[],
    repoRiskScore: RepoRiskScore,
    previousScore: number | null,
    durationMs: number
  ): AnalysisReport {
    const allFindings = workflowReports.flatMap(r => r.findings);
    const findingsTable = this.buildFindingsTable(allFindings);
    const remediationPlan = this.buildRemediationPlan(allFindings);

    const workflows = workflowReports.map((report, idx) => 
      this.buildWorkflowSummary(report, repoRiskScore.workflowScores[idx])
    );

    const ciSystemsDetected = Array.from(new Set(workflowReports.map(r => r.ciSystem)));
    const totalRulesRun = workflowReports.reduce((acc, r) => acc + r.rulesRun, 0);

    const meta: ReportMeta = {
      scanId,
      repoId,
      generatedAt: new Date(),
      durationMs,
      rulesVersion: '1.0.0',
      totalRulesRun,
      ciSystemsDetected
    };

    const summary: ReportSummary = {
      totalWorkflows: workflowReports.length,
      totalFindings: allFindings.length,
      findingsBySeverity: {
        [RuleSeverity.CRITICAL]: findingsTable.critical.length,
        [RuleSeverity.HIGH]: findingsTable.high.length,
        [RuleSeverity.MEDIUM]: findingsTable.medium.length,
        [RuleSeverity.LOW]: findingsTable.low.length,
        [RuleSeverity.INFO]: findingsTable.info.length
      },
      findingsByCategory: this.aggregateCategories(allFindings),
      score: repoRiskScore.score,
      grade: repoRiskScore.grade,
      trend: new RiskScorer().calculateTrend(repoRiskScore.score, previousScore),
      topRisks: this.generateTopRisks(allFindings),
      blockers: findingsTable.critical.concat(findingsTable.high),
      recommendations: findingsTable.medium
    };

    const report: AnalysisReport = {
      meta,
      repoScore: repoRiskScore,
      summary,
      workflows,
      findings: findingsTable,
      remediationPlan,
      aiContext: this.buildAIContext(repoId, scanId, summary, findingsTable, remediationPlan)
    };

    return report;
  }

  buildWorkflowSummary(report: WorkflowRuleReport, score: WorkflowRiskScore): WorkflowSummary {
    return {
      filePath: report.filePath,
      ciSystem: report.ciSystem,
      score: score.score,
      grade: score.grade,
      totalFindings: report.findings.length,
      findingsBySeverity: score.breakdown.findingsBySeverity,
      findings: report.findings,
      executionTimeMs: report.executionTimeMs
    };
  }

  buildFindingsTable(findings: RuleResult[]): FindingsTable {
    const table: FindingsTable = {
      all: findings,
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: [],
      byFile: {},
      byRule: {},
      byCategory: {} as Record<RuleCategory, RuleResult[]>
    };

    // Sort by a heuristic: severity DESC
    const severityRank: Record<string, number> = {
      [RuleSeverity.CRITICAL]: 0,
      [RuleSeverity.HIGH]: 1,
      [RuleSeverity.MEDIUM]: 2,
      [RuleSeverity.LOW]: 3,
      [RuleSeverity.INFO]: 4
    };

    table.all.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    for (const f of table.all) {
      if (f.severity === RuleSeverity.CRITICAL) table.critical.push(f);
      else if (f.severity === RuleSeverity.HIGH) table.high.push(f);
      else if (f.severity === RuleSeverity.MEDIUM) table.medium.push(f);
      else if (f.severity === RuleSeverity.LOW) table.low.push(f);
      else if (f.severity === RuleSeverity.INFO) table.info.push(f);

      const filePath = f.location.filePath;
      if (!table.byFile[filePath]) table.byFile[filePath] = [];
      table.byFile[filePath].push(f);

      if (!table.byRule[f.ruleId]) table.byRule[f.ruleId] = [];
      table.byRule[f.ruleId].push(f);

      if (!table.byCategory[f.category]) table.byCategory[f.category] = [];
      table.byCategory[f.category].push(f);
    }

    return table;
  }

  buildRemediationPlan(findings: RuleResult[]): RemediationPlan {
    const severityRank: Record<string, number> = {
      [RuleSeverity.CRITICAL]: 0,
      [RuleSeverity.HIGH]: 1,
      [RuleSeverity.MEDIUM]: 2,
      [RuleSeverity.LOW]: 3,
      [RuleSeverity.INFO]: 4
    };
    
    const confidenceRank: Record<string, number> = {
      CERTAIN: 0,
      LIKELY: 1,
      POSSIBLE: 2
    };

    const sortedFindings = [...findings].sort((a, b) => {
      const sDiff = severityRank[a.severity] - severityRank[b.severity];
      if (sDiff !== 0) return sDiff;
      return confidenceRank[a.confidence] - confidenceRank[b.confidence];
    });

    const groups = new Map<string, RemediationAction>();

    for (const f of sortedFindings) {
      if (f.severity === RuleSeverity.INFO) continue;

      if (!groups.has(f.ruleId)) {
        groups.set(f.ruleId, {
          priority: severityRank[f.severity] + 1,
          ruleId: f.ruleId,
          title: f.title,
          affectedFiles: [],
          findingCount: 0,
          remediation: f.remediation,
          estimatedMinutes: 0,
          severity: f.severity
        });
      }
      
      const g = groups.get(f.ruleId)!;
      g.findingCount++;
      if (!g.affectedFiles.includes(f.location.filePath)) {
        g.affectedFiles.push(f.location.filePath);
      }
    }

    const immediateActions: RemediationAction[] = [];
    const shortTermActions: RemediationAction[] = [];
    const longTermActions: RemediationAction[] = [];

    let estimatedEffortMinutes = 0;

    for (const action of groups.values()) {
      if (action.severity === RuleSeverity.CRITICAL) {
        action.estimatedMinutes = action.findingCount * 30;
        immediateActions.push(action);
      } else if (action.severity === RuleSeverity.HIGH) {
        action.estimatedMinutes = action.findingCount * 20;
        shortTermActions.push(action);
      } else if (action.severity === RuleSeverity.MEDIUM) {
        action.estimatedMinutes = action.findingCount * 10;
        longTermActions.push(action);
      } else if (action.severity === RuleSeverity.LOW) {
        action.estimatedMinutes = action.findingCount * 5;
        longTermActions.push(action);
      }
      estimatedEffortMinutes += action.estimatedMinutes;
    }

    immediateActions.sort((a, b) => b.findingCount - a.findingCount);
    shortTermActions.sort((a, b) => b.findingCount - a.findingCount);
    longTermActions.sort((a, b) => b.findingCount - a.findingCount);

    return {
      immediateActions,
      shortTermActions,
      longTermActions,
      estimatedEffortMinutes
    };
  }

  buildAIContext(
    repoId: string, 
    scanId: string, 
    summary: ReportSummary, 
    findingsTable: FindingsTable, 
    plan: RemediationPlan
  ): AIContext {
    
    const topPatterns: string[] = [];
    const ruleCounts = Object.entries(findingsTable.byRule)
      .map(([ruleId, finds]) => ({ ruleId, count: finds.length, name: finds[0].ruleName }))
      .filter(x => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    for (const rc of ruleCounts) {
      topPatterns.push(`${rc.count} ${rc.name} findings`);
    }

    const priorities = [
      ...plan.immediateActions.slice(0, 5),
      ...plan.shortTermActions.slice(0, 3)
    ].map(a => `Fix ${a.title} in ${a.affectedFiles[0]}`);

    return {
      repoId,
      scanId,
      overallScore: summary.score,
      overallGrade: summary.grade,
      trend: summary.trend,
      criticalFindings: findingsTable.critical.map(this.toAIFinding),
      highFindings: findingsTable.high.map(this.toAIFinding),
      topPatterns,
      ciSystemsDetected: [], // handled above
      hasSecurityIssues: findingsTable.byCategory[RuleCategory.SECURITY]?.length > 0,
      hasReliabilityIssues: findingsTable.byCategory[RuleCategory.RELIABILITY]?.length > 0,
      remediationPriorities: priorities
    };
  }

  private aggregateCategories(findings: RuleResult[]): Record<RuleCategory, number> {
    const res: Record<RuleCategory, number> = {
      [RuleCategory.SECURITY]: 0,
      [RuleCategory.RELIABILITY]: 0,
      [RuleCategory.PERFORMANCE]: 0,
      [RuleCategory.MAINTAINABILITY]: 0,
      [RuleCategory.DEPENDENCY]: 0,
      [RuleCategory.DAG]: 0
    };
    for (const f of findings) res[f.category]++;
    return res;
  }

  private generateTopRisks(findings: RuleResult[]): string[] {
    const risks: string[] = [];
    const groups = new Map<string, { count: number, msg: string }>();
    
    for (const f of findings) {
      if (f.severity !== RuleSeverity.CRITICAL && f.severity !== RuleSeverity.HIGH) continue;
      if (!groups.has(f.ruleId)) {
        groups.set(f.ruleId, { count: 0, msg: f.title });
      }
      groups.get(f.ruleId)!.count++;
    }

    const sorted = Array.from(groups.values()).sort((a, b) => b.count - a.count).slice(0, 3);
    for (const s of sorted) {
      risks.push(`${s.count} findings: ${s.msg}`);
    }
    return risks;
  }

  private toAIFinding(f: RuleResult): AIFinding {
    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      category: f.category,
      filePath: f.location.filePath,
      evidence: f.evidence,
      remediation: f.remediation
    };
  }
}

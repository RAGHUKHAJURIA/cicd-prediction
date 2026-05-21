import { RuleResult, RuleSeverity, RuleConfidence, RuleCategory } from '../rules/types';

export interface WorkflowRiskScore {
  workflowId: string;
  filePath: string;
  ciSystem: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  breakdown: ScoreBreakdown;
}

export interface RepoRiskScore {
  repoId: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  trend: ScoreTrend;
  totalFindings: number;
  totalWorkflows: number;
  workflowScores: WorkflowRiskScore[];
  worstWorkflow: WorkflowRiskScore | null;
  topRisks: RuleResult[];
}

export type ScoreTrend = 'new' | 'improving' | 'stable' | 'degrading';

export interface ScoreBreakdown {
  totalFindings: number;
  findingsBySeverity: Record<RuleSeverity, number>;
  findingsByCategory: Record<RuleCategory, number>;
  topContributors: RuleContribution[];
  rawPointsBeforeCap: number;
  finalScore: number;
  grade: string;
  penaltiesApplied: string[];
}

export interface RuleContribution {
  ruleId: string;
  ruleName: string;
  category: RuleCategory;
  findingCount: number;
  pointsContributed: number;
  topFinding: RuleResult;
}

export class RiskScorer {
  private readonly SEVERITY_WEIGHTS: Record<RuleSeverity, number> = {
    [RuleSeverity.CRITICAL]: 20,
    [RuleSeverity.HIGH]:     8,
    [RuleSeverity.MEDIUM]:   3,
    [RuleSeverity.LOW]:      1,
    [RuleSeverity.INFO]:     0
  };

  private readonly CONFIDENCE_MULTIPLIERS: Record<RuleConfidence, number> = {
    [RuleConfidence.CERTAIN]:  1.0,
    [RuleConfidence.LIKELY]:   0.8,
    [RuleConfidence.POSSIBLE]: 0.5
  };

  private readonly CATEGORY_WEIGHTS: Record<RuleCategory, number> = {
    [RuleCategory.SECURITY]:        1.5,
    [RuleCategory.RELIABILITY]:     1.2,
    [RuleCategory.DEPENDENCY]:      1.1,
    [RuleCategory.DAG]:             1.0,
    [RuleCategory.PERFORMANCE]:     0.8,
    [RuleCategory.MAINTAINABILITY]: 0.6
  };

  private readonly MAX_SCORE = 100;

  calculateWorkflowScore(findings: RuleResult[]): WorkflowRiskScore {
    let rawScore = 0;
    const ruleOccurrences: Record<string, number> = {};
    const penaltiesApplied: string[] = [];
    const ruleContributions = new Map<string, RuleContribution>();

    const findingsBySeverity: Record<RuleSeverity, number> = {
      [RuleSeverity.CRITICAL]: 0,
      [RuleSeverity.HIGH]: 0,
      [RuleSeverity.MEDIUM]: 0,
      [RuleSeverity.LOW]: 0,
      [RuleSeverity.INFO]: 0
    };

    const findingsByCategory: Record<RuleCategory, number> = {
      [RuleCategory.SECURITY]: 0,
      [RuleCategory.RELIABILITY]: 0,
      [RuleCategory.PERFORMANCE]: 0,
      [RuleCategory.MAINTAINABILITY]: 0,
      [RuleCategory.DEPENDENCY]: 0,
      [RuleCategory.DAG]: 0
    };

    let hasCritical = false;

    for (const finding of findings) {
      findingsBySeverity[finding.severity]++;
      findingsByCategory[finding.category]++;
      if (finding.severity === RuleSeverity.CRITICAL) hasCritical = true;

      if (!ruleOccurrences[finding.ruleId]) {
        ruleOccurrences[finding.ruleId] = 0;
      }
      ruleOccurrences[finding.ruleId]++;
      const N = ruleOccurrences[finding.ruleId];

      const rawPoints = 
        this.SEVERITY_WEIGHTS[finding.severity] * 
        this.CONFIDENCE_MULTIPLIERS[finding.confidence] * 
        (this.CATEGORY_WEIGHTS[finding.category] || 1.0);
      
      const points = rawPoints * (1 / Math.sqrt(N));
      rawScore += points;

      if (!ruleContributions.has(finding.ruleId)) {
        ruleContributions.set(finding.ruleId, {
          ruleId: finding.ruleId,
          ruleName: finding.ruleName,
          category: finding.category,
          findingCount: 0,
          pointsContributed: 0,
          topFinding: finding
        });
      }
      const contrib = ruleContributions.get(finding.ruleId)!;
      contrib.findingCount++;
      contrib.pointsContributed += points;
    }

    const rawPointsBeforeCap = rawScore;

    if (hasCritical) {
      if (rawScore < 50) {
        penaltiesApplied.push("CRITICAL finding floor applied (+50 minimum)");
        rawScore = Math.max(rawScore, 50);
      }
    }
    
    if (findings.length >= 20) {
      if (rawScore < 30) {
        penaltiesApplied.push("High volume of findings floor applied (+30 minimum)");
        rawScore = Math.max(rawScore, 30);
      }
    }

    rawScore = Math.min(rawScore, this.MAX_SCORE);

    const grade = this.calculateGrade(rawScore);

    const topContributors = Array.from(ruleContributions.values())
      .sort((a, b) => b.pointsContributed - a.pointsContributed)
      .slice(0, 5);

    const breakdown: ScoreBreakdown = {
      totalFindings: findings.length,
      findingsBySeverity,
      findingsByCategory,
      topContributors,
      rawPointsBeforeCap,
      finalScore: rawScore,
      grade,
      penaltiesApplied
    };

    // Default return for cases where workflowId etc are needed by caller:
    // These will typically be merged with the report in a higher level.
    return {
      workflowId: '',
      filePath: '',
      ciSystem: '',
      score: rawScore,
      grade,
      totalFindings: findings.length,
      criticalCount: findingsBySeverity[RuleSeverity.CRITICAL],
      highCount: findingsBySeverity[RuleSeverity.HIGH],
      mediumCount: findingsBySeverity[RuleSeverity.MEDIUM],
      lowCount: findingsBySeverity[RuleSeverity.LOW],
      infoCount: findingsBySeverity[RuleSeverity.INFO],
      breakdown
    };
  }

  calculateRepoScore(workflowScores: WorkflowRiskScore[]): RepoRiskScore {
    if (workflowScores.length === 0) {
      return {
        repoId: '',
        score: 0,
        grade: 'A',
        trend: 'new',
        totalFindings: 0,
        totalWorkflows: 0,
        workflowScores: [],
        worstWorkflow: null,
        topRisks: []
      };
    }

    let maxWorkflowScore = 0;
    let worstWorkflow: WorkflowRiskScore | null = null;
    let totalFindings = 0;



    for (const ws of workflowScores) {
      if (ws.score > maxWorkflowScore) {
        maxWorkflowScore = ws.score;
        worstWorkflow = ws;
      }
      totalFindings += ws.totalFindings;
      // We don't have all findings here easily without passing them, but the method signatures
      // imply we calculate topRisks at the repo level. We will leave topRisks to be populated by ReportBuilder.
    }

    const workflowsWithIssues = workflowScores.filter(s => s.score > 0).length;
    const bonus = Math.max(0, (workflowsWithIssues - 1) * 2);

    const repoScore = Math.min(maxWorkflowScore + bonus, this.MAX_SCORE);
    const grade = this.calculateGrade(repoScore);

    return {
      repoId: '', // Filled by orchestrator
      score: repoScore,
      grade,
      trend: 'new', // Calculated separately
      totalFindings,
      totalWorkflows: workflowScores.length,
      workflowScores,
      worstWorkflow,
      topRisks: [] // Handled by ReportBuilder
    };
  }

  calculateTrend(currentScore: number, previousScore: number | null): ScoreTrend {
    if (previousScore === null) return 'new';
    if (currentScore < previousScore - 5) return 'improving';
    if (currentScore > previousScore + 5) return 'degrading';
    return 'stable';
  }

  getScoreBreakdown(findings: RuleResult[]): ScoreBreakdown {
    return this.calculateWorkflowScore(findings).breakdown;
  }

  private calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score <= 9) return 'A';
    if (score <= 24) return 'B';
    if (score <= 44) return 'C';
    if (score <= 69) return 'D';
    return 'F';
  }
}

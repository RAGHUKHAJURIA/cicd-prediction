import { claudeClient, ClaudeClient } from './claude-client';
import { tokenCounter } from './token-counter';
import {
  AITaskType, AIResult, FindingExplanation,
  ScanExplanation
} from './ai-response.types';
import { AIContext, AIFinding } from '../engine/report-builder';

export class ExplanationEngine {
  constructor(private client: ClaudeClient = claudeClient) {}

  async explainFinding(
    finding: AIFinding,
    repoContext: Pick<AIContext, 'repoId' | 'ciSystemsDetected'>,
    scanId: string
  ): Promise<AIResult<FindingExplanation>> {
    const systemPrompt = `You are a senior DevOps reliability engineer with deep expertise
in CI/CD security and reliability. You explain technical pipeline
issues clearly and concisely to software developers.
Your explanations are accurate, specific, and actionable.
You never exaggerate risks or use fear-mongering language.
You always explain the practical failure scenario, not just the theory.
You must respond with ONLY valid JSON matching the exact schema provided.`;

    const userPrompt = `Analyze this CI/CD finding and provide a detailed explanation.

FINDING:
Rule: ${finding.ruleId}
Severity: ${finding.severity}
Category: ${finding.category}
File: ${finding.filePath}
Issue: ${finding.title}
Evidence: ${finding.evidence}
CI System: ${repoContext.ciSystemsDetected.join(', ')}

Provide your analysis in this EXACT JSON schema:
{
  "ruleId": "${finding.ruleId}",
  "plainEnglishRisk": "2-3 sentence explanation a developer can understand",
  "technicalDetail": "1-2 sentence technical specifics",
  "failureScenario": "what will actually break in production",
  "businessImpact": "why a tech lead or manager should care",
  "confidence": "high | medium | low"
}

Rules for your response:
- plainEnglishRisk: no jargon, written for a mid-level developer
- failureScenario: be specific about WHEN and HOW failure occurs
- businessImpact: focus on time, money, or user impact
- confidence: "high" if the risk is certain, "medium" if likely,
  "low" if this is a potential risk depending on context
- All fields are required strings
- Do not include any fields not in the schema above`;

    return this.client.completeJSON<FindingExplanation>(
      AITaskType.EXPLAIN_FINDING,
      systemPrompt,
      userPrompt,
      { maxTokens: 600, scanId, repoId: repoContext.repoId, metadata: { ruleId: finding.ruleId, severity: finding.severity } }
    );
  }

  async explainScan(
    aiContext: AIContext,
    scanId: string
  ): Promise<AIResult<ScanExplanation>> {
    const systemPrompt = `You are a senior DevOps reliability engineer with deep expertise
in CI/CD security and reliability. You explain technical pipeline
issues clearly and concisely to software developers.
Your explanations are accurate, specific, and actionable.
You never exaggerate risks or use fear-mongering language.
You always explain the practical failure scenario, not just the theory.
You must respond with ONLY valid JSON matching the exact schema provided.
You are analyzing a complete CI/CD security and reliability
scan across multiple pipeline files. Provide strategic analysis
that helps engineering teams understand their overall pipeline health
and prioritize remediation work.`;

    const parts = [
      { name: 'critical', priority: 5, minTokens: 200 },
      { name: 'high', priority: 4, minTokens: 150 },
      { name: 'context', priority: 3, minTokens: 100 },
      { name: 'patterns', priority: 2, minTokens: 50 }
    ];

    const budget = tokenCounter.budgetSplit(3000, parts);

    const contextSection = `SCAN OVERVIEW:
Repository: ${aiContext.repoId}
Overall Score: ${aiContext.overallScore}/100 (Grade: ${aiContext.overallGrade})
Trend: ${aiContext.trend}
CI Systems: ${aiContext.ciSystemsDetected.join(', ')}
Has Security Issues: ${aiContext.hasSecurityIssues}
Has Reliability Issues: ${aiContext.hasReliabilityIssues}
Total Critical Findings: ${aiContext.criticalFindings.length}
Total High Findings: ${aiContext.highFindings.length}`;

    let criticalSection = `CRITICAL FINDINGS:\n`;
    for (const f of aiContext.criticalFindings) {
      criticalSection += `- [${f.ruleId}] ${f.title} in ${f.filePath} | Evidence: ${f.evidence}\n`;
    }
    const critTrunc = tokenCounter.truncateToFit(criticalSection, budget.critical, '...[truncated]');
    if (critTrunc.truncated) {
      criticalSection = critTrunc.text;
    }

    let highSection = `HIGH SEVERITY FINDINGS:\n`;
    for (const f of aiContext.highFindings) {
      highSection += `- [${f.ruleId}] ${f.title} in ${f.filePath} | Evidence: ${f.evidence}\n`;
    }
    const highTrunc = tokenCounter.truncateToFit(highSection, budget.high, '...[truncated]');
    if (highTrunc.truncated) {
      highSection = highTrunc.text;
    }

    const patternsSection = `RECURRING PATTERNS:\n${aiContext.topPatterns.join('\n')}`;

    const userPrompt = `${contextSection}\n\n${criticalSection}\n\n${highSection}\n\n${patternsSection}\n\nRespond with this EXACT JSON schema:
{
  "executiveSummary": "3-5 sentences for engineering manager",
  "technicalSummary": "3-5 sentences for the developer fixing issues",
  "topRisks": [
    {
      "rank": 1,
      "title": "short risk title",
      "narrative": "2-3 sentence explanation",
      "affectedFiles": ["file1", "file2"],
      "severity": "critical|high|medium|low"
    }
  ],
  "overallHealthAssessment": "one sentence starting with 'This pipeline is...'",
  "prioritizedActionPlan": [
    {
      "priority": 1,
      "action": "what to do in plain English",
      "reasoning": "why this priority",
      "estimatedEffort": "minutes|hours|days",
      "ruleIds": ["rule-id-1"]
    }
  ]
}

Requirements:
- topRisks: exactly 3 items, ranked by severity and impact
- prioritizedActionPlan: 3-7 items, ordered by priority ascending
- executiveSummary: suitable for a VP of Engineering
- technicalSummary: assumes reader is a senior developer
- overallHealthAssessment: exactly one sentence`;

    return this.client.completeJSON<ScanExplanation>(
      AITaskType.EXPLAIN_SCAN,
      systemPrompt,
      userPrompt,
      { maxTokens: 1500, scanId, repoId: aiContext.repoId }
    );
  }

  private buildFindingKey(finding: AIFinding): string {
    return `${finding.ruleId}:${finding.filePath}`;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async explainMultipleFindings(
    findings: AIFinding[],
    aiContext: AIContext,
    scanId: string,
    options?: { maxFindings?: number }
  ): Promise<Map<string, AIResult<FindingExplanation>>> {
    const maxFindings = options?.maxFindings || 10;
    
    const severityRank: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4
    };

    const sortedFindings = [...findings].sort((a, b) => {
      const aRank = severityRank[a.severity.toLowerCase()] ?? 5;
      const bRank = severityRank[b.severity.toLowerCase()] ?? 5;
      return aRank - bRank;
    });

    const toProcess = sortedFindings.slice(0, maxFindings);
    const resultsMap = new Map<string, AIResult<FindingExplanation>>();

    for (const finding of toProcess) {
      const result = await this.explainFinding(finding, aiContext, scanId);
      resultsMap.set(this.buildFindingKey(finding), result);
      await this.sleep(200);
    }

    return resultsMap;
  }
}

export const explanationEngine = new ExplanationEngine();

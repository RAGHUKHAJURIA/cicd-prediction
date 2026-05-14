import { claudeClient, ClaudeClient } from './claude-client';
import {
  AITaskType, AIResult, FailurePrediction, SingleFailurePrediction
} from './ai-response.types';
import { AIContext, AIFinding } from '../engine/report-builder';

export class FailurePredictor {
  constructor(private client: ClaudeClient = claudeClient) {}

  async predictFailures(
    aiContext: AIContext,
    scanId: string
  ): Promise<AIResult<FailurePrediction>> {
    const systemPrompt = `You are a site reliability engineer who has seen hundreds of
CI/CD pipeline failures in production. Based on pipeline
configuration findings, you predict realistic failure scenarios.
You are specific about triggers, failure modes, and detectability.
You avoid theoretical risks and focus on what has actually been
known to fail in similar configurations.
You must respond with ONLY valid JSON matching the schema provided.`;

    const userPrompt = `PIPELINE CONFIGURATION FINDINGS FOR FAILURE ANALYSIS:

Repository: ${aiContext.repoId}
Score: ${aiContext.overallScore}/100 (Grade: ${aiContext.overallGrade})
CI Systems in use: ${aiContext.ciSystemsDetected.join(', ')}

CRITICAL FINDINGS (immediate failure risk):
${aiContext.criticalFindings.map(f =>
  `• ${f.ruleId}: ${f.title}\n  File: ${f.filePath}\n  Evidence: ${f.evidence}`
).join('\n')}

HIGH SEVERITY FINDINGS (likely failure risk):
${aiContext.highFindings.slice(0, 8).map(f =>
  `• ${f.ruleId}: ${f.title}\n  File: ${f.filePath}`
).join('\n')}

RECURRING PATTERNS OBSERVED:
${aiContext.topPatterns.join('\n')}

{
  "scanId": "${scanId}",
  "predictions": [
    {
      "ruleId": "the rule id that triggers this prediction",
      "filePath": "the file containing the issue",
      "trigger": "what event causes this failure",
      "failureMode": "what actually breaks when triggered",
      "detectability": "obvious|subtle|silent",
      "likelihood": "very_likely|likely|possible|unlikely",
      "impact": "deployment_failure|security_breach|data_loss|service_degradation|slow_builds|developer_confusion|compliance_violation"
    }
  ],
  "overallRiskLevel": "critical|high|medium|low",
  "timeToFailureEstimate": "qualitative time estimate",
  "mostLikelyFailureScenario": "2-3 sentences on most likely failure",
  "confidenceStatement": "how confident are these predictions and why"
}

Requirements:
- predictions: 1 per critical finding, up to 3 from high findings
- predictions sorted by likelihood DESC then impact severity DESC
- timeToFailureEstimate: be realistic, not alarmist
- overallRiskLevel: based on the worst prediction likelihood+impact
- confidenceStatement: be honest about uncertainty`;

    return this.client.completeJSON<FailurePrediction>(
      AITaskType.PREDICT_FAILURE,
      systemPrompt,
      userPrompt,
      { maxTokens: 1000, scanId, repoId: aiContext.repoId }
    );
  }

  async predictSingleFinding(
    finding: AIFinding,
    scanId: string,
    repoId: string
  ): Promise<AIResult<SingleFailurePrediction>> {
    const systemPrompt = `You are a site reliability engineer who has seen hundreds of
CI/CD pipeline failures in production. Based on pipeline
configuration findings, you predict realistic failure scenarios.
You are specific about triggers, failure modes, and detectability.
You avoid theoretical risks and focus on what has actually been
known to fail in similar configurations.
You must respond with ONLY valid JSON matching the schema provided.`;

    const userPrompt = `Predict the failure scenario for this specific CI/CD finding.

FINDING:
Rule: ${finding.ruleId}
Issue: ${finding.title}
File: ${finding.filePath}
Evidence: ${finding.evidence}
Severity: ${finding.severity}
Category: ${finding.category}

Respond with this EXACT JSON:
{
  "ruleId": "${finding.ruleId}",
  "filePath": "${finding.filePath}",
  "trigger": "specific event that triggers failure",
  "failureMode": "what breaks when triggered",
  "detectability": "obvious|subtle|silent",
  "likelihood": "very_likely|likely|possible|unlikely",
  "impact": "deployment_failure|security_breach|data_loss|service_degradation|slow_builds|developer_confusion|compliance_violation"
}`;

    return this.client.completeJSON<SingleFailurePrediction>(
      AITaskType.PREDICT_FAILURE,
      systemPrompt,
      userPrompt,
      { maxTokens: 1000, scanId, repoId }
    );
  }
}

export const failurePredictor = new FailurePredictor();

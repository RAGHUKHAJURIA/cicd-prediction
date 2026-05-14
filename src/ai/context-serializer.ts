import { AITaskType } from './prompt-templates';
import type { AIContext, AIFinding } from '../engine/report-builder';

export interface SerializerOptions {
  maxFindings: number;
  maxEvidenceLength: number;
  maxRemediationLength: number;
  includeLowSeverity: boolean;
  taskType: AITaskType;
  tokenBudget: number;
}

export interface SerializedContext {
  text: string;
  estimatedTokens: number;
  findingsIncluded: number;
  findingsTruncated: number;
  truncated: boolean;
}

export class ContextSerializer {
  private readonly DEFAULT_OPTIONS: SerializerOptions = {
    maxFindings: 20,
    maxEvidenceLength: 200,
    maxRemediationLength: 300,
    includeLowSeverity: false,
    taskType: AITaskType.EXPLAIN,
    tokenBudget: 3000
  };

  private truncateString(s: string, maxLength: number): string {
    if (s.length <= maxLength) return s;
    return s.slice(0, maxLength - 3) + '...';
  }

  private severityOrder(severity: string): number {
    const s = severity.toUpperCase();
    if (s === 'CRITICAL') return 0;
    if (s === 'HIGH') return 1;
    if (s === 'MEDIUM') return 2;
    if (s === 'LOW') return 3;
    if (s === 'INFO') return 4;
    return 5;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  serialize(context: AIContext, options?: Partial<SerializerOptions>): SerializedContext {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    
    // Merge findings
    const allFindings: AIFinding[] = [
      ...context.criticalFindings,
      ...context.highFindings
    ];
    
    // Optional arrays that might be passed in tests or future versions
    const anyCtx = context as any;
    if (anyCtx.mediumFindings) {
      allFindings.push(...anyCtx.mediumFindings);
    }
    
    if (opts.includeLowSeverity) {
      if (anyCtx.lowFindings) allFindings.push(...anyCtx.lowFindings);
      if (anyCtx.infoFindings) allFindings.push(...anyCtx.infoFindings);
    }

    allFindings.sort((a, b) => this.severityOrder(a.severity) - this.severityOrder(b.severity));

    let findingsToProcess = [...allFindings];
    let findingsTruncatedCount = 0;
    
    if (findingsToProcess.length > opts.maxFindings) {
      findingsTruncatedCount = findingsToProcess.length - opts.maxFindings;
      findingsToProcess = findingsToProcess.slice(0, opts.maxFindings);
    }

    let isTruncated = findingsTruncatedCount > 0;
    
    // Build and check budget
    while (true) {
      let text = `## Repository Risk Assessment
Score: ${context.overallScore}/100 | Grade: ${context.overallGrade} | Trend: ${context.trend}
CI Systems: ${context.ciSystemsDetected.join(', ')}
Security Issues: ${context.hasSecurityIssues ? 'YES' : 'No'}
Reliability Issues: ${context.hasReliabilityIssues ? 'YES' : 'No'}

## Top Risk Patterns
${context.topPatterns.map((p, i) => `${i+1}. ${p}`).join('\n')}

## Priority Fix Order
${context.remediationPriorities.map((p, i) => `${i+1}. ${p}`).join('\n')}

## Findings (${allFindings.length} total, showing ${findingsToProcess.length})
`;

      for (const f of findingsToProcess) {
        text += `### [${f.severity.toUpperCase()}] ${f.title}
Rule: ${f.ruleId}
File: ${f.filePath}
Category: ${f.category}
Evidence: ${this.truncateString(f.evidence, opts.maxEvidenceLength)}
Suggested Fix: ${this.truncateString(f.remediation, opts.maxRemediationLength)}
---
`;
      }

      const estimatedTokens = this.estimateTokens(text);
      if (estimatedTokens <= opts.tokenBudget || findingsToProcess.length <= 3) {
        return {
          text,
          estimatedTokens,
          findingsIncluded: findingsToProcess.length,
          findingsTruncated: allFindings.length - findingsToProcess.length,
          truncated: isTruncated
        };
      }

      // Over budget, reduce by 20%
      isTruncated = true;
      const removeCount = Math.max(1, Math.floor(findingsToProcess.length * 0.2));
      findingsToProcess = findingsToProcess.slice(0, findingsToProcess.length - removeCount);
    }
  }

  serializeForTask(context: AIContext, taskType: AITaskType, tokenBudget?: number): SerializedContext {
    let opts: Partial<SerializerOptions> = { taskType, tokenBudget: tokenBudget || this.DEFAULT_OPTIONS.tokenBudget };
    
    switch (taskType) {
      case AITaskType.EXPLAIN:
        opts.maxFindings = 15;
        opts.includeLowSeverity = false;
        opts.maxEvidenceLength = 150;
        opts.maxRemediationLength = 100;
        break;
      case AITaskType.REMEDIATE:
        opts.maxFindings = 10;
        opts.includeLowSeverity = false;
        opts.maxEvidenceLength = 200;
        opts.maxRemediationLength = 400;
        break;
      case AITaskType.PREDICT:
        opts.maxFindings = 12;
        opts.includeLowSeverity = false;
        opts.maxEvidenceLength = 200;
        opts.maxRemediationLength = 100;
        break;
      case AITaskType.SUMMARIZE:
        opts.maxFindings = 5;
        opts.includeLowSeverity = false;
        opts.maxEvidenceLength = 100;
        opts.maxRemediationLength = 100;
        break;
    }
    
    return this.serialize(context, opts);
  }
}

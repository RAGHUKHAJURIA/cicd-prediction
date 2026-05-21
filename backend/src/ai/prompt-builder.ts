import { AITaskType, SYSTEM_PROMPTS, buildExplainPrompt, buildRemediatePrompt, buildPredictPrompt, buildSummarizePrompt, OUTPUT_SCHEMAS } from './prompt-templates';
import { ContextSerializer, SerializedContext, SerializerOptions } from './context-serializer';
import type { AIContext } from '../engine/report-builder';

export interface BuiltPrompt {
  taskType: AITaskType;
  systemPrompt: string;
  userPrompt: string;
  estimatedInputTokens: number;
  estimatedCostUsd: number;
  serializedContext: SerializedContext;
  metadata: PromptMetadata;
}

export interface PromptMetadata {
  repoId: string;
  scanId: string;
  taskType: AITaskType;
  findingsIncluded: number;
  findingsTruncated: boolean;
  builtAt: Date;
  modelTarget: string;
}

export interface PromptBuilderOptions {
  tokenBudget?: number;
  includeLowSeverity?: boolean;
  maxFindings?: number;
}

export interface CostEstimate {
  totalEstimatedInputTokens: number;
  totalEstimatedOutputTokens: number;
  estimatedCostUsd: number;
  breakdown: {
    taskType: AITaskType;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }[];
}

export interface PromptValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class PromptBuilder {
  private serializer: ContextSerializer;

  constructor() {
    this.serializer = new ContextSerializer();
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  build(context: AIContext, taskType: AITaskType, options?: PromptBuilderOptions): BuiltPrompt {
    const totalBudget = options?.tokenBudget ?? 4000;
    const contextBudget = Math.floor(totalBudget * 0.75);

    let serializerOpts: Partial<SerializerOptions> = { tokenBudget: contextBudget };
    
    switch(taskType) {
      case AITaskType.EXPLAIN: serializerOpts = { ...serializerOpts, maxFindings: 15, includeLowSeverity: false, maxEvidenceLength: 150, maxRemediationLength: 100 }; break;
      case AITaskType.REMEDIATE: serializerOpts = { ...serializerOpts, maxFindings: 10, includeLowSeverity: false, maxEvidenceLength: 200, maxRemediationLength: 400 }; break;
      case AITaskType.PREDICT: serializerOpts = { ...serializerOpts, maxFindings: 12, includeLowSeverity: false, maxEvidenceLength: 200, maxRemediationLength: 100 }; break;
      case AITaskType.SUMMARIZE: serializerOpts = { ...serializerOpts, maxFindings: 5, includeLowSeverity: false, maxEvidenceLength: 100, maxRemediationLength: 100 }; break;
    }
    
    if (options?.includeLowSeverity !== undefined) serializerOpts.includeLowSeverity = options.includeLowSeverity;
    if (options?.maxFindings !== undefined) serializerOpts.maxFindings = options.maxFindings;

    const serialized = this.serializer.serialize(context, serializerOpts);

    const systemPrompt = SYSTEM_PROMPTS[taskType];
    let userPrompt = '';

    switch (taskType) {
      case AITaskType.EXPLAIN:
        userPrompt = buildExplainPrompt(serialized.text);
        break;
      case AITaskType.REMEDIATE:
        userPrompt = buildRemediatePrompt(serialized.text);
        break;
      case AITaskType.PREDICT:
        userPrompt = buildPredictPrompt(serialized.text);
        break;
      case AITaskType.SUMMARIZE:
        userPrompt = buildSummarizePrompt(serialized.text);
        break;
    }

    const totalSystemTokens = this.estimateTokens(systemPrompt);
    const totalUserTokens = this.estimateTokens(userPrompt);
    const estimatedInputTokens = totalSystemTokens + totalUserTokens;
    const estimatedCostUsd = (estimatedInputTokens / 1_000_000) * 3;

    return {
      taskType,
      systemPrompt,
      userPrompt,
      estimatedInputTokens,
      estimatedCostUsd,
      serializedContext: serialized,
      metadata: {
        repoId: context.repoId,
        scanId: context.scanId,
        taskType,
        findingsIncluded: serialized.findingsIncluded,
        findingsTruncated: serialized.truncated,
        builtAt: new Date(),
        modelTarget: 'claude-sonnet-4-20250514'
      }
    };
  }

  buildAll(context: AIContext, options?: PromptBuilderOptions): Record<AITaskType, BuiltPrompt> {
    return {
      [AITaskType.EXPLAIN]: this.build(context, AITaskType.EXPLAIN, options),
      [AITaskType.REMEDIATE]: this.build(context, AITaskType.REMEDIATE, options),
      [AITaskType.PREDICT]: this.build(context, AITaskType.PREDICT, options),
      [AITaskType.SUMMARIZE]: this.build(context, AITaskType.SUMMARIZE, options)
    };
  }

  estimateCost(contexts: AIContext[], taskTypes: AITaskType[]): CostEstimate {
    let totalInput = 0;
    let totalOutput = 0;
    const breakdown: CostEstimate['breakdown'] = [];

    for (const ctx of contexts) {
      for (const t of taskTypes) {
        const prompt = this.build(ctx, t);
        const inTokens = prompt.estimatedInputTokens;
        let outTokens = 0;
        
        switch (t) {
          case AITaskType.EXPLAIN: outTokens = prompt.serializedContext.findingsIncluded * 100; break;
          case AITaskType.REMEDIATE: outTokens = prompt.serializedContext.findingsIncluded * 200; break;
          case AITaskType.PREDICT: outTokens = prompt.serializedContext.findingsIncluded * 150; break;
          case AITaskType.SUMMARIZE: outTokens = 300; break;
        }

        const cost = (inTokens / 1_000_000) * 3;
        totalInput += inTokens;
        totalOutput += outTokens;
        breakdown.push({
          taskType: t,
          inputTokens: inTokens,
          outputTokens: outTokens,
          costUsd: cost
        });
      }
    }

    return {
      totalEstimatedInputTokens: totalInput,
      totalEstimatedOutputTokens: totalOutput,
      estimatedCostUsd: (totalInput / 1_000_000) * 3,
      breakdown
    };
  }

  validate(prompt: BuiltPrompt): PromptValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!prompt.systemPrompt || prompt.systemPrompt.trim() === '') {
      errors.push('systemPrompt is empty');
    }
    if (!prompt.userPrompt || prompt.userPrompt.trim() === '') {
      errors.push('userPrompt is empty');
    }
    if (!prompt.userPrompt.includes(prompt.serializedContext.text)) {
      errors.push('userPrompt does not contain serialized context text');
    }
    if (!prompt.userPrompt.includes('valid JSON')) {
      errors.push('userPrompt does not contain valid JSON instruction');
    }

    const schemaStr = OUTPUT_SCHEMAS[prompt.taskType];
    if (schemaStr && !prompt.userPrompt.includes(schemaStr)) {
      errors.push('userPrompt does not contain the schema for this task type');
    }

    if (prompt.estimatedInputTokens > 8000) {
      errors.push(`estimatedInputTokens (${prompt.estimatedInputTokens}) exceeds 8000`);
    }

    if (prompt.serializedContext.findingsIncluded < 1) {
      errors.push('no findings');
      warnings.push('no findings');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

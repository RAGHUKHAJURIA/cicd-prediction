import { APICost } from './ai-response.types';

export class TokenCounter {
  private readonly CHARS_PER_TOKEN = 3.5;

  private readonly MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    'claude-sonnet-4-20250514': 200000,
    'claude-opus-4-20250514':   200000,
    'claude-haiku-4-5-20251001': 200000
  };

  private readonly MODEL_OUTPUT_LIMITS: Record<string, number> = {
    'claude-sonnet-4-20250514': 8192,
    'claude-opus-4-20250514':   8192,
    'claude-haiku-4-5-20251001': 8192
  };

  private readonly MODEL_COSTS_PER_1K: Record<string, { input: number, output: number }> = {
    'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
    'claude-opus-4-20250514':   { input: 0.015, output: 0.075 },
    'claude-haiku-4-5-20251001': { input: 0.00025, output: 0.00125 }
  };

  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  estimatePromptTokens(systemPrompt: string, userPrompt: string): number {
    return this.estimateTokens(systemPrompt) + this.estimateTokens(userPrompt) + 10;
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): APICost {
    const costs = this.MODEL_COSTS_PER_1K[model] || this.MODEL_COSTS_PER_1K['claude-sonnet-4-20250514'];
    const inputCostUsd = parseFloat(((inputTokens / 1000) * costs.input).toFixed(6));
    const outputCostUsd = parseFloat(((outputTokens / 1000) * costs.output).toFixed(6));
    return {
      inputCostUsd,
      outputCostUsd,
      totalCostUsd: parseFloat((inputCostUsd + outputCostUsd).toFixed(6))
    };
  }

  getContextWindow(model: string): number {
    return this.MODEL_CONTEXT_WINDOWS[model] || 200000;
  }

  getOutputLimit(model: string): number {
    return this.MODEL_OUTPUT_LIMITS[model] || 8192;
  }

  fitsInContext(systemPrompt: string, userPrompt: string, maxOutputTokens: number, model: string): boolean {
    const estimatedInput = this.estimatePromptTokens(systemPrompt, userPrompt);
    return (estimatedInput + maxOutputTokens) < this.getContextWindow(model);
  }

  truncateToFit(text: string, maxTokens: number, suffix?: string): { text: string, truncated: boolean, originalTokens: number } {
    const originalTokens = this.estimateTokens(text);
    if (originalTokens <= maxTokens) {
      return { text, truncated: false, originalTokens };
    }

    const maxChars = Math.floor(maxTokens * this.CHARS_PER_TOKEN);
    let truncatedText = text.substring(0, maxChars);
    
    const lastSpace = truncatedText.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncatedText = truncatedText.substring(0, lastSpace);
    }
    
    if (suffix) {
      truncatedText += suffix;
    }
    
    return { text: truncatedText, truncated: true, originalTokens };
  }

  budgetSplit(totalBudget: number, parts: Array<{ name: string, priority: number, minTokens: number }>): Record<string, number> {
    const result: Record<string, number> = {};
    const sumMinTokens = parts.reduce((acc, p) => acc + p.minTokens, 0);
    const remaining = Math.max(0, totalBudget - sumMinTokens);
    const totalPriority = parts.reduce((acc, p) => acc + p.priority, 0);

    for (const part of parts) {
      const extra = totalPriority > 0 ? Math.floor((part.priority / totalPriority) * remaining) : 0;
      result[part.name] = part.minTokens + extra;
    }

    return result;
  }
}

export const tokenCounter = new TokenCounter();

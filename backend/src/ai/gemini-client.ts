import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { tokenCounter } from './token-counter';
import {
  AIRequest, AIRawResponse, AIResult,
  AIErrorCode, AIUsageRecord, AITaskType, AIUsageSummary
} from './ai-response.types';

export interface GeminiClientConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  initialRetryDelayMs: number;
  maxRetryDelayMs: number;
  timeoutMs: number;
  enableUsageTracking: boolean;
}

export const defaultGeminiConfig: GeminiClientConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  model: 'gemini-2.5-flash',
  maxRetries: 3,
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  timeoutMs: 60000,
  enableUsageTracking: true
};

export class GeminiClient {
  private client: GoogleGenAI;
  private config: GeminiClientConfig;
  private usageHistory: AIUsageRecord[] = [];

  constructor(config: Partial<GeminiClientConfig> = {}) {
    this.config = { ...defaultGeminiConfig, ...config };
    if (!this.config.apiKey && process.env.NODE_ENV === 'production') {
      throw new Error('GEMINI_API_KEY is required in production');
    }
    this.client = new GoogleGenAI({ apiKey: this.config.apiKey || 'dummy' });
  }

  async complete<T>(request: AIRequest): Promise<AIResult<T>> {
    if (!request.systemPrompt || !request.userPrompt) {
      return { success: false, error: { code: AIErrorCode.INVALID_RESPONSE, message: 'Prompts cannot be empty', retryable: false } };
    }

    const outputLimit = tokenCounter.getOutputLimit(this.config.model);
    if (request.maxTokens < 1 || request.maxTokens > outputLimit) {
      return { success: false, error: { code: AIErrorCode.INVALID_RESPONSE, message: `maxTokens must be between 1 and ${outputLimit}`, retryable: false } };
    }

    if (!tokenCounter.fitsInContext(request.systemPrompt, request.userPrompt, request.maxTokens, this.config.model)) {
      return { success: false, error: { code: AIErrorCode.TOKEN_LIMIT_EXCEEDED, message: 'Prompt exceeds context window', retryable: false } };
    }

    const systemPrompt = request.systemPrompt + `\n\nCRITICAL: You must respond with ONLY valid JSON.\nNo preamble, no explanation, no markdown code blocks,\nno \`\`\`json fences. Just the raw JSON object.\nYour entire response must be parseable by JSON.parse().`;

    try {
      const { response, latencyMs } = await this.executeWithRetry(systemPrompt, request.userPrompt, request);
      let rawText = response.text || '';
      rawText = rawText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();

      let parsed: T;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        return { success: false, error: { code: AIErrorCode.JSON_PARSE_FAILED, message: 'Failed to parse JSON', retryable: false } };
      }

      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = response.usageMetadata?.totalTokenCount || 0;
      const cost = tokenCounter.estimateCost(inputTokens, outputTokens, this.config.model);

      const rawResp: AIRawResponse = {
        requestId: request.requestId,
        content: rawText,
        inputTokens,
        outputTokens,
        totalTokens,
        model: this.config.model,
        stopReason: response.candidates?.[0]?.finishReason || 'unknown',
        latencyMs,
        cost
      };

      if (this.config.enableUsageTracking) {
        this.usageHistory.push({
          requestId: request.requestId,
          scanId: request.scanId,
          repoId: request.repoId,
          taskType: request.taskType,
          model: this.config.model,
          inputTokens,
          outputTokens,
          totalTokens,
          costUsd: cost.totalCostUsd,
          latencyMs,
          success: true,
          timestamp: new Date()
        });
      }

      return { success: true, data: parsed, raw: rawResp };
    } catch (error: any) {
      if (this.config.enableUsageTracking) {
         this.usageHistory.push({
           requestId: request.requestId,
           scanId: request.scanId,
           repoId: request.repoId,
           taskType: request.taskType,
           model: this.config.model,
           inputTokens: 0,
           outputTokens: 0,
           totalTokens: 0,
           costUsd: 0,
           latencyMs: 0,
           success: false,
           errorCode: error?.code || AIErrorCode.API_ERROR,
           timestamp: new Date()
         });
      }
      return { success: false, error: { code: error.code || AIErrorCode.API_ERROR, message: error.message, retryable: error.retryable || false } };
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async executeWithRetry(
    systemPrompt: string,
    userPrompt: string,
    request: AIRequest,
    attemptNumber: number = 0
  ): Promise<{ response: any, latencyMs: number }> {
    const startTime = Date.now();
    try {
      // The Gen AI SDK uses generateContent. We can pass system parameters within config.
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: request.temperature,
          maxOutputTokens: request.maxTokens,
          // Require JSON output if supported by model, or just rely on the prompt.
          // Optional: responseMimeType: "application/json"
        }
      });
      
      return { response, latencyMs: Date.now() - startTime };
    } catch (error: any) {
      const status = error.status || error.code;

      if (status === 429 || status === 500 || status === 503 || error.name === 'APIConnectionError' || error.name === 'TimeoutError' || error.name === 'AbortError') {
        if (attemptNumber >= this.config.maxRetries) {
          throw { code: status === 429 ? AIErrorCode.MAX_RETRIES_EXCEEDED : (error.name === 'TimeoutError' || error.name === 'AbortError' ? AIErrorCode.TIMEOUT : AIErrorCode.NETWORK_ERROR), message: error.message, retryable: false };
        }

        let baseDelay = Math.min(this.config.initialRetryDelayMs * (2 ** attemptNumber), this.config.maxRetryDelayMs);
        if (error.name === 'APIConnectionError') {
          baseDelay = Math.min(500 * (2 ** attemptNumber), this.config.maxRetryDelayMs);
        }

        const jitter = Math.random() * 0.3 * baseDelay;
        const delay = Math.floor(baseDelay + jitter);

        const retryAfter = error.response?.headers?.get?.('retry-after');
        const finalDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

        await this.sleep(finalDelay);
        return this.executeWithRetry(systemPrompt, userPrompt, request, attemptNumber + 1);
      }

      if (status === 400) throw { code: AIErrorCode.INVALID_RESPONSE, message: error.message, retryable: false };
      if (status === 401) throw { code: AIErrorCode.API_ERROR, message: 'Invalid API Key', retryable: false };
      if (status === 403) throw { code: AIErrorCode.API_ERROR, message: 'Permission Denied', retryable: false };
      if (status === 404) throw { code: AIErrorCode.API_ERROR, message: 'Not Found', retryable: false };
      
      throw { code: AIErrorCode.API_ERROR, message: error.message || 'Unknown API Error', retryable: false };
    }
  }

  async completeJSON<T>(
    taskType: AITaskType,
    systemPrompt: string,
    userPrompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      scanId?: string;
      repoId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<AIResult<T>> {
    let defaultMaxTokens = 2000;
    switch(taskType) {
      case AITaskType.EXPLAIN_FINDING: defaultMaxTokens = 600; break;
      case AITaskType.EXPLAIN_SCAN: defaultMaxTokens = 1500; break;
      case AITaskType.PREDICT_FAILURE: defaultMaxTokens = 1000; break;
      case AITaskType.GENERATE_REMEDIATION: defaultMaxTokens = 2000; break;
      case AITaskType.PRIORITIZE_FIXES: defaultMaxTokens = 1200; break;
    }

    const request: AIRequest = {
      taskType,
      systemPrompt,
      userPrompt,
      maxTokens: options?.maxTokens || defaultMaxTokens,
      temperature: options?.temperature !== undefined ? options.temperature : 0.2,
      requestId: uuidv4(),
      scanId: options?.scanId || 'unknown',
      repoId: options?.repoId || 'unknown',
      metadata: options?.metadata || {}
    };

    return this.complete<T>(request);
  }

  getUsageHistory(): AIUsageRecord[] {
    return [...this.usageHistory];
  }

  getUsageSummary(): AIUsageSummary {
    const summary: AIUsageSummary = {
      totalRequests: this.usageHistory.length,
      totalTokens: 0,
      totalCostUsd: 0,
      averageLatencyMs: 0,
      successRate: 0,
      byTaskType: {
        [AITaskType.EXPLAIN_FINDING]: { count: 0, tokens: 0, costUsd: 0 },
        [AITaskType.EXPLAIN_SCAN]: { count: 0, tokens: 0, costUsd: 0 },
        [AITaskType.PREDICT_FAILURE]: { count: 0, tokens: 0, costUsd: 0 },
        [AITaskType.GENERATE_REMEDIATION]: { count: 0, tokens: 0, costUsd: 0 },
        [AITaskType.PRIORITIZE_FIXES]: { count: 0, tokens: 0, costUsd: 0 }
      }
    };

    let successful = 0;
    let totalLatency = 0;

    for (const record of this.usageHistory) {
      summary.totalTokens += record.totalTokens;
      summary.totalCostUsd += record.costUsd;
      totalLatency += record.latencyMs;

      if (record.success) successful++;

      const typeSummary = summary.byTaskType[record.taskType];
      if (typeSummary) {
        typeSummary.count++;
        typeSummary.tokens += record.totalTokens;
        typeSummary.costUsd += record.costUsd;
      }
    }

    summary.totalCostUsd = parseFloat(summary.totalCostUsd.toFixed(6));
    if (this.usageHistory.length > 0) {
      summary.averageLatencyMs = Math.round(totalLatency / this.usageHistory.length);
      summary.successRate = parseFloat((successful / this.usageHistory.length).toFixed(2));
    }

    return summary;
  }

  clearUsageHistory(): void {
    this.usageHistory = [];
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; model: string; error?: string }> {
    const startTime = Date.now();
    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: 'Reply with the single word: OK',
        config: {
          maxOutputTokens: 10
        }
      });
      const latencyMs = Date.now() - startTime;
      const text = response.text || '';
      if (text.includes('OK')) {
        return { healthy: true, latencyMs, model: this.config.model };
      } else {
        return { healthy: false, latencyMs, model: this.config.model, error: 'Response did not contain OK' };
      }
    } catch (e: any) {
      return { healthy: false, latencyMs: Date.now() - startTime, model: this.config.model, error: e.message };
    }
  }
}

export const geminiClient = new GeminiClient();

export enum AITaskType {
  EXPLAIN_FINDING      = 'explain_finding',
  EXPLAIN_SCAN         = 'explain_scan',
  PREDICT_FAILURE      = 'predict_failure',
  GENERATE_REMEDIATION = 'generate_remediation',
  PRIORITIZE_FIXES     = 'prioritize_fixes'
}

export interface AIRequest {
  taskType: AITaskType;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  requestId: string;
  scanId: string;
  repoId: string;
  metadata: Record<string, unknown>;
}

export interface AIRawResponse {
  requestId: string;
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  stopReason: string;
  latencyMs: number;
  cost: APICost;
}

export interface APICost {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
}

export interface FindingExplanation {
  ruleId: string;
  plainEnglishRisk: string;
  technicalDetail: string;
  failureScenario: string;
  businessImpact: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScanExplanation {
  executiveSummary: string;
  technicalSummary: string;
  topRisks: RiskNarrative[];
  overallHealthAssessment: string;
  prioritizedActionPlan: ActionPlanItem[];
}

export interface RiskNarrative {
  rank: number;
  title: string;
  narrative: string;
  affectedFiles: string[];
  severity: string;
}

export interface ActionPlanItem {
  priority: number;
  action: string;
  reasoning: string;
  estimatedEffort: 'minutes' | 'hours' | 'days';
  ruleIds: string[];
}

export interface FailurePrediction {
  scanId: string;
  predictions: SingleFailurePrediction[];
  overallRiskLevel: 'critical' | 'high' | 'medium' | 'low';
  timeToFailureEstimate: string;
  mostLikelyFailureScenario: string;
  confidenceStatement: string;
}

export interface SingleFailurePrediction {
  ruleId: string;
  filePath: string;
  trigger: string;
  failureMode: string;
  detectability: 'obvious' | 'subtle' | 'silent';
  likelihood: 'very_likely' | 'likely' | 'possible' | 'unlikely';
  impact: 'deployment_failure' | 'security_breach' | 'data_loss' | 'service_degradation' | 'slow_builds' | 'developer_confusion' | 'compliance_violation';
}

export type AIResult<T> =
  | { success: true; data: T; raw: AIRawResponse }
  | { success: false; error: AIError; raw?: AIRawResponse };

export interface AIError {
  code: AIErrorCode;
  message: string;
  retryable: boolean;
  details?: unknown;
}

export enum AIErrorCode {
  RATE_LIMITED          = 'RATE_LIMITED',
  TOKEN_LIMIT_EXCEEDED  = 'TOKEN_LIMIT_EXCEEDED',
  INVALID_RESPONSE      = 'INVALID_RESPONSE',
  JSON_PARSE_FAILED     = 'JSON_PARSE_FAILED',
  API_ERROR             = 'API_ERROR',
  TIMEOUT               = 'TIMEOUT',
  NETWORK_ERROR         = 'NETWORK_ERROR',
  MAX_RETRIES_EXCEEDED  = 'MAX_RETRIES_EXCEEDED'
}

export interface AIUsageRecord {
  requestId: string;
  scanId: string;
  repoId: string;
  taskType: AITaskType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  errorCode?: AIErrorCode;
  timestamp: Date;
}

export interface AIUsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number;
  successRate: number;
  byTaskType: Record<AITaskType, {
    count: number;
    tokens: number;
    costUsd: number;
  }>;
}

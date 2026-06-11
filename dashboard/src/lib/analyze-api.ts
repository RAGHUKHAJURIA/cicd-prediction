import { APIError } from "./api-client";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface AnalyzeRequest {
  repoUrl: string;
  branch?: string;
  token?: string;
}

export interface AnalyzeResponse {
  scanId: string;
  repoId: string;
  repoName: string;
  branch: string;
}

export interface LayerStatus {
  id: number;
  name: string;
  status: "completed" | "running" | "pending" | "failed";
  detail: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
}

export interface ScanStatusResponse {
  scanId: string;
  overallStatus: "queued" | "fetching" | "parsing" | "analyzing" | "scoring" | "ai-running" | "completed" | "failed";
  currentLayer: number;
  totalLayers: number;
  progress: number;
  layers: LayerStatus[];
  result: {
    grade: string;
    score: number;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    filesScanned: number;
    hasPatches: boolean;
    scanDetailUrl: string;
  } | null;
  error: string | null;
  estimatedSeconds?: number;
  repoName: string;
  branch: string;
}

export interface AIFindingExplanation {
  plainEnglishRisk: string;
  technicalDetail: string;
  failureScenario: string;
  businessImpact: string;
  confidence: string;
}

export interface AIPatch {
  before: string;
  after: string;
  language: string;
  instructions: string;
  safe: boolean;
  warning: string | null;
  validatedByRuleEngine: boolean;
}

export interface InlineFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  description: string;
  field: string | null;
  line: number | null;
  remediation: string | null;
  aiExplanation: AIFindingExplanation | null;
  patch: AIPatch | null;
}

export interface FileScanDetail {
  filePath: string;
  fileType: string;
  content: string;
  findingCount: number;
  worstSeverity: "critical" | "high" | "medium" | "low" | "info" | "success";
  findings: InlineFinding[];
}

export interface ExecutiveRisk {
  rank: number;
  title: string;
  narrative: string;
  affectedFiles: string[];
  severity: "critical" | "high" | "medium" | "low" | "info";
}

export interface ExecutiveActionPlan {
  priority: number;
  action: string;
  reasoning: string;
  estimatedEffort: string;
  ruleIds: string[];
}

export interface AIExecutiveReport {
  executiveSummary: string;
  technicalSummary: string;
  overallHealthAssessment: string;
  topRisks: ExecutiveRisk[];
  prioritizedActionPlan: ExecutiveActionPlan[];
}

export interface FullResultsResponse {
  meta: {
    repoId: string;
    scanId: string;
    repoUrl: string;
    repoName: string;
    branch: string;
    scannedAt: string;
    durationMs: number;
    filesScanned: number;
    ciSystemsDetected: string[];
  };
  score: {
    value: number;
    grade: string;
    trend: "new" | "improving" | "stable" | "degrading";
    breakdown: {
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      infoCount: number;
    };
  };
  files: FileScanDetail[];
  aiReport: AIExecutiveReport | null;
  totalCostUsd: number;
}

// API methods calling the Express /api/analyze endpoints
export const analyzeApi = {
  async submitUrl(data: AnalyzeRequest): Promise<AnalyzeResponse> {
    const res = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new APIError(json.error || "Failed to trigger analysis", res.status);
    }
    return json.data;
  },

  async getStatus(scanId: string): Promise<ScanStatusResponse> {
    const res = await fetch(`${BASE_URL}/api/analyze/${scanId}/status`);
    const json = await res.json();
    if (!res.ok) {
      throw new APIError(json.error || "Failed to get scan status", res.status);
    }
    return json.data;
  },

  async getResults(scanId: string): Promise<FullResultsResponse> {
    const res = await fetch(`${BASE_URL}/api/analyze/${scanId}/results`);
    const json = await res.json();
    if (!res.ok) {
      throw new APIError(json.error || "Failed to fetch scan results", res.status);
    }
    return json.data;
  },
};

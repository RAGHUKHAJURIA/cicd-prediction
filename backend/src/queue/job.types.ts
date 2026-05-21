export const QUEUE_NAMES = {
  SCAN:     'scan-queue',
  ANALYSIS: 'analysis-queue',
  AI:       'ai-queue'
} as const

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES]

export const SCAN_JOBS = {
  FETCH_AND_PARSE: 'fetch-and-parse',
  RESCAN:          'rescan',
  PARSE_SINGLE:    'parse-single-file'
} as const

export const ANALYSIS_JOBS = {
  RUN_RULES:       'run-rules',
  SCORE_RISK:      'score-risk',
  BUILD_REPORT:    'build-report'
} as const

export const AI_JOBS = {
  EXPLAIN_SCAN:    'explain-scan',
  EXPLAIN_FINDING: 'explain-finding',
  PREDICT_FAILURES: 'predict-failures',
  GENERATE_REMEDIATIONS: 'generate-remediations',
  FULL_AI_REPORT:  'full-ai-report'
} as const

export type ScanJobName     = typeof SCAN_JOBS[keyof typeof SCAN_JOBS]
export type AnalysisJobName = typeof ANALYSIS_JOBS[keyof typeof ANALYSIS_JOBS]
export type AIJobName       = typeof AI_JOBS[keyof typeof AI_JOBS]

export enum JobPriority {
  CRITICAL = 1,
  HIGH     = 5,
  NORMAL   = 10,
  LOW      = 20
}

export interface FetchAndParseJobPayload {
  scanId: string
  repoId: string
  repoUrl: string
  owner: string
  repoName: string
  branch: string
  provider: 'github' | 'gitlab' | 'gitea' | 'self-hosted'
  githubToken?: string
  targetFiles?: string[]
  ignorePaths: string[]
  priority: JobPriority
  triggeredBy: 'manual' | 'webhook' | 'schedule' | 'pr'
  webhookDeliveryId?: string
}

export interface RescanJobPayload {
  originalScanId: string
  newScanId: string
  repoId: string
  owner: string
  repoName: string
  branch: string
  provider: 'github' | 'gitlab' | 'gitea' | 'self-hosted'
  githubToken?: string
  priority: JobPriority
}

export interface ParseSingleFileJobPayload {
  scanId: string
  repoId: string
  filePath: string
  gitSha: string
  owner: string
  repoName: string
  branch: string
  githubToken?: string
}

export interface RunRulesJobPayload {
  scanId: string
  repoId: string
  parsedArtifactIds: string[]
  ruleConfig?: {
    disabledRules?: string[]
    severityOverrides?: Record<string, string>
    ignorePaths?: string[]
  }
}

export interface ScoreRiskJobPayload {
  scanId: string
  repoId: string
  workflowRuleReportIds: string[]
  previousScanId?: string
}

export interface BuildReportJobPayload {
  scanId: string
  repoId: string
  riskScore: number
  riskGrade: 'A' | 'B' | 'C' | 'D' | 'F'
  findingCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
}

export interface ExplainScanJobPayload {
  scanId: string
  repoId: string
  aiContextJson: string
  maxFindingsToExplain: number
}

export interface ExplainFindingJobPayload {
  scanId: string
  repoId: string
  findingId: string
  findingJson: string
  ciSystemsDetected: string[]
}

export interface PredictFailuresJobPayload {
  scanId: string
  repoId: string
  aiContextJson: string
}

export interface GenerateRemediationsJobPayload {
  scanId: string
  repoId: string
  findingsJson: string
  workflowContentsJson: string
  aiContextJson: string
  maxFindings: number
}

export interface FullAIReportJobPayload {
  scanId: string
  repoId: string
  aiContextJson: string
  findingsJson: string
  workflowContentsJson: string
  includeRemediation: boolean
  maxFindings: number
}

export interface ScanJobResult {
  scanId: string
  filesFound: number
  filesParsed: number
  filesFailedToParse: number
  parsedArtifactIds: string[]
  durationMs: number
}

export interface AnalysisJobResult {
  scanId: string
  totalFindings: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  riskScore: number
  riskGrade: 'A' | 'B' | 'C' | 'D' | 'F'
  durationMs: number
}

export interface AIJobResult {
  scanId: string
  taskType: AIJobName
  success: boolean
  tokensUsed: number
  costUsd: number
  durationMs: number
  outputKey?: string
}

export interface ScanJobProgress {
  phase: 'fetching' | 'parsing' | 'storing'
  filesTotal: number
  filesProcessed: number
  currentFile?: string
  percentComplete: number
}

export interface AnalysisJobProgress {
  phase: 'loading' | 'running-rules' | 'scoring' | 'building-report'
  rulesTotal?: number
  rulesCompleted?: number
  percentComplete: number
}

export interface AIJobProgress {
  phase: 'explaining' | 'predicting' | 'remediating' | 'validating'
  findingsTotal?: number
  findingsProcessed?: number
  percentComplete: number
  tokensUsedSoFar?: number
  estimatedCostSoFar?: number
}

export interface JobMetadata {
  traceId: string
  userId?: string
  ipAddress?: string
  source: 'api' | 'webhook' | 'scheduler' | 'rerun'
  createdAt: string
}

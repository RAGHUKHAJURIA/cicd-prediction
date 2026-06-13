export type ScanPhase =
  | 'idle'
  | 'triggering'
  | 'scanning'
  | 'completed'
  | 'error'

export interface ScanResults {
  scan: {
    id: string
    repoId: string
    status: string
    branch: string
    triggeredAt: string
    completedAt: string | null
    durationMs: number | null
    totalFiles: number
    totalFindings: number
    criticalCount: number
    highCount: number
    mediumCount: number
    lowCount: number
    errorMessage: string | null
  }
  score: {
    value: number
    grade: 'A' | 'B' | 'C' | 'D' | 'F'
    trend: 'new' | 'improving' | 'stable' | 'degrading'
  }
  findings: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    all: FindingWithPatch[]
    byFile: Record<string, FindingWithPatch[]>
  }
  artifacts: Array<{
    filePath: string
    fileType: string
    parseErrors: unknown[]
    parseWarnings: unknown[]
  }>
  aiReport: AIReport | null
}

export interface FindingWithPatch {
  id: string
  scanId: string
  repoId: string
  filePath: string
  ruleId: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: string
  description: string
  field: string | null
  line: number | null
  remediation: string | null
  patch: AIPatch | null
  explanation: AIExplanation | null
  requiresManualReview?: boolean
  manualReviewReason?: string | null
}

export interface AIPatch {
  id: string
  ruleId: string | null
  title: string
  beforeCode: string | null
  afterCode: string | null
  language: string | null
  instructions: string | null
  safe: boolean | null
  warning: string | null
}

export interface AIExplanation {
  id: string
  ruleId: string | null
  explanation: string
  riskContext: string | null
  urgency: string | null
}

export interface AIReport {
  executiveSummary?: string
  technicalSummary?: string
  overallHealthAssessment?: string
  topRisks?: Array<{
    rank: number
    title: string
    narrative: string
    severity: string
  }>
  prioritizedActionPlan?: Array<{
    priority: number
    action: string
    reasoning: string
    estimatedEffort: string
  }>
}

export type { NormalizedWorkflow } from '../../../backend/src/models/workflow.model'

export type {
  RepoSettings,
  RepoSummary,
  ScanSummary,
  Finding,
  ParsedArtifact,
  AnalysisReport,
  ScanDetail
} from '../../../backend/src/types/shared.types'

export interface ScanExplanation {
  plainEnglishRisk: string
  technicalDetail: string
  failureScenario?: string
  businessImpact?: string
}

export interface ScanRemediationReport {
  remediations: Array<{
    findingId: string
    title: string
    severity: string
    patch?: {
      before: string
      after: string
    }
    validationStatus: 'valid' | 'fallback' | 'manual_review'
  }>
}

export interface AIJobStatus {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  explanation?: ScanExplanation
  remediationReport?: ScanRemediationReport
}

export interface QueueInfo {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export interface QueueStats {
  scanQueue: QueueInfo
  analysisQueue: QueueInfo
  aiQueue: QueueInfo
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface CreateRepoInput {
  url: string
  branch?: string
  token?: string
  autoScanOnPush?: boolean
  notifyOnCritical?: boolean
}

export interface ScanOptions {
  branch?: string
}

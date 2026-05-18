export enum WorkerName {
  SCAN     = 'scan-worker',
  ANALYSIS = 'analysis-worker',
  AI       = 'ai-worker'
}

export enum WorkerStatus {
  STARTING = 'starting',
  RUNNING  = 'running',
  STOPPING = 'stopping',
  STOPPED  = 'stopped',
  ERROR    = 'error'
}

export const WORKER_CONCURRENCY = {
  SCAN:     3,
  ANALYSIS: 5,
  AI:       2
} as const

export interface WorkerHealth {
  worker:          WorkerName
  status:          WorkerStatus
  concurrency:     number
  activeJobs:      number
  completedJobs:   number
  failedJobs:      number
  waitingJobs:     number
  lastHeartbeat:   string
  uptimeSeconds:   number
  memoryUsageMb:   number
}

export interface ScanPipelineResult {
  scanId:           string
  repoId:           string
  filesFound:       number
  filesParsed:      number
  failedFiles:      number
  parsedArtifactIds: string[]
  queuedAnalysis:   boolean
  durationMs:       number
}

export interface AnalysisPipelineResult {
  scanId:        string
  repoId:        string
  findingsCount: number
  criticalCount: number
  highCount:     number
  overallScore:  number
  riskGrade:     string
  queuedAI:      boolean
  durationMs:    number
}

export interface AIPipelineResult {
  scanId:                  string
  repoId:                  string
  explanationsGenerated:   number
  remediationsGenerated:   number
  predictionsGenerated:    number
  tokensUsed:              number
  estimatedCostUsd:        number
  durationMs:              number
}

export interface WorkerManagerHealth {
  overall:       'healthy' | 'degraded' | 'down'
  workers:       WorkerHealth[]
  uptimeSeconds: number
  timestamp:     string
}

export const LOG_EVENTS = {
  WORKER_STARTED:       'worker_started',
  WORKER_STOPPED:       'worker_stopped',
  WORKER_ERROR:         'worker_error',
  JOB_STARTED:          'job_started',
  JOB_COMPLETED:        'job_completed',
  JOB_FAILED:           'job_failed',
  JOB_STALLED:          'job_stalled',
  JOB_RETRYING:         'job_retrying',
  PIPELINE_ENQUEUED:    'pipeline_enqueued',
  HEALTH_HEARTBEAT:     'health_heartbeat',
  SHUTDOWN_STARTED:     'shutdown_started',
  SHUTDOWN_COMPLETED:   'shutdown_completed'
} as const

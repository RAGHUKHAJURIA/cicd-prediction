export interface RepoSettings {
  autoScanOnPush?: boolean;
  notifyOnCritical?: boolean;
  defaultBranch?: string;
}

export interface RepoSummary {
  id: string;
  name: string;
  repoUrl: string;
  provider: 'github' | 'gitlab' | 'gitea' | 'self-hosted';
  owner: string;
  repoName: string;
  defaultBranch: string;
  status: 'active' | 'paused' | 'error';
  lastScannedAt: string | null;
  totalScans: number;
  latestScan: ScanSummary | null;
  settings: RepoSettings;
  createdAt: string;
}

export interface ScanSummary {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  branch: string;
  triggeredAt: string;
  completedAt: string | null;
  durationMs: number | null;
  totalFiles: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  riskScore: number;
  riskGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  errorMessage: string | null;
}

export interface Finding {
  id: string;
  scanId: string;
  repoId: string;
  filePath: string;
  ruleId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  description: string;
  field: string;
  line: number | null;
  remediation: string;
  createdAt: string;
}

export interface ParsedArtifact {
  id: string;
  scanId: string;
  filePath: string;
  type: string;
  content: string;
}

export interface AnalysisReport {
  id: string;
  scanId: string;
  summary: string;
  overallHealth: string;
  topRisks: Array<{
    title: string;
    severity: string;
    description: string;
    affectedFiles: string[];
  }>;
  actionPlan: Array<{
    priority: number;
    action: string;
    reasoning: string;
    effort: string;
    rules: string[];
  }>;
}

export interface ScanDetail extends ScanSummary {
  findings: {
    all: Finding[];
    critical: Finding[];
    high: Finding[];
    medium: Finding[];
    low: Finding[];
    info: Finding[];
    byFile: Record<string, Finding[]>;
    byRule: Record<string, Finding[]>;
    byCategory: Record<string, Finding[]>;
  };
  artifacts: ParsedArtifact[];
  analysisReport: AnalysisReport | null;
}

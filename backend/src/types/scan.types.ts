export interface ApplyFixesResult {
  branch: string;
  committedFiles: string[];
  skippedFiles: Array<{ filePath: string; reason: string }>;
  pr: { url: string; number: number } | null;
  stats: {
    totalFilesWithFixes: number;
    filesCommitted: number;
    filesSkipped: number;
    manualFixCount: number;
  };
}

export interface ApplyFixesRequest {
  branch?: string;
  createPR?: boolean;
  prTitle?: string;
  targetBranch?: string;
  selectedFileIds?: string[];
}

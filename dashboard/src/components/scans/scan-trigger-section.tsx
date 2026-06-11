'use client';

import { RepoSummary } from '@/lib/types';
import { ScanResults } from '@/lib/types/scan.types';
import { Radar, Loader2, AlertTriangle } from 'lucide-react';
import { RiskBadge } from '../ui/risk-badge';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

const Github = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

const Gitlab = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l2.87-8.82a.84.84 0 0 1 .79-.58h3.36a.84.84 0 0 1 .79.58L10 11.23h4l1.14-3.56a.84.84 0 0 1 .79-.58h3.36a.84.84 0 0 1 .79.58l2.87 8.82a.84.84 0 0 1-.3.94z" />
  </svg>
);

interface ScanTriggerSectionProps {
  repo: RepoSummary;
  onScan: () => void;
  error: string | null;
  isTriggering: boolean;
  latestResults: ScanResults | null;
}

export function ScanTriggerSection({
  repo,
  onScan,
  error,
  isTriggering,
  latestResults
}: ScanTriggerSectionProps) {
  const isGithub = repo.repoUrl.toLowerCase().includes('github.com');
  const isGitlab = repo.repoUrl.toLowerCase().includes('gitlab.com');

  return (
    <div className="w-full max-w-[480px] mx-auto bg-canvas border border-border rounded-lg p-6 shadow-xl animate-fade-in">
      {/* Repo Info Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-canvas-subtle border border-border rounded-md text-fg">
            {isGithub && <Github className="w-6 h-6" />}
            {isGitlab && <Gitlab className="w-6 h-6" />}
            {!isGithub && !isGitlab && <Github className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-fg leading-tight">
              {repo.owner} / {repo.repoName}
            </h2>
            <span className="text-xs font-mono text-fg-muted truncate block max-w-[280px]" title={repo.repoUrl}>
              {repo.repoUrl}
            </span>
          </div>
        </div>

        <span
          className={clsx(
            "text-xs px-2.5 py-0.5 rounded-full border font-medium capitalize",
            repo.status === 'active' 
              ? "text-success border-success-subtle bg-success-subtle/10" 
              : "text-warning border-warning-subtle bg-warning-subtle/10"
          )}
        >
          {repo.status}
        </span>
      </div>

      {/* Last Scan Info */}
      {latestResults && (
        <div className="mb-6 p-4 bg-canvas-subtle border border-border rounded-md">
          <div className="text-xs text-fg-muted mb-2">LAST SCAN RESULTS</div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-fg">
                {latestResults.findings.total} findings detected
              </span>
              <span className="text-xs text-fg-subtle mt-0.5">
                {formatDistanceToNow(new Date(latestResults.scan.triggeredAt))} ago
              </span>
            </div>
            <RiskBadge grade={latestResults.score.grade} size="md" />
          </div>
        </div>
      )}

      {/* Scan Button */}
      <button
        onClick={onScan}
        disabled={isTriggering}
        className={clsx(
          "w-full h-[52px] rounded-md text-sm font-semibold flex items-center justify-center gap-2.5 transition-all border shadow-lg border-white/5",
          isTriggering
            ? "bg-canvas-subtle text-fg-muted border-border cursor-not-allowed"
            : "bg-[#1f6feb] hover:bg-[#388bfd] text-white hover:shadow-[#1f6feb]/20 hover:shadow-xl"
        )}
      >
        {isTriggering ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Starting scan...</span>
          </>
        ) : (
          <>
            <Radar className="w-5 h-5 text-white/90 animate-pulse" />
            <span>Start reliability scan</span>
          </>
        )}
      </button>

      {/* Info Notice */}
      <p className="text-[11px] text-fg-subtle text-center mt-3">
        Will scan: GitHub Actions, Dockerfiles, Kubernetes manifests, Jenkinsfiles
      </p>

      {/* Error Box */}
      {error && (
        <div className="mt-4 p-3.5 bg-danger-subtle/10 border border-danger-subtle rounded-md flex items-start gap-2.5 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="text-danger font-medium mb-1">Failed to start scan</p>
            <p className="text-fg-muted">{error}</p>
            <button 
              onClick={onScan}
              className="text-accent hover:text-accent-hover font-medium underline mt-1.5 block"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { RepoSummary } from '@/lib/types';
import { ScanPhase, ScanResults } from '@/lib/types/scan.types';
import { ScanTriggerSection } from '@/components/scans/scan-trigger-section';
import { ScanPipelineLive } from '@/components/scans/scan-pipeline-live';
import { ScanResultsView } from '@/components/scans/scan-results-view';
import { RiskBadge } from '@/components/ui/risk-badge';
import { Loader2, GitBranch } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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

function LoadingSkeleton() {
  return (
    <div className="flex h-64 items-center justify-center animate-fade-in">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
        <p className="text-sm text-fg-muted animate-pulse">Loading repository details...</p>
      </div>
    </div>
  );
}

function RepoHeader({ repo, results }: { repo: RepoSummary; results: ScanResults | null }) {
  const isGithub = repo.repoUrl.toLowerCase().includes('github.com');
  const isGitlab = repo.repoUrl.toLowerCase().includes('gitlab.com');

  return (
    <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h1 className="text-3xl font-bold text-fg flex items-center gap-2">
            {isGithub && <Github className="w-8 h-8 text-fg-muted shrink-0" />}
            {isGitlab && <Gitlab className="w-8 h-8 text-fg-muted shrink-0" />}
            <span>{repo.owner} / {repo.repoName}</span>
          </h1>
          {results && <RiskBadge grade={results.score.grade} size="lg" />}
        </div>
        <div className="flex items-center gap-4 text-sm text-fg-muted flex-wrap">
          <span className="flex items-center gap-1">
            <GitBranch className="w-4 h-4" /> {repo.defaultBranch || 'main'}
          </span>
          <span className="text-xs font-mono text-fg-subtle truncate max-w-xs md:max-w-md" title={repo.repoUrl}>
            {repo.repoUrl}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function RepoDetailPage() {
  const params = useParams();
  const repoId = params.id as string;

  const [repo, setRepo] = useState<RepoSummary | null>(null);
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [scanId, setScanId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);
  const [results, setResults] = useState<ScanResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load repo on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/repos/${repoId}`, {
      credentials: 'include'
    })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load repository');
        return r.json();
      })
      .then(b => setRepo(b.data))
      .catch(() => setError('Failed to load repository'));
  }, [repoId]);

  // Load latest scan on mount if exists
  useEffect(() => {
    if (!repo) return;
    fetch(`${API_BASE}/api/repos/${repoId}/scans/latest`, {
      credentials: 'include'
    })
      .then(r => {
        if (r.status === 404) return null;
        return r.json();
      })
      .then(b => {
        if (!b) return;
        if (b.data?.scan?.status === 'completed') {
          setResults(b.data);
          setScanId(b.data.scan.id);
          setPhase('completed');
        } else if (b.data?.scan?.status === 'running' || b.data?.scan?.status === 'queued') {
          setScanId(b.data.scan.id);
          setPhase('scanning');
        }
      })
      .catch(() => {});
  }, [repo, repoId]);

  // Trigger scan function
  async function triggerScan() {
    setPhase('triggering');
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/repos/${repoId}/scan`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch: repo?.defaultBranch || 'main' })
        }
      );

      if (res.status === 409) {
        const body = await res.json();
        if (body.code === 'SCAN_IN_PROGRESS') {
          setScanId(body.details.runningScanId);
          setPhase('scanning');
          return;
        }
      }

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to start scan');
      }

      const body = await res.json();
      setScanId(body.data.scanId);
      setJobId(body.data.jobId);
      setPhase('scanning');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setPhase('error');
    }
  }

  // Load results helper
  async function loadResults() {
    try {
      const res = await fetch(
        `${API_BASE}/api/repos/${repoId}/scans/${scanId}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to load results');
      const body = await res.json();
      setResults(body.data);
      setPhase('completed');
    } catch (err) {
      setError('Scan completed but failed to load results');
      setPhase('error');
    }
  }

  function progressToStage(progress: number): number {
    if (progress < 15) return 1;   // Connecting to GitHub
    if (progress < 30) return 2;   // Fetching files
    if (progress < 60) return 3;   // Downloading contents
    if (progress < 80) return 4;   // Parsing configurations
    if (progress < 95) return 5;   // Running 26 rules
    return 6;                      // AI analysis
  }

  // Polling logic
  useEffect(() => {
    if (phase !== 'scanning') return;

    const interval = setInterval(async () => {
      try {
        if (jobId) {
          const res = await fetch(
            `${API_BASE}/api/jobs/${jobId}/status`,
            { credentials: 'include' }
          );
          if (!res.ok) return;
          const body = await res.json();
          const { status, progress: prog } = body.data;

          setProgress(prog ?? 0);
          setCurrentStage(progressToStage(prog ?? 0));

          if (status === 'completed') {
            clearInterval(interval);
            await loadResults();
          } else if (status === 'failed') {
            clearInterval(interval);
            setError(body.data.failedReason ?? 'Scan failed');
            setPhase('error');
          }
        } else if (scanId) {
          // Fallback: poll by scanId in DB if no jobId
          const res = await fetch(
            `${API_BASE}/api/repos/${repoId}/scans/${scanId}`,
            { credentials: 'include' }
          );
          if (!res.ok) return;
          const body = await res.json();
          const { status } = body.data.scan;

          if (status === 'completed') {
            clearInterval(interval);
            setResults(body.data);
            setPhase('completed');
          } else if (status === 'failed') {
            clearInterval(interval);
            setError(body.data.scan.errorMessage ?? 'Scan failed');
            setPhase('error');
          }
        }
      } catch { /* keep polling */ }
    }, 2000);

    return () => clearInterval(interval);
  }, [phase, jobId, scanId, repoId]);

  if (!repo) return <LoadingSkeleton />;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 animate-fade-in space-y-6">
      {/* Repo Header - always visible */}
      <RepoHeader repo={repo} results={results} />

      {/* Main content based on state machine phase */}
      {(phase === 'idle' || phase === 'error' || phase === 'triggering') && (
        <ScanTriggerSection
          repo={repo}
          onScan={triggerScan}
          error={error}
          isTriggering={phase === 'triggering'}
          latestResults={results}
        />
      )}

      {phase === 'scanning' && (
        <ScanPipelineLive
          phase={phase}
          progress={progress}
          currentStage={currentStage}
          repoName={`${repo.owner}/${repo.repoName}`}
          onCancel={() => {
            setPhase('idle');
            setResults(null);
            setError(null);
          }}
        />
      )}

      {phase === 'completed' && results && (
        <ScanResultsView
          results={results}
          repoId={repoId}
          onRescan={() => {
            setPhase('idle');
            setResults(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

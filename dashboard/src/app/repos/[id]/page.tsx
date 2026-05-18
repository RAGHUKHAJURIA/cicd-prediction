'use client';

import { useScan, useLatestScan, useRepos } from '@/lib/hooks/use-scan';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Play, GitBranch, Clock, ArrowRight } from 'lucide-react';
import { RiskBadge } from '@/components/ui/risk-badge';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useSWRConfig } from 'swr';
import clsx from 'clsx';

export default function RepoOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const repoId = params.id as string;
  const { repos } = useRepos();
  const repo = repos.find(r => r.id === repoId);
  const { scan, isLoading } = useLatestScan(repoId);
  const { mutate } = useSWRConfig();
  const [isScanning, setIsScanning] = useState(false);

  if (isLoading || !repo) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  const handleScan = async () => {
    setIsScanning(true);
    try {
      const result = await apiClient.triggerScan(repoId);
      mutate(`latest-scan:${repoId}`);
      // Also mutate repos list
      mutate('repos');
      // Redirect to the new scan page
      if (result.scanId) {
        router.push(`/repos/${repoId}/scans/${result.scanId}`);
      }
    } catch (err) {
      console.error(err);
      setIsScanning(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 animate-fade-in">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-fg">{repo.owner} / {repo.repoName}</h1>
            {scan && <RiskBadge grade={scan.riskGrade} size="lg" />}
          </div>
          <div className="flex items-center gap-4 text-sm text-fg-muted">
            <span className="flex items-center gap-1"><GitBranch className="w-4 h-4"/> {repo.defaultBranch}</span>
            {scan && <span className="flex items-center gap-1"><Clock className="w-4 h-4"/> Scanned {formatDistanceToNow(new Date(scan.triggeredAt))} ago</span>}
          </div>
        </div>

        <div className="flex gap-3">
          {scan && (
            <Link 
              href={`/repos/${repoId}/scans/${scan.id}`}
              className="px-4 py-2 bg-canvas hover:bg-canvas-subtle border border-border rounded-md text-sm font-medium text-fg flex items-center gap-2 transition-colors"
            >
              View latest scan <ArrowRight className="w-4 h-4" />
            </Link>
          )}
          <button
            onClick={handleScan}
            disabled={isScanning}
            className={clsx(
              "px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-colors border",
              isScanning
                ? "bg-canvas text-fg-muted border-border"
                : "bg-accent hover:bg-accent-hover text-white border-white/10"
            )}
          >
            {isScanning ? (
              <><span className="w-4 h-4 rounded-full border-2 border-fg-muted border-t-transparent animate-spin" /> Scanning...</>
            ) : (
              <><Play className="w-4 h-4 fill-current" /> Trigger scan</>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Stats */}
        <div className="col-span-1 md:col-span-3 grid grid-cols-4 gap-4 mb-4">
          <div className="bg-canvas-subtle border border-border rounded-md p-4 flex flex-col justify-center">
            <div className="text-sm text-fg-muted mb-1">Total Scans</div>
            <div className="text-2xl font-semibold text-fg">{repo.totalScans}</div>
          </div>
          <div className="bg-canvas-subtle border border-border rounded-md p-4 flex flex-col justify-center">
            <div className="text-sm text-fg-muted mb-1">Status</div>
            <div className="text-xl font-semibold text-fg capitalize flex items-center gap-2">
              <span className={clsx("w-2 h-2 rounded-full", repo.status === 'active' ? 'bg-success' : repo.status === 'error' ? 'bg-danger' : 'bg-warning')} />
              {repo.status}
            </div>
          </div>
          <div className="bg-canvas-subtle border border-border rounded-md p-4 flex flex-col justify-center col-span-2">
            <div className="text-sm text-fg-muted mb-1">Provider URL</div>
            <div className="text-sm font-mono text-fg truncate">{repo.repoUrl}</div>
          </div>
        </div>

        {/* Scan History (Placeholder for timeline) */}
        <div className="col-span-1 md:col-span-3 bg-canvas-subtle border border-border rounded-md p-6">
          <h2 className="text-lg font-semibold text-fg mb-4">Recent Scans</h2>
          {scan ? (
            <div className="border border-border rounded-md overflow-hidden">
              <div className="flex items-center justify-between p-4 bg-canvas border-b border-border hover:bg-canvas-inset transition-colors">
                <div className="flex items-center gap-4">
                  <RiskBadge grade={scan.riskGrade} />
                  <div>
                    <div className="font-medium text-fg flex items-center gap-2">
                      Scan on {repo.defaultBranch}
                      {scan.status === 'running' && <span className="bg-accent/20 text-accent text-xs px-2 py-0.5 rounded border border-accent/50 animate-pulse">Running</span>}
                    </div>
                    <div className="text-xs text-fg-muted mt-1">{formatDistanceToNow(new Date(scan.triggeredAt))} ago • {scan.durationMs ? `${(scan.durationMs/1000).toFixed(1)}s` : 'Pending'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex gap-2 text-xs font-mono">
                    <span className="text-danger">{scan.criticalCount}C</span>
                    <span className="text-severe">{scan.highCount}H</span>
                    <span className="text-warning">{scan.mediumCount}M</span>
                  </div>
                  <Link href={`/repos/${repoId}/scans/${scan.id}`} className="text-accent hover:text-accent-hover text-sm font-medium flex items-center gap-1">
                    Details <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-fg-muted">
              No scans performed yet. Trigger a scan to see history.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { RepoSummary } from '@/lib/types';
import { RiskBadge } from '@/components/ui/risk-badge';
import { Play, MoreHorizontal, GitPullRequest, Clock } from 'lucide-react';
import Link from 'next/link';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useSWRConfig } from 'swr';

export function RepoCard({ repo }: { repo: RepoSummary }) {
  const [isScanning, setIsScanning] = useState(false);
  const { mutate } = useSWRConfig();
  const scan = repo.latestScan;

  const handleScan = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsScanning(true);
    try {
      await apiClient.triggerScan(repo.id);
      mutate('repos');
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setIsScanning(false), 2000);
    }
  };

  const getScoreColor = (score: number) => {
    if (score < 25) return 'bg-success';
    if (score < 50) return 'bg-blue-500';
    if (score < 75) return 'bg-warning';
    return 'bg-danger';
  };

  return (
    <div className={clsx(
      "bg-canvas-subtle border border-border rounded-md p-4 transition-all duration-200 group flex flex-col",
      isScanning ? "border-accent glow-accent" : "hover:border-accent hover:glow-accent"
    )}>
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          {repo.provider === 'github' && <GitPullRequest className="w-5 h-5 text-fg-muted" />}
          <div>
            <Link href={`/repos/${repo.id}`} className="text-fg hover:text-accent font-semibold transition-colors">
              {repo.owner} / {repo.repoName}
            </Link>
          </div>
        </div>
        {scan && (
          <RiskBadge grade={scan.riskGrade} />
        )}
      </div>

      {/* Stats */}
      <div className="flex-1 flex flex-col gap-3 justify-center mb-4 text-sm text-fg-muted">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>
            {scan?.triggeredAt 
              ? `Last scan: ${formatDistanceToNow(new Date(scan.triggeredAt))} ago`
              : 'Never scanned'}
          </span>
        </div>

        {scan && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Risk score</span>
              <span className="font-mono">{scan.riskScore}/100</span>
            </div>
            <div className="h-1.5 w-full bg-border-muted rounded-full overflow-hidden">
              <div 
                className={clsx("h-full transition-all duration-1000", getScoreColor(scan.riskScore))}
                style={{ width: `${scan.riskScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Findings */}
        {scan && (
          <div className="flex gap-3 text-xs mt-1">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-danger"/>{scan.criticalCount} critical</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-severe"/>{scan.highCount} high</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning"/>{scan.mediumCount} med</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-3 border-t border-border-muted">
        <button
          onClick={handleScan}
          disabled={isScanning}
          className={clsx(
            "flex-1 flex justify-center items-center gap-1.5 py-1.5 text-xs font-medium rounded transition-colors border",
            isScanning
              ? "bg-canvas text-fg-muted border-border cursor-not-allowed"
              : "bg-canvas hover:bg-border-muted text-fg border-border hover:border-fg-subtle"
          )}
        >
          {isScanning ? (
            <><span className="h-3 w-3 rounded-full border border-fg-muted border-t-transparent animate-spin"/> Scanning...</>
          ) : (
            <><Play className="w-3 h-3 fill-current" /> Scan now</>
          )}
        </button>
        <Link 
          href={`/repos/${repo.id}/scans/latest`}
          className="flex-1 flex justify-center items-center py-1.5 text-xs font-medium rounded bg-canvas hover:bg-border-muted text-fg border border-border hover:border-fg-subtle transition-colors"
        >
          View findings
        </Link>
        <button className="px-2 flex items-center justify-center rounded bg-canvas hover:bg-border-muted text-fg border border-border hover:border-fg-subtle transition-colors">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

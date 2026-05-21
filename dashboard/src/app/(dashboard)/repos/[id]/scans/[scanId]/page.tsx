'use client';

import { useScan, useAIJob } from '@/lib/hooks/use-scan';
import { useParams } from 'next/navigation';
import { Loader2, FileCode, Shield, Zap, Settings, Activity } from 'lucide-react';
import { ScoreGauge } from '@/components/scans/score-gauge';
import { FindingsTable } from '@/components/scans/findings-table';
import { RiskHeatmap } from '@/components/scans/risk-heatmap';
import { AIReportPanel } from '@/components/scans/ai-report-panel';
import * as Tabs from '@radix-ui/react-tabs';
import Link from 'next/link';

export default function ScanDetailPage() {
  const params = useParams();
  const repoId = params.id as string;
  const scanId = params.scanId as string;
  const { scan, isLoading } = useScan(repoId, scanId);

  // We assume the AI job id is stored somehow, or we query for it. For now, we'll let AIReportPanel trigger it.
  const { job: aiJob } = useAIJob(scanId, scan?.analysisReport?.id, 'report');

  if (isLoading || !scan) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6 animate-fade-in">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
        <div>
          <h1 className="text-2xl font-bold text-fg mb-1">Scan Analysis</h1>
          <div className="text-sm text-fg-muted font-mono">
            {scan.branch} • {new Date(scan.triggeredAt).toLocaleString()}
          </div>
        </div>

        <div className="flex-1 flex justify-center">
          <ScoreGauge score={scan.riskScore} grade={scan.riskGrade} />
        </div>

        <div className="flex gap-3">
          <Link 
            href={`/repos/${repoId}/scans/${scanId}/dag`}
            className="px-4 py-2 bg-canvas-subtle hover:bg-border-muted border border-border rounded-md text-sm font-medium text-fg transition-colors"
          >
            View DAG
          </Link>
          <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-medium transition-colors border border-white/10 shadow-[0_0_15px_rgba(31,111,235,0.3)]">
            Generate AI Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs.Root defaultValue="overview" className="flex flex-col w-full">
        <Tabs.List className="flex border-b border-border mb-6 overflow-x-auto hide-scrollbar">
          <Tabs.Trigger 
            value="overview" 
            className="px-6 py-3 text-sm font-medium text-fg-muted hover:text-fg data-[state=active]:text-fg data-[state=active]:border-b-2 data-[state=active]:border-accent transition-colors whitespace-nowrap"
          >
            Overview
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="findings" 
            className="px-6 py-3 text-sm font-medium text-fg-muted hover:text-fg data-[state=active]:text-fg data-[state=active]:border-b-2 data-[state=active]:border-accent transition-colors whitespace-nowrap flex items-center gap-2"
          >
            Findings
            <span className="bg-canvas-inset border border-border text-[10px] px-1.5 py-0.5 rounded-full">{scan.totalFindings}</span>
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="heatmap" 
            className="px-6 py-3 text-sm font-medium text-fg-muted hover:text-fg data-[state=active]:text-fg data-[state=active]:border-b-2 data-[state=active]:border-accent transition-colors whitespace-nowrap"
          >
            Risk Heatmap
          </Tabs.Trigger>
          <Tabs.Trigger 
            value="ai-report" 
            className="px-6 py-3 text-sm font-medium text-fg-muted hover:text-fg data-[state=active]:text-fg data-[state=active]:border-b-2 data-[state=active]:border-accent transition-colors whitespace-nowrap"
          >
            AI Report
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview" className="focus:outline-none animate-fade-in space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-canvas-subtle border border-border border-l-4 border-l-danger rounded-md p-4">
              <div className="text-3xl font-light text-fg mb-1">{scan.criticalCount}</div>
              <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Critical</div>
            </div>
            <div className="bg-canvas-subtle border border-border border-l-4 border-l-severe rounded-md p-4">
              <div className="text-3xl font-light text-fg mb-1">{scan.highCount}</div>
              <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">High</div>
            </div>
            <div className="bg-canvas-subtle border border-border border-l-4 border-l-warning rounded-md p-4">
              <div className="text-3xl font-light text-fg mb-1">{scan.mediumCount}</div>
              <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Medium</div>
            </div>
            <div className="bg-canvas-subtle border border-border border-l-4 border-l-blue-400 rounded-md p-4">
              <div className="text-3xl font-light text-fg mb-1">{scan.lowCount}</div>
              <div className="text-xs text-fg-muted uppercase tracking-wider font-semibold">Low</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-canvas-subtle border border-border rounded-md p-6">
              <h3 className="text-sm font-semibold text-fg mb-4 uppercase tracking-wider">Scan Metadata</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-fg-muted">Files Scanned</span>
                  <span className="text-fg font-mono">{scan.totalFiles}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-fg-muted">Duration</span>
                  <span className="text-fg font-mono">{scan.durationMs ? `${(scan.durationMs / 1000).toFixed(2)}s` : '-'}</span>
                </div>
                <div className="flex justify-between pb-2">
                  <span className="text-fg-muted">Status</span>
                  <span className="text-fg capitalize">{scan.status}</span>
                </div>
              </div>
            </div>
            
            <div className="bg-canvas-subtle border border-border rounded-md p-6 flex flex-col justify-center items-center text-center">
              <div className="w-12 h-12 bg-canvas-inset border border-border rounded-full flex items-center justify-center mb-3">
                <Settings className="w-6 h-6 text-accent" />
              </div>
              <h3 className="font-semibold text-fg mb-2">Remediation Effort Estimate</h3>
              <p className="text-sm text-fg-muted">
                Based on findings, resolving critical and high issues will take approximately <span className="text-fg font-semibold">2-4 hours</span>.
              </p>
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content value="findings" className="focus:outline-none animate-fade-in">
          <FindingsTable findings={scan.findings?.all || []} />
        </Tabs.Content>

        <Tabs.Content value="heatmap" className="focus:outline-none animate-fade-in">
          <div className="bg-canvas-subtle border border-border rounded-md p-6">
            <h2 className="text-lg font-bold text-fg mb-6">Risk Distribution Heatmap</h2>
            <RiskHeatmap findings={scan.findings?.byFile || {}} />
          </div>
        </Tabs.Content>

        <Tabs.Content value="ai-report" className="focus:outline-none animate-fade-in">
          <AIReportPanel scan={scan} aiJob={aiJob} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

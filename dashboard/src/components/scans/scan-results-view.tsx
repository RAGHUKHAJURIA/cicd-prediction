'use client';

import { ScanResults, FindingWithPatch } from '@/lib/types/scan.types';
import { 
  FileCode, 
  Terminal, 
  Layers, 
  CheckCircle2, 
  AlertOctagon, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Copy, 
  Check, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink,
  GitPullRequest,
  RefreshCw,
  GitCommit,
  CheckCircle
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { RiskBadge } from '../ui/risk-badge';
import clsx from 'clsx';

interface ScanResultsViewProps {
  results: ScanResults;
  repoId: string;
  onRescan: () => void;
}

export function ScanResultsView({
  results,
  repoId,
  onRescan
}: ScanResultsViewProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [copiedPatchId, setCopiedPatchId] = useState<string | null>(null);
  
  // Action states per patch
  const [actionLoading, setActionLoading] = useState<Record<string, { type: 'push' | 'pr'; loading: boolean }>>({});
  const [actionSuccess, setActionSuccess] = useState<Record<string, { type: 'push' | 'pr'; url: string; number?: number }>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});

  // Accordion state
  const [aiReportOpen, setAiReportOpen] = useState(true);

  // Score count-up on mount
  useEffect(() => {
    const start = 0;
    const end = results.score.value;
    if (start === end) return;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / 1000, 1);
      setAnimatedScore(Math.floor(progress * (end - start) + start));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [results.score.value]);

  const handleCopy = async (patchId: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedPatchId(patchId);
      setTimeout(() => setCopiedPatchId(null), 1500);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handlePushPatch = async (findingId: string, patchId: string) => {
    setActionLoading(p => ({ ...p, [findingId]: { type: 'push', loading: true } }));
    setActionError(p => ({ ...p, [findingId]: '' }));
    try {
      const res = await fetch(`${apiClient['baseUrl']}/api/github/actions/push-patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          repoId,
          scanId: results.scan.id,
          patchIds: [patchId]
        })
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.error ?? errBody.message ?? 'Failed to push patch');
      }

      const body = await res.json();
      setActionSuccess(p => ({
        ...p,
        [findingId]: { type: 'push', url: body.data.commitUrl }
      }));
    } catch (err: any) {
      setActionError(p => ({ ...p, [findingId]: err.message ?? 'Failed to push patch' }));
    } finally {
      setActionLoading(p => ({ ...p, [findingId]: { type: 'push', loading: false } }));
    }
  };

  const handleCreatePR = async (findingId: string, patchId: string) => {
    setActionLoading(p => ({ ...p, [findingId]: { type: 'pr', loading: true } }));
    setActionError(p => ({ ...p, [findingId]: '' }));
    try {
      const res = await fetch(`${apiClient['baseUrl']}/api/github/actions/create-pr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          repoId,
          scanId: results.scan.id,
          baseBranch: results.scan.branch || 'main',
          patchIds: [patchId]
        })
      });

      if (!res.ok) {
        const errBody = await res.json();
        throw new Error(errBody.error ?? errBody.message ?? 'Failed to create pull request');
      }

      const body = await res.json();
      setActionSuccess(p => ({
        ...p,
        [findingId]: { type: 'pr', url: body.data.prUrl, number: body.data.prNumber }
      }));
    } catch (err: any) {
      setActionError(p => ({ ...p, [findingId]: err.message ?? 'Failed to create pull request' }));
    } finally {
      setActionLoading(p => ({ ...p, [findingId]: { type: 'pr', loading: false } }));
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'github-actions':
      case 'github':
        return <FileCode className="w-4 h-4 text-purple-400" />;
      case 'dockerfile':
      case 'docker':
        return <Layers className="w-4 h-4 text-blue-400" />;
      case 'kubernetes':
      case 'k8s':
        return <Terminal className="w-4 h-4 text-teal-400" />;
      default:
        return <FileCode className="w-4 h-4 text-fg-muted" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-danger-subtle/20 text-danger border border-danger-subtle glow-danger">
            <AlertOctagon className="w-3.5 h-3.5" /> Critical
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-severe-subtle/20 text-severe border border-severe-subtle">
            <AlertTriangle className="w-3.5 h-3.5" /> High
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-warning-subtle/20 text-warning border border-warning-subtle">
            <AlertCircle className="w-3.5 h-3.5" /> Medium
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-900/20 text-blue-400 border border-blue-900/50">
            <Info className="w-3.5 h-3.5" /> Low
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-canvas-subtle border border-border text-fg-subtle">
            {severity}
          </span>
        );
    }
  };

  const getWorstSeverityColor = (findingsList: FindingWithPatch[]) => {
    if (findingsList.some(f => f.severity === 'critical')) return 'text-danger';
    if (findingsList.some(f => f.severity === 'high')) return 'text-severe';
    if (findingsList.some(f => f.severity === 'medium')) return 'text-warning';
    if (findingsList.some(f => f.severity === 'low')) return 'text-blue-400';
    return 'text-fg-subtle';
  };

  // Grade color mapping
  const gradeColors = {
    A: '#3fb950',
    B: '#58a6ff',
    C: '#d29922',
    D: '#db6d28',
    F: '#f85149'
  };
  const gradeHex = gradeColors[results.score.grade] || '#f85149';

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Empty state check
  if (results.findings.total === 0 && results.artifacts.length === 0) {
    return (
      <div className="w-full max-w-lg mx-auto text-center py-16 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-canvas-subtle border border-border flex items-center justify-center mx-auto mb-5">
          <FileCode className="w-8 h-8 text-fg-muted" />
        </div>
        <h3 className="text-lg font-semibold text-fg mb-2">
          No CI/CD files detected in this repository
        </h3>
        <p className="text-sm text-fg-muted max-w-sm mx-auto mb-8">
          We couldn't find any GitHub Action workflows, Dockerfiles, Kubernetes manifests, or Jenkinsfiles in this branch. Please verify that your repository contains CI/CD configuration files.
        </p>
        <button
          onClick={onRescan}
          className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-medium transition-colors border border-white/5"
        >
          Check again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-canvas border border-border rounded-lg p-5 shadow-lg">
        {/* Left: Grade + Score */}
        <div className="flex items-center gap-4">
          <div 
            className="w-14 h-14 rounded-full border-[3px] flex items-center justify-center shrink-0 font-bold text-lg font-mono"
            style={{ 
              borderColor: gradeHex,
              color: gradeHex,
              boxShadow: `0 0 12px ${gradeHex}33`
            }}
          >
            {results.score.grade}
          </div>
          <div>
            <div className="text-lg font-bold text-fg flex items-center gap-2">
              Grade {results.score.grade}
              <span className="text-xs font-mono font-medium text-fg-muted">
                Score: {animatedScore}/100
              </span>
            </div>
            <p className="text-xs text-fg-muted">
              Pipeline risk evaluation
            </p>
          </div>
        </div>

        {/* Center: Finding Counts */}
        <div className="flex flex-wrap items-center gap-3 md:gap-5">
          <button 
            onClick={() => scrollToSection('sec-critical')} 
            className="flex items-center gap-1.5 px-3 py-1 bg-canvas-subtle border border-border rounded-md hover:bg-canvas-inset transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-danger" />
            <span className="text-xs font-mono text-fg font-medium">{results.findings.critical}</span>
            <span className="text-[10px] text-fg-muted uppercase font-bold">Critical</span>
          </button>
          <button 
            onClick={() => scrollToSection('sec-high')}
            className="flex items-center gap-1.5 px-3 py-1 bg-canvas-subtle border border-border rounded-md hover:bg-canvas-inset transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-severe" />
            <span className="text-xs font-mono text-fg font-medium">{results.findings.high}</span>
            <span className="text-[10px] text-fg-muted uppercase font-bold">High</span>
          </button>
          <button 
            onClick={() => scrollToSection('sec-medium')}
            className="flex items-center gap-1.5 px-3 py-1 bg-canvas-subtle border border-border rounded-md hover:bg-canvas-inset transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-warning" />
            <span className="text-xs font-mono text-fg font-medium">{results.findings.medium}</span>
            <span className="text-[10px] text-fg-muted uppercase font-bold">Medium</span>
          </button>
          <button 
            onClick={() => scrollToSection('sec-low')}
            className="flex items-center gap-1.5 px-3 py-1 bg-canvas-subtle border border-border rounded-md hover:bg-canvas-inset transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-xs font-mono text-fg font-medium">{results.findings.low}</span>
            <span className="text-[10px] text-fg-muted uppercase font-bold">Low</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
          {results.aiReport && (
            <button
              onClick={() => scrollToSection('ai-report-accordion')}
              className="flex-1 md:flex-none text-center px-4 py-2 border border-border rounded-md text-xs font-medium text-fg hover:bg-canvas-subtle transition-colors"
            >
              View full report
            </button>
          )}
          <button
            onClick={onRescan}
            className="flex-1 md:flex-none px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-medium transition-colors border border-white/5"
          >
            Re-scan repo
          </button>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Files list */}
        <div className="lg:col-span-4 bg-canvas-subtle border border-border rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-fg uppercase tracking-wider">
            Files Analyzed
          </h3>
          <div className="divide-y divide-border max-h-[450px] overflow-y-auto pr-1">
            {results.artifacts.map((art, idx) => {
              const fileFindings = results.findings.all.filter(f => f.filePath === art.filePath);
              const count = fileFindings.length;
              const worstColor = count > 0 ? getWorstSeverityColor(fileFindings) : 'text-success';

              return (
                <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {getFileIcon(art.fileType)}
                    <span 
                      className="text-xs font-mono text-fg truncate"
                      title={art.filePath}
                    >
                      {art.filePath.split('/').pop()}
                    </span>
                  </div>

                  <span className={clsx("text-xs font-mono font-semibold shrink-0", worstColor)}>
                    {count} {count === 1 ? 'issue' : 'issues'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Findings list */}
        <div className="lg:col-span-8 space-y-6">
          <h3 className="text-sm font-semibold text-fg uppercase tracking-wider">
            Diagnostics & Remediations
          </h3>

          {/* Grouped findings by Severity */}
          {results.findings.total > 0 ? (
            <div className="space-y-8">
              {['critical', 'high', 'medium', 'low'].map(severity => {
                const list = results.findings.all.filter(f => f.severity === severity);
                if (list.length === 0) return null;

                return (
                  <div key={severity} id={`sec-${severity}`} className="space-y-4">
                    <h4 className="text-xs font-bold text-fg-muted uppercase tracking-wider flex items-center gap-2">
                      <span className={clsx(
                        "w-2 h-2 rounded-full",
                        severity === 'critical' && "bg-danger shadow-[0_0_8px_rgba(248,81,73,0.6)]",
                        severity === 'high' && "bg-severe",
                        severity === 'medium' && "bg-warning",
                        severity === 'low' && "bg-blue-400"
                      )} />
                      {severity} ({list.length})
                    </h4>

                    <div className="space-y-4">
                      {list.map((finding) => {
                        const hasPatch = !!finding.patch;
                        const hasExplanation = !!finding.explanation;
                        const isPushLoading = actionLoading[finding.id]?.type === 'push' && actionLoading[finding.id]?.loading;
                        const isPrLoading = actionLoading[finding.id]?.type === 'pr' && actionLoading[finding.id]?.loading;
                        const isActionSuccess = actionSuccess[finding.id];
                        const isActionError = actionError[finding.id];

                        return (
                          <div 
                            key={finding.id}
                            className="bg-canvas border border-border hover:border-border-hover rounded-lg p-5 shadow-sm space-y-4 transition-all"
                          >
                            {/* Header */}
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getSeverityBadge(finding.severity)}
                                  <span className="text-[10px] font-mono font-semibold bg-canvas-inset px-2 py-0.5 rounded border border-border text-fg-muted">
                                    {finding.ruleId}
                                  </span>
                                  {hasPatch && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success-subtle/10 text-success border border-success-subtle/30">
                                      <Sparkles className="w-3 h-3 animate-pulse" /> AI Fix Available
                                    </span>
                                  )}
                                </div>
                                <h5 className="text-sm font-semibold text-fg mt-1.5">
                                  {finding.title}
                                </h5>
                              </div>
                              <span className="text-xs font-mono text-fg-muted">
                                {finding.filePath}:{finding.line ?? 'unknown'}
                              </span>
                            </div>

                            {/* Description */}
                            <p className="text-xs text-fg-muted leading-relaxed">
                              {finding.description}
                            </p>

                            {/* AI Explanation details */}
                            {hasExplanation && finding.explanation && (
                              <div className="p-4 bg-canvas-subtle border border-border rounded-md text-xs space-y-2">
                                <div className="font-semibold text-fg flex items-center gap-1">
                                  <Sparkles className="w-3.5 h-3.5 text-[#a371f7]" /> Claude Explanation
                                </div>
                                <div className="text-fg-muted whitespace-pre-wrap leading-relaxed">
                                  {finding.explanation.explanation}
                                </div>
                                {finding.explanation.riskContext && (
                                  <div className="pt-2 border-t border-border mt-2">
                                    <span className="font-medium text-fg">Risk Context:</span>{' '}
                                    <span className="text-fg-subtle">{finding.explanation.riskContext}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Patch Diff Box */}
                            {hasPatch && finding.patch && (
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-fg">AI Fix Code Suggestion</span>
                                    {finding.patch.safe && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-success-subtle/15 text-success border border-success-subtle/30">
                                        ✓ Validated by rule engine
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleCopy(finding.patch!.id, finding.patch!.afterCode ?? '')}
                                    className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
                                  >
                                    {copiedPatchId === finding.patch.id ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-success" />
                                        <span className="text-success font-medium">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3.5 h-3.5" />
                                        <span>Copy fix</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                {/* BEFORE/AFTER Diff panel */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {/* Before */}
                                  <div className="border border-border rounded-md overflow-hidden bg-canvas-inset">
                                    <div className="px-3 py-1.5 bg-danger-subtle/5 border-b border-border text-[10px] font-mono text-danger font-medium">
                                      BEFORE
                                    </div>
                                    <pre className="p-3 font-mono text-[11px] leading-snug overflow-x-auto whitespace-pre bg-danger-subtle/5 text-danger-subtle max-h-[200px]">
                                      {finding.patch.beforeCode?.split('\n').map((line, l) => (
                                        <div key={l} className="flex"><span className="w-4 select-none opacity-50">-</span>{line}</div>
                                      )) || 'No original code available'}
                                    </pre>
                                  </div>

                                  {/* After */}
                                  <div className="border border-border rounded-md overflow-hidden bg-canvas-inset">
                                    <div className="px-3 py-1.5 bg-success-subtle/5 border-b border-border text-[10px] font-mono text-success font-medium">
                                      AFTER (FIXED)
                                    </div>
                                    <pre className="p-3 font-mono text-[11px] leading-snug overflow-x-auto whitespace-pre bg-success-subtle/5 text-success-subtle max-h-[200px]">
                                      {finding.patch.afterCode?.split('\n').map((line, l) => (
                                        <div key={l} className="flex"><span className="w-4 select-none opacity-50">+</span>{line}</div>
                                      )) || 'No remediation code available'}
                                    </pre>
                                  </div>
                                </div>

                                {/* PR/Push actions */}
                                <div className="pt-2 flex flex-wrap items-center gap-3">
                                  <button
                                    onClick={() => handlePushPatch(finding.id, finding.patch!.id)}
                                    disabled={isPushLoading || isPrLoading || !!isActionSuccess}
                                    className={clsx(
                                      "inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-semibold transition-all",
                                      isActionSuccess?.type === 'push'
                                        ? "bg-success-subtle/10 border-success-subtle text-success"
                                        : "bg-canvas hover:bg-canvas-subtle border-border hover:border-border-hover text-fg disabled:opacity-50"
                                    )}
                                  >
                                    {isPushLoading ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : isActionSuccess?.type === 'push' ? (
                                      <CheckCircle className="w-3.5 h-3.5 text-success" />
                                    ) : (
                                      <GitCommit className="w-3.5 h-3.5" />
                                    )}
                                    <span>
                                      {isPushLoading 
                                        ? 'Pushing...' 
                                        : isActionSuccess?.type === 'push' 
                                          ? 'Pushed to GitHub!' 
                                          : 'Push patch file'}
                                    </span>
                                  </button>

                                  <button
                                    onClick={() => handleCreatePR(finding.id, finding.patch!.id)}
                                    disabled={isPushLoading || isPrLoading || !!isActionSuccess}
                                    className={clsx(
                                      "inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-xs font-semibold transition-all",
                                      isActionSuccess?.type === 'pr'
                                        ? "bg-success-subtle/10 border-success-subtle text-success"
                                        : "bg-canvas hover:bg-canvas-subtle border-border hover:border-border-hover text-fg disabled:opacity-50"
                                    )}
                                  >
                                    {isPrLoading ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : isActionSuccess?.type === 'pr' ? (
                                      <CheckCircle className="w-3.5 h-3.5 text-success" />
                                    ) : (
                                      <GitPullRequest className="w-3.5 h-3.5" />
                                    )}
                                    <span>
                                      {isPrLoading 
                                        ? 'Creating PR...' 
                                        : isActionSuccess?.type === 'pr' 
                                          ? 'PR Created!' 
                                          : 'Create PR'}
                                    </span>
                                  </button>

                                  {isActionSuccess && (
                                    <a
                                      href={isActionSuccess.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium ml-2"
                                    >
                                      View on GitHub <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>

                                {isActionError && (
                                  <p className="text-xs text-danger font-medium mt-1">
                                    Error: {isActionError}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-border border-dashed rounded-lg p-12 text-center bg-canvas">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4 animate-bounce" />
              <h4 className="text-md font-bold text-fg mb-1">
                No issues found! Grade A pipeline.
              </h4>
              <p className="text-xs text-fg-muted max-w-sm mx-auto leading-relaxed">
                Your configurations are clean, safe, and adhere to all reliability best practices. Keep it up!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI Report Section */}
      {results.aiReport && (
        <div 
          id="ai-report-accordion" 
          className="border border-border rounded-lg bg-canvas overflow-hidden shadow-lg"
        >
          <button
            onClick={() => setAiReportOpen(!aiReportOpen)}
            className="w-full flex justify-between items-center p-5 bg-canvas-subtle hover:bg-canvas transition-colors border-b border-border"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#a371f7]" />
              <h3 className="text-sm font-semibold text-fg uppercase tracking-wider">
                Claude Deep Reliability Analysis
              </h3>
            </div>
            {aiReportOpen ? <ChevronUp className="w-4 h-4 text-fg-muted" /> : <ChevronDown className="w-4 h-4 text-fg-muted" />}
          </button>

          {aiReportOpen && (
            <div className="p-6 space-y-6 divide-y divide-border">
              {/* Executive Summary */}
              {results.aiReport.executiveSummary && (
                <div className="space-y-2 first:pt-0">
                  <h4 className="text-xs font-bold text-[#a371f7] uppercase tracking-wider">
                    Executive Summary
                  </h4>
                  <p className="text-xs text-fg-muted leading-relaxed whitespace-pre-wrap">
                    {results.aiReport.executiveSummary}
                  </p>
                </div>
              )}

              {/* Top Risks */}
              {results.aiReport.topRisks && results.aiReport.topRisks.length > 0 && (
                <div className="pt-5 space-y-3">
                  <h4 className="text-xs font-bold text-[#a371f7] uppercase tracking-wider">
                    Top Priority Risks
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.aiReport.topRisks.map((risk, index) => (
                      <div 
                        key={index} 
                        className={clsx(
                          "p-4 bg-canvas-subtle border rounded-md relative overflow-hidden",
                          risk.severity?.toLowerCase() === 'critical' ? 'border-danger/30' : 'border-border'
                        )}
                      >
                        <span className={clsx(
                          "absolute top-2 right-3 text-2xl font-black opacity-15",
                          risk.severity?.toLowerCase() === 'critical' ? 'text-danger' : 'text-fg-muted'
                        )}>
                          #{risk.rank ?? index + 1}
                        </span>
                        <div className="flex items-center gap-2 mb-2">
                          {risk.severity && (
                            <span className={clsx(
                              "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                              risk.severity.toLowerCase() === 'critical' ? 'bg-danger-subtle/10 text-danger border border-danger-subtle/30' : 'bg-canvas border border-border text-fg-muted'
                            )}>
                              {risk.severity}
                            </span>
                          )}
                          <span className="text-xs font-bold text-fg truncate max-w-[200px]">
                            {risk.title}
                          </span>
                        </div>
                        <p className="text-xs text-fg-muted leading-relaxed">
                          {risk.narrative}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Plan */}
              {results.aiReport.prioritizedActionPlan && results.aiReport.prioritizedActionPlan.length > 0 && (
                <div className="pt-5 space-y-4">
                  <h4 className="text-xs font-bold text-[#a371f7] uppercase tracking-wider">
                    Prioritized Action Plan
                  </h4>
                  <div className="relative border-l border-border pl-6 space-y-6 ml-3">
                    {results.aiReport.prioritizedActionPlan.map((step, index) => (
                      <div key={index} className="relative">
                        {/* Dot indicator */}
                        <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-canvas border border-border flex items-center justify-center text-[9px] font-bold text-fg-muted shadow-sm">
                          {step.priority ?? index + 1}
                        </div>
                        <div className="flex justify-between items-start gap-4 mb-1">
                          <h5 className="text-xs font-bold text-fg">
                            {step.action}
                          </h5>
                          {step.estimatedEffort && (
                            <span className="text-[10px] font-medium bg-canvas-inset border border-border px-2 py-0.5 rounded-full text-fg-muted shrink-0">
                              Effort: {step.estimatedEffort}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-fg-muted leading-relaxed">
                          {step.reasoning}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

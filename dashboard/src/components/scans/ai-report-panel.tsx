// @ts-nocheck
'use client';

import { ScanDetail, AIJobStatus } from '@/lib/types';
import { Sparkles, CheckCircle2, Circle, AlertCircle, Wrench, ShieldCheck, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useSWRConfig } from 'swr';
import clsx from 'clsx';
import * as Collapsible from '@radix-ui/react-collapsible';

interface AIReportPanelProps {
  scan: ScanDetail;
  aiJob: AIJobStatus | null | undefined;
}

export function AIReportPanel({ scan, aiJob }: AIReportPanelProps) {
  const { mutate } = useSWRConfig();
  const [isGenerating, setIsGenerating] = useState(false);
  const [openRemediations, setOpenRemediations] = useState<Record<string, boolean>>({});

  const report = scan.analysisReport;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await apiClient.startAIReport(scan.id);
      // We start polling for this aiJob. But for now, SWR on the page handles it if we mutate
      mutate(`scan:${scan.repoId}:${scan.id}`);
      // Also mutate the AI job explicitly to start polling
      mutate(`ai-job:${scan.id}:${res.jobId}`);
    } catch (e) {
      console.error(e);
      setIsGenerating(false);
    }
  };

  const isRunning = aiJob?.status === 'pending' || aiJob?.status === 'running' || isGenerating;

  if (isRunning) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <div className="relative w-64 h-2 bg-canvas-inset rounded-full overflow-hidden mb-6 border border-border">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-accent to-[#a371f7] transition-all duration-300"
            style={{ width: `${Math.max(10, aiJob?.progress || 10)}%` }}
          />
        </div>
        <div className="flex items-center gap-3 text-fg">
          <Sparkles className="w-5 h-5 text-[#a371f7] animate-pulse" />
          <span className="font-medium">
            {aiJob?.progress && aiJob.progress < 33 ? 'Analyzing findings...' :
             aiJob?.progress && aiJob.progress < 66 ? 'Predicting failure scenarios...' :
             'Generating remediation plans...'}
          </span>
        </div>
        <p className="text-sm text-fg-muted mt-2">This usually takes about 15-20 seconds.</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-canvas-subtle border border-border flex items-center justify-center mb-4 glow-accent">
          <Sparkles className="w-8 h-8 text-accent" />
        </div>
        <h2 className="text-xl font-bold text-fg mb-2">Comprehensive AI Analysis</h2>
        <p className="text-fg-muted max-w-md mb-8">
          Unleash Claude to deeply analyze your pipeline, predict potential production failures, and generate exact code patches to fix issues before they happen.
        </p>
        <button
          onClick={handleGenerate}
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white rounded-md font-medium transition-all shadow-[0_0_20px_rgba(31,111,235,0.4)] flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" /> Generate Full AI Report
        </button>
        <div className="mt-8 text-sm text-fg-subtle text-left space-y-2">
          <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Executive Summary & Health Assessment</p>
          <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Prioritized Top Risks</p>
          <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Step-by-step Action Plan</p>
          <p className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Exact Remediation Diff Patches</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* SECTION 1: Executive Summary */}
      <section className="bg-canvas-subtle rounded-lg p-6 relative overflow-hidden border border-border">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent via-[#a371f7] to-accent" />
        <h2 className="text-lg font-bold text-fg mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#a371f7]" /> Executive Summary
        </h2>
        <div className="text-fg-muted leading-relaxed whitespace-pre-wrap mb-4 text-sm">
          {report.summary}
        </div>
        <div className="p-4 bg-canvas border border-border rounded-md">
          <span className="font-semibold text-fg">Overall Health: </span>
          <span className="italic text-fg-muted">{report.overallHealth}</span>
        </div>
      </section>

      {/* SECTION 2: Top Risks */}
      <section>
        <h2 className="text-lg font-bold text-fg mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-danger" /> Top Priority Risks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {report.topRisks.map((risk, idx) => (
            <div key={idx} className={clsx(
              "bg-canvas-subtle border rounded-md p-5 relative overflow-hidden group transition-all",
              risk.severity === 'critical' ? 'border-danger/50 hover:border-danger hover:glow-danger' : 
              risk.severity === 'high' ? 'border-severe/50 hover:border-severe' : 'border-warning/50 hover:border-warning hover:glow-warning'
            )}>
              <div className="absolute top-2 right-2 text-4xl font-bold text-border/40 group-hover:text-border transition-colors">
                #{idx + 1}
              </div>
              <span className={clsx(
                "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border mb-3",
                risk.severity === 'critical' ? 'text-danger border-danger-subtle bg-danger-subtle/20' : 
                risk.severity === 'high' ? 'text-severe border-severe-subtle bg-severe-subtle/20' : 'text-warning border-warning-subtle bg-warning-subtle/20'
              )}>
                {risk.severity}
              </span>
              <h3 className="font-semibold text-fg mb-2 relative z-10 pr-8">{risk.title}</h3>
              <p className="text-xs text-fg-muted mb-4 relative z-10 leading-relaxed">{risk.description}</p>
              
              <div className="flex flex-wrap gap-1 relative z-10 mt-auto">
                {risk.affectedFiles.map((f, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-canvas border border-border rounded font-mono text-fg-subtle truncate max-w-[150px]" title={f}>
                    {f.split('/').pop()}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: Action Plan */}
      <section className="bg-canvas-subtle border border-border rounded-lg p-6">
        <h2 className="text-lg font-bold text-fg mb-6 flex items-center gap-2">
          <Wrench className="w-5 h-5 text-accent" /> Recommended Action Plan
        </h2>
        <div className="space-y-6">
          {report.actionPlan.map((action, idx) => (
            <div key={idx} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-canvas border border-border flex items-center justify-center text-fg font-bold shrink-0 shadow-[0_0_10px_rgba(31,111,235,0.1)]">
                  {action.priority}
                </div>
                {idx < report.actionPlan.length - 1 && <div className="w-px h-full bg-border mt-2" />}
              </div>
              <div className="pb-6 w-full">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-fg text-sm">{action.action}</h3>
                  <span className="text-[10px] font-medium bg-canvas-inset border border-border px-2 py-0.5 rounded-full text-fg-muted">
                    Effort: {action.effort}
                  </span>
                </div>
                <p className="text-xs text-fg-muted mb-3 leading-relaxed">{action.reasoning}</p>
                <div className="flex gap-2">
                  {action.rules.map((rule, i) => (
                    <span key={i} className="text-[10px] font-mono bg-canvas border border-border px-1.5 py-0.5 rounded text-accent">
                      {rule}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4: Remediations (Mocked data, since our types only show aiJob.remediationReport, we'll assume it's part of the aiJob or we just show a placeholder accordion based on findings) */}
      {aiJob?.remediationReport?.remediations && (
        <section>
          <h2 className="text-lg font-bold text-fg mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-success" /> Generated Patches
          </h2>
          <div className="border border-border rounded-md overflow-hidden bg-canvas">
            {aiJob.remediationReport.remediations.map((rem, i) => (
              <Collapsible.Root 
                key={i} 
                open={openRemediations[rem.findingId] || false}
                onOpenChange={(open) => setOpenRemediations(p => ({...p, [rem.findingId]: open}))}
                className={clsx("border-b border-border last:border-b-0", openRemediations[rem.findingId] && "bg-canvas-subtle")}
              >
                <Collapsible.Trigger className="w-full flex items-center justify-between p-4 hover:bg-canvas-subtle transition-colors">
                  <div className="flex items-center gap-3">
                    {openRemediations[rem.findingId] ? <ChevronDown className="w-4 h-4 text-fg-muted" /> : <ChevronRight className="w-4 h-4 text-fg-muted" />}
                    <span className="text-sm font-medium text-fg text-left">{rem.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      "text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1",
                      rem.validationStatus === 'valid' ? 'text-success border-success-subtle bg-success-subtle/20' :
                      rem.validationStatus === 'fallback' ? 'text-warning border-warning-subtle bg-warning-subtle/20' :
                      'text-severe border-severe-subtle bg-severe-subtle/20'
                    )}>
                      {rem.validationStatus === 'valid' && <ShieldCheck className="w-3 h-3" />}
                      {rem.validationStatus}
                    </span>
                  </div>
                </Collapsible.Trigger>
                
                <Collapsible.Content className="p-4 border-t border-border bg-canvas">
                  {rem.patch ? (
                    <div className="space-y-4">
                      <div className="bg-canvas-inset border border-border rounded-md overflow-hidden font-mono text-[11px] leading-snug">
                        <div className="flex justify-between items-center px-3 py-1.5 bg-canvas-subtle border-b border-border">
                          <span className="text-fg-muted">Suggested Patch</span>
                          <button className="text-fg-muted hover:text-fg"><Copy className="w-3 h-3" /></button>
                        </div>
                        <div className="p-3 overflow-x-auto whitespace-pre">
                          {rem.patch.before.split('\n').map((line, l) => (
                            <div key={`b-${l}`} className="flex text-danger bg-danger-subtle/10 px-2 rounded-sm"><span className="w-6 text-danger/50 select-none">-</span>{line}</div>
                          ))}
                          {rem.patch.after.split('\n').map((line, l) => (
                            <div key={`a-${l}`} className="flex text-success bg-success-subtle/10 px-2 rounded-sm"><span className="w-6 text-success/50 select-none">+</span>{line}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-fg-muted italic">Manual review required. No automated patch could be generated safely.</p>
                  )}
                </Collapsible.Content>
              </Collapsible.Root>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

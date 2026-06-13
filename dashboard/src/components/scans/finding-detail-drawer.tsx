import * as Dialog from '@radix-ui/react-dialog';
import { X, Sparkles, AlertTriangle, ShieldCheck, Copy, ChevronRight, ChevronDown } from 'lucide-react';
import { Finding, AIJobStatus } from '@/lib/types';
import clsx from 'clsx';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiClient } from '@/lib/api-client';

/** Detect patches that contain placeholder tokens or manual-review markers */
function isManualReviewPatch(remediation: string): boolean {
  if (!remediation) return false;
  const markers = [
    'REPLACE_WITH', '{REPLACE_WITH_SHA}', 'YOUR_COMMAND_HERE',
    'MANUAL REVIEW', 'MANUAL_REVIEW', 'manual-review-required',
    'TODO:', 'FIXME:', 'PLACEHOLDER',
    '⚠️ MANUAL REVIEW'
  ];
  const lower = remediation.toLowerCase();
  return markers.some(m => lower.includes(m.toLowerCase()));
}

interface FindingDetailDrawerProps {
  finding: Finding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiExplanation?: AIJobStatus | null;
}

export function FindingDetailDrawer({ finding, open, onOpenChange, aiExplanation }: FindingDetailDrawerProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const { mutate } = useSWRConfig();
  const [showFailureScenario, setShowFailureScenario] = useState(true);

  if (!finding) return null;

  const handleGenerateExplain = async () => {
    setIsGenerating(true);
    try {
      const res = await apiClient.startExplain(finding.scanId);
      // We need to tell the parent or SWR to start polling this jobId, but for now we'll just trigger a refresh of the scan
      mutate(`scan:${finding.repoId}:${finding.scanId}`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const getSeverityColor = (sev: string) => {
    switch(sev) {
      case 'critical': return 'text-danger bg-danger-subtle border-danger';
      case 'high': return 'text-severe bg-severe-subtle border-severe';
      case 'medium': return 'text-warning bg-warning-subtle border-warning';
      case 'low': return 'text-blue-400 bg-blue-900/30 border-blue-400';
      default: return 'text-fg-subtle bg-canvas-inset border-border';
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-canvas/80 backdrop-blur-sm z-50 md:hidden animate-fade-in" />
        <Dialog.Content className="fixed right-0 top-0 bottom-0 w-full md:w-[480px] bg-canvas-subtle border-l border-border shadow-2xl z-50 overflow-y-auto animate-slide-in flex flex-col">
          
          {/* Header */}
          <div className="p-6 border-b border-border bg-canvas">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <span className={clsx("px-2 py-0.5 rounded-full text-[10px] uppercase font-bold border", getSeverityColor(finding.severity))}>
                  {finding.severity}
                </span>
                <span className="text-xs font-mono text-fg-muted">{finding.ruleId}</span>
              </div>
              <Dialog.Close className="text-fg-muted hover:text-fg transition-colors">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>
            <h2 className="text-xl font-semibold text-fg mb-2">{finding.title}</h2>
            <div className="text-sm font-mono text-fg-subtle bg-canvas-inset px-3 py-1.5 rounded border border-border inline-block">
              {finding.filePath}{finding.line ? `:${finding.line}` : ''}
            </div>
          </div>

          <div className="flex-1 p-6 space-y-8">
            
            {/* Description */}
            <section>
              <h3 className="text-sm font-semibold text-fg mb-2 uppercase tracking-wider">What's the issue</h3>
              <p className="text-sm text-fg-muted leading-relaxed">{finding.description}</p>
            </section>

            {/* AI Explanation (if available) */}
            <section>
              <h3 className="text-sm font-semibold text-fg mb-3 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#a371f7]" /> Why this is risky
              </h3>
              
              {aiExplanation?.explanation ? (
                <div className="bg-canvas border border-border rounded-md overflow-hidden relative group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#a371f7] to-[#1f6feb]" />
                  <div className="p-4 pl-5">
                    <p className="text-sm text-fg leading-relaxed mb-3">
                      {aiExplanation.explanation.plainEnglishRisk}
                    </p>
                    <p className="text-xs text-fg-muted mb-4">
                      {aiExplanation.explanation.technicalDetail}
                    </p>
                    
                    {aiExplanation.explanation.failureScenario && (
                      <div className="border border-border rounded-md overflow-hidden bg-canvas-subtle">
                        <button 
                          className="w-full px-3 py-2 flex items-center justify-between text-xs font-medium text-fg hover:bg-canvas transition-colors"
                          onClick={() => setShowFailureScenario(!showFailureScenario)}
                        >
                          <span className="flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-warning" /> Failure Scenario</span>
                          {showFailureScenario ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        {showFailureScenario && (
                          <div className="px-3 py-3 border-t border-border text-xs text-warning bg-warning-subtle/10 leading-relaxed">
                            {aiExplanation.explanation.failureScenario}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-canvas border border-border border-dashed rounded-md p-4 text-center">
                  <p className="text-sm text-fg-muted mb-3">Generate AI explanation for deep context.</p>
                  <button 
                    onClick={handleGenerateExplain}
                    disabled={isGenerating || aiExplanation?.status === 'pending' || aiExplanation?.status === 'running'}
                    className="px-4 py-2 bg-canvas-subtle hover:bg-border-muted border border-border text-fg text-sm rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
                  >
                    {isGenerating || aiExplanation?.status === 'pending' || aiExplanation?.status === 'running' ? (
                      <><span className="w-4 h-4 rounded-full border-2 border-fg-muted border-t-transparent animate-spin"/> Generating...</>
                    ) : (
                      <><Sparkles className="w-4 h-4" /> Generate Explanation</>
                    )}
                  </button>
                </div>
              )}
            </section>

            {/* Remediation */}
            <section>
              <h3 className="text-sm font-semibold text-fg mb-2 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-success" /> How to fix it
              </h3>
              {isManualReviewPatch(finding.remediation) ? (
                <div className="border border-warning/30 rounded-md overflow-hidden">
                  <div className="px-4 py-2 bg-warning-subtle/20 border-b border-warning/20 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    <span className="text-xs font-semibold text-warning uppercase tracking-wider">Manual review required</span>
                  </div>
                  <div className="p-4 bg-canvas text-sm text-fg-muted leading-relaxed whitespace-pre-wrap font-mono">
                    {finding.remediation}
                  </div>
                  <div className="px-4 py-2 bg-canvas-subtle border-t border-border flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(finding.remediation);
                      }}
                      className="px-3 py-1.5 bg-canvas hover:bg-border-muted border border-border text-fg text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
                    >
                      <Copy className="w-3 h-3" /> Copy snippet
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border border-success/30 rounded-md overflow-hidden">
                  <div className="px-4 py-2 bg-green-900/20 border-b border-success/20 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <span className="text-xs font-semibold text-success uppercase tracking-wider">Auto-fix available</span>
                  </div>
                  <div className="p-4 bg-canvas text-sm text-fg-muted leading-relaxed whitespace-pre-wrap">
                    {finding.remediation}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Footer actions */}
          <div className="p-4 border-t border-border bg-canvas flex gap-3">
            <button className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-md transition-colors shadow-[0_0_10px_rgba(31,111,235,0.2)]">
              Mark as resolved
            </button>
            <button className="px-4 py-2 bg-canvas-subtle hover:bg-border-muted border border-border text-fg text-sm font-medium rounded-md transition-colors flex items-center gap-2">
              <Copy className="w-4 h-4" /> Copy ID
            </button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

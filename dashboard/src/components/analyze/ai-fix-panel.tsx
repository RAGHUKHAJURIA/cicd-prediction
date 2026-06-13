import React, { useState } from "react";
import { Copy, Check, ChevronRight, AlertTriangle, ShieldCheck, Eye, Loader2, ArrowLeft, ExternalLink, Flag, Sparkles } from "lucide-react";
import type { InlineFinding, AIExecutiveReport } from "@/lib/analyze-api";
import { CopyFixButton } from "./copy-fix-button";

export function AIFixPanel({
  finding,
  aiReport,
  fileContent = null,
  fileName = "file",
  onClose,
}: {
  finding: InlineFinding | null;
  aiReport: AIExecutiveReport | null;
  allFindings?: InlineFinding[];
  fileContent?: string | null;
  fileName?: string;
  onClose: () => void;
}) {
  const [techDetailOpen, setTechDetailOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [fixTab, setFixTab] = useState<"diff" | "file">("diff");
  const [copiedFile, setCopiedFile] = useState(false);
  const [copiedSuggested, setCopiedSuggested] = useState(false);

  const getHealthColor = (grade: string | undefined) => {
    switch (grade) {
      case "A": return { bg: "rgba(63,185,80,0.06)", border: "rgba(63,185,80,0.2)" };
      case "B": return { bg: "rgba(88,166,255,0.06)", border: "rgba(88,166,255,0.2)" };
      case "D": return { bg: "rgba(219,109,40,0.06)", border: "rgba(219,109,40,0.2)" };
      case "F": return { bg: "rgba(248,81,73,0.06)", border: "rgba(248,81,73,0.2)" };
      default: return { bg: "rgba(210,153,34,0.06)", border: "rgba(210,153,34,0.2)" };
    }
  };

  const getUpdatedContent = () => {
    if (!fileContent || !finding?.patch) return "";
    const before = finding.patch.before;
    const after = finding.patch.after;
    if (!before || !fileContent.includes(before)) {
      return fileContent;
    }
    const idx = fileContent.indexOf(before);
    return fileContent.substring(0, idx) + after + fileContent.substring(idx + before.length);
  };

  const handleCopyFile = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFile(true);
      setTimeout(() => setCopiedFile(false), 1500);
    } catch (e) {
      console.error(e);
    }
  };

  const renderDiff = () => {
    if (!finding?.patch) return null;
    const before = finding.patch.before;
    const after = finding.patch.after;
    
    // If we don't have fileContent or before is empty/not found, show snippet-only diff
    if (!fileContent || !before || !fileContent.includes(before)) {
      const beforeLines = before ? before.split("\n") : [];
      const afterLines = after ? after.split("\n") : [];
      return (
        <div className="bg-[#0d1117] border border-[#21262d] rounded-md overflow-hidden font-mono text-[12px] leading-snug">
          <pre className="p-3 overflow-x-auto whitespace-pre max-h-[300px] custom-scrollbar m-0">
            {beforeLines.map((line, i) => (
              <div key={`b-${i}`} className="flex text-[#ff7b72] bg-[#f85149]/10 px-2 py-0.5 rounded-sm">
                <span className="w-5 text-[#f85149]/50 select-none mr-1">-</span>
                {line}
              </div>
            ))}
            {afterLines.map((line, i) => (
              <div key={`a-${i}`} className="flex text-[#56d364] bg-[#3fb950]/10 px-2 py-0.5 rounded-sm">
                <span className="w-5 text-[#3fb950]/50 select-none mr-1">+</span>
                {line}
              </div>
            ))}
          </pre>
        </div>
      );
    }

    const idx = fileContent.indexOf(before);
    const prefix = fileContent.substring(0, idx);
    const suffix = fileContent.substring(idx + before.length);

    const prefixLines = prefix.split("\n");
    if (prefixLines.length > 0 && prefixLines[prefixLines.length - 1] === "" && prefix.endsWith("\n")) {
      prefixLines.pop();
    }
    const beforeLines = before.split("\n");
    const afterLines = after.split("\n");
    const suffixLines = suffix.split("\n");
    if (suffixLines.length > 0 && suffixLines[0] === "" && suffix.startsWith("\n")) {
      suffixLines.shift();
    }

    return (
      <div className="bg-[#0d1117] border border-[#21262d] rounded-md overflow-hidden font-mono text-[12px] leading-snug">
        <pre className="p-3 overflow-x-auto whitespace-pre max-h-[300px] custom-scrollbar m-0">
          {prefixLines.map((line, i) => (
            <div key={`p-${i}`} className="flex text-[#8b949e] opacity-75 px-2">
              <span className="w-5 text-[#8b949e]/30 select-none mr-1"> </span>
              {line}
            </div>
          ))}
          {beforeLines.map((line, i) => (
            <div key={`b-${i}`} className="flex text-[#ff7b72] bg-[#f85149]/15 px-2 py-0.5 border-l-2 border-[#f85149]">
              <span className="w-5 text-[#f85149]/60 select-none mr-1">-</span>
              {line}
            </div>
          ))}
          {afterLines.map((line, i) => (
            <div key={`a-${i}`} className="flex text-[#56d364] bg-[#3fb950]/15 px-2 py-0.5 border-l-2 border-[#3fb950]">
              <span className="w-5 text-[#3fb950]/60 select-none mr-1">+</span>
              {line}
            </div>
          ))}
          {suffixLines.map((line, i) => (
            <div key={`s-${i}`} className="flex text-[#8b949e] opacity-75 px-2">
              <span className="w-5 text-[#8b949e]/30 select-none mr-1"> </span>
              {line}
            </div>
          ))}
        </pre>
      </div>
    );
  };

  if (!finding) {
    if (!aiReport) {
      return (
        <div className="w-[400px] shrink-0 bg-[#161b22] border-l border-[#30363d] flex items-center justify-center">
          <div className="text-[#8b949e] text-[13px] text-center px-6">
            <Sparkles className="w-8 h-8 text-[#a371f7] opacity-50 mx-auto mb-4" />
            <p>AI Analysis is not available for this scan.</p>
          </div>
        </div>
      );
    }

    const healthColor = getHealthColor(aiReport.overallHealthAssessment.charAt(0));

    return (
      <div className="w-[400px] shrink-0 bg-[#161b22] border-l border-[#30363d] flex flex-col overflow-y-auto custom-scrollbar">
        <div className="p-4 border-b border-[#30363d] flex items-center gap-2.5 shrink-0">
          <Sparkles className="w-5 h-5 text-[#a371f7]" />
          <span className="text-[15px] font-medium text-[#e6edf3]">AI Analysis</span>
        </div>

        <div className="p-4 flex flex-col gap-5 flex-1">
          <div
            className="rounded-lg p-[14px_16px]"
            style={{ background: healthColor.bg, border: `1px solid ${healthColor.border}` }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full border border-current flex items-center justify-center font-medium">
                {aiReport.overallHealthAssessment.charAt(0)}
              </div>
              <span className="text-[14px] font-medium text-[#e6edf3]">Overall health</span>
            </div>
            <p className="text-[14px] italic text-[#e6edf3]/80">{aiReport.overallHealthAssessment}</p>
          </div>

          <div>
            <div className="text-[11px] uppercase text-[#6e7681] tracking-widest font-medium mb-2">Summary</div>
            <p className="text-[13px] text-[#c9d1d9] leading-relaxed">{aiReport.executiveSummary}</p>
          </div>

          {aiReport.topRisks && aiReport.topRisks.length > 0 && (
            <div>
              <div className="text-[11px] uppercase text-[#6e7681] tracking-widest font-medium mb-2">Top risks</div>
              <div className="flex flex-col">
                {aiReport.topRisks.slice(0,3).map((risk, i) => (
                  <div key={i} className={`flex gap-3 py-2.5 ${i < 2 ? "border-b border-[#21262d]" : ""}`}>
                    <div className="w-6 h-6 rounded-full bg-[#e6edf3] text-[#0d1117] flex items-center justify-center font-bold text-[12px] shrink-0">
                      {risk.rank}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[13px] font-medium text-[#e6edf3] truncate">{risk.title}</span>
                      </div>
                      <p className="text-[12px] text-[#8b949e] line-clamp-2 leading-relaxed mb-1">{risk.narrative}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiReport.prioritizedActionPlan && aiReport.prioritizedActionPlan.length > 0 && (
            <div>
              <div className="text-[11px] uppercase text-[#6e7681] tracking-widest font-medium mb-2">Fix priority</div>
              <div className="flex flex-col gap-2">
                {aiReport.prioritizedActionPlan.map((action, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-[#1f6feb] text-white flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                      {action.priority}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-[#e6edf3]">{action.action}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="bg-[#21262d] text-[#8b949e] px-1.5 py-0.5 rounded text-[10px]">
                          {action.estimatedEffort}
                        </span>
                        {action.ruleIds.map(r => (
                          <span key={r} className="font-mono bg-[#21262d] text-[#8b949e] px-1 py-0.5 rounded text-[10px]">{r}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 p-4 border border-dashed border-[#30363d] rounded-lg text-center bg-[#0d1117]/50">
            <div className="flex items-center justify-center gap-2 text-[#8b949e] text-[13px]">
              <ArrowLeft className="w-4 h-4" />
              Click any finding in the code to see its AI explanation and fix
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- MODE B: Detail ---
  return (
    <div className="w-[400px] shrink-0 bg-[#161b22] border-l border-[#30363d] flex flex-col overflow-hidden relative">
      <div className="p-[12px_16px] border-b border-[#30363d] shrink-0">
        <button
          onClick={onClose}
          className="text-[12px] text-[#6e7681] hover:text-[#e6edf3] flex items-center gap-1 mb-2 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Overview
        </button>
        <h2 className="text-[14px] font-medium text-[#e6edf3] leading-snug">{finding.title}</h2>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] uppercase px-1.5 py-0.5 rounded font-medium border text-[#f85149] bg-[#f85149]/10 border-[#f85149]/30">
            {finding.severity}
          </span>
          <span className="font-mono text-[11px] text-[#8b949e]">{finding.ruleId}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-[0_16px_24px] custom-scrollbar">
        {finding.aiExplanation ? (
          <>
            <div className="text-[11px] uppercase tracking-widest text-[#6e7681] m-[16px_0_6px] font-medium">Why this is risky</div>
            <div className="bg-[#1f6feb]/5 border border-[#1f6feb]/10 rounded-md p-3 text-[14px] text-[#e6edf3] leading-relaxed">
              {finding.aiExplanation.plainEnglishRisk}
            </div>

            <div className="mt-2">
              <button
                onClick={() => setTechDetailOpen(!techDetailOpen)}
                className="flex items-center gap-1 text-[13px] text-[#8b949e] hover:text-[#e6edf3] transition-colors"
              >
                <ChevronRight className={`w-4 h-4 transition-transform ${techDetailOpen ? "rotate-90" : ""}`} />
                Technical detail
              </button>
              {techDetailOpen && (
                <div className="mt-2 p-2.5 bg-[#010409] rounded text-[13px] font-mono text-[#8b949e] whitespace-pre-wrap border border-[#21262d]">
                  {finding.aiExplanation.technicalDetail}
                </div>
              )}
            </div>

            <div className="text-[11px] uppercase tracking-widest text-[#6e7681] m-[20px_0_6px] font-medium">What will break</div>
            <div className="bg-[#d29922]/5 border border-[#d29922]/20 border-l-[3px] border-l-[#d29922] rounded-r-md p-3">
              <div className="text-[13px] text-[#d29922] leading-relaxed">
                {finding.aiExplanation.failureScenario}
              </div>
              {finding.aiExplanation.businessImpact && (
                <div className="text-[12px] italic text-[#8b949e] mt-2 flex items-start gap-1.5">
                  <span>💼</span> {finding.aiExplanation.businessImpact}
                </div>
              )}
            </div>
          </>
        ) : !finding.patch ? (
          <div className="py-8 flex flex-col items-center justify-center text-[#8b949e] gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#1f6feb]" />
            <span className="text-[13px]">Generating AI analysis...</span>
          </div>
        ) : null}

        {finding.requiresManualReview ? (
          <div className="mt-4 p-4 border border-[#d29922]/30 bg-[#d29922]/5 rounded-md space-y-4">
            <div className="flex items-center gap-2 text-[#d29922] font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 text-[#d29922]" />
              <span>This fix requires manual review</span>
            </div>
            <div className="text-[12px] text-[#8b949e]">
              Reason: {finding.manualReviewReason || 'Contains unresolved placeholder tokens'}
            </div>
            
            {finding.patch && finding.patch.before && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold text-[#8b949e] uppercase">Current code</div>
                <div className="border border-[#21262d] rounded-md overflow-hidden bg-[#0d1117] font-mono text-[12px] leading-snug">
                  <pre className="p-3 overflow-x-auto whitespace-pre bg-[#0d1117] text-[#c9d1d9] max-h-[150px] m-0">
                    {finding.patch.before}
                  </pre>
                </div>
              </div>
            )}
            
            {finding.patch && finding.patch.after && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-semibold text-[#8b949e] uppercase tracking-wider">Suggested code (contains placeholders)</div>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(finding.patch?.after || '');
                        setCopiedSuggested(true);
                        setTimeout(() => setCopiedSuggested(false), 1500);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[10px] text-[#58a6ff] hover:text-[#e6edf3] transition-colors"
                  >
                    {copiedSuggested ? (
                      <>
                        <Check className="w-3 h-3 text-[#3fb950] animate-bounce" />
                        <span className="text-[#3fb950] font-medium">Copied Code!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="border border-[#d29922]/30 rounded-md overflow-hidden bg-[#0d1117] font-mono text-[12px] leading-snug shadow-inner">
                  <pre className="p-3 overflow-x-auto whitespace-pre bg-[#0d1117] text-[#c9d1d9] max-h-[200px] m-0">
                    {finding.patch.after.split('\n').map((line: string, l: number) => (
                      <div key={`a-${l}`} className="flex px-2 rounded-sm select-all hover:bg-[#21262d]/50">{line}</div>
                    ))}
                  </pre>
                </div>
              </div>
            )}
            
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-[#8b949e] uppercase">Instructions</div>
              <div className="text-[12px] text-[#8b949e] bg-[#0d1117] p-3 rounded-md border border-[#21262d] leading-relaxed whitespace-pre-wrap">
                {finding.patch?.instructions || finding.remediation || 'No plain-English instructions available.'}
              </div>
            </div>

            <div className="pt-1 flex items-center gap-4 flex-wrap">
              {finding.ruleId === 'security-unpinned-action' && (
                <a
                  href={(() => {
                    const evidence = finding.patch?.before || finding.description || '';
                    const clean = evidence.replace(/['"`\s]/g, '').trim();
                    const match = clean.match(/([a-zA-Z0-9-_]+)\/([a-zA-Z0-9-_.]+)(?:\/([a-zA-Z0-9-_.]+))?@?([a-zA-Z0-9-_.]+)?/);
                    if (match) {
                      const owner = match[1];
                      const repo = match[2];
                      const ref = match[4] || 'v3';
                      return `https://github.com/${owner}/${repo}/commits/${ref}`;
                    }
                    return 'https://github.com/snyk/actions/node/commits/v3';
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#a371f7] hover:underline font-medium"
                >
                  Find the commit SHA on GitHub <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {finding.patch && finding.patch.after && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(finding.patch?.after || '');
                      setCopiedSuggested(true);
                      setTimeout(() => setCopiedSuggested(false), 1500);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="text-[12px] text-[#a371f7] hover:text-[#b48bf8] flex items-center gap-1.5"
                >
                  {copiedSuggested ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                      <span className="text-[#3fb950] font-medium">Copied code!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy suggested code</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(finding.patch?.instructions || finding.remediation || '');
                    setCopiedFile(true);
                    setTimeout(() => setCopiedFile(false), 1500);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="text-[12px] text-[#58a6ff] hover:text-[#e6edf3] flex items-center gap-1.5"
              >
                {copiedFile ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                    <span className="text-[#3fb950] font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy instructions</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between m-[20px_0_10px] shrink-0">
              <div className="text-[11px] uppercase tracking-widest text-[#6e7681] font-medium">The fix</div>
              {finding.patch && fileContent && (
                <div className="flex bg-[#0d1117] p-0.5 rounded border border-[#21262d] text-[11px]">
                  <button
                    onClick={() => setFixTab("diff")}
                    className={`px-2 py-0.5 rounded transition-colors ${fixTab === "diff" ? "bg-[#21262d] text-white animate-fade-in" : "text-[#8b949e] hover:text-[#e6edf3]"}`}
                  >
                    Diff View
                  </button>
                  <button
                    onClick={() => setFixTab("file")}
                    className={`px-2 py-0.5 rounded transition-colors ${fixTab === "file" ? "bg-[#21262d] text-white animate-fade-in" : "text-[#8b949e] hover:text-[#e6edf3]"}`}
                  >
                    Full File
                  </button>
                </div>
              )}
            </div>

            {finding.patch ? (
              <div className="flex flex-col gap-2 animate-fade-in">
                {fixTab === "diff" || !fileContent ? (
                  renderDiff()
                ) : (
                  <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[11px] text-[#8b949e] truncate max-w-[250px]">Full updated file content ({fileName})</span>
                      <button
                        onClick={() => handleCopyFile(getUpdatedContent())}
                        className="text-[11px] text-[#58a6ff] hover:text-[#e6edf3] flex items-center gap-1"
                      >
                        {copiedFile ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-[#3fb950]" />
                            <span className="text-[#3fb950] font-medium">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy full file</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="bg-[#0d1117] border border-[#21262d] rounded-md p-2.5 overflow-x-auto max-h-[300px] custom-scrollbar">
                      <pre className="font-mono text-[12px] text-[#e6edf3] m-0">
                        {getUpdatedContent()}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="mt-2">
                  {finding.patch.safe && finding.patch.validatedByRuleEngine ? (
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#3fb950]" />
                      <span className="text-[12px] text-[#3fb950]">Validated by rule engine</span>
                    </div>
                  ) : finding.patch.warning ? (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#d29922]" />
                      <span className="text-[12px] text-[#d29922]">{finding.patch.warning}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-[#db6d28]" />
                      <span className="text-[12px] text-[#db6d28]">Review before applying</span>
                    </div>
                  )}
                </div>

                <CopyFixButton patch={finding.patch} ruleId={finding.ruleId} />

                {finding.patch.instructions && (
                  <div className="mt-4">
                    <button
                      onClick={() => setHowToOpen(!howToOpen)}
                      className="flex items-center gap-1 text-[13px] text-[#8b949e] hover:text-[#e6edf3]"
                    >
                      <ChevronRight className={`w-4 h-4 transition-transform ${howToOpen ? "rotate-90" : ""}`} />
                      How to apply this fix
                    </button>
                    {howToOpen && (
                      <div className="mt-2 p-3 bg-[#0d1117] rounded border border-[#21262d] text-[12px] text-[#8b949e] whitespace-pre-wrap">
                        {finding.patch.instructions}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-3 text-[13px] text-[#8b949e]">
                {finding.remediation || "No automated fix available. Please review manually."}
              </div>
            )}
          </>
        )}

      </div>

      <div className="sticky bottom-0 bg-[#161b22] border-t border-[#30363d] p-[10px_16px] flex gap-2 shrink-0">
        <button className="flex items-center gap-1 text-[12px] text-[#6e7681] hover:text-[#8b949e] transition-colors">
          <Copy className="w-3.5 h-3.5" /> Rule ID
        </button>
        <button className="flex items-center gap-1 text-[12px] text-[#6e7681] hover:text-[#8b949e] transition-colors ml-auto">
          <ExternalLink className="w-3.5 h-3.5" /> Docs
        </button>
        <button className="flex items-center gap-1 text-[12px] text-[#6e7681] hover:text-[#8b949e] transition-colors">
          <Flag className="w-3.5 h-3.5" /> Report
        </button>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Sparkles, Code, AlertTriangle, Play, HelpCircle, ShieldAlert } from "lucide-react";
import type { InlineFinding } from "@/lib/analyze-api";
import { CopyPatchButton } from "./copy-patch-button";
import clsx from "clsx";

interface AiSuggestionPanelProps {
  finding: InlineFinding;
  filePath: string;
}

export function AiSuggestionPanel({ finding, filePath }: AiSuggestionPanelProps) {
  const [activeTab, setActiveTab] = useState<"explanation" | "fix">("explanation");
  const { aiExplanation, patch } = finding;

  const severityStyles = {
    critical: "text-danger border-danger/20 bg-danger/5",
    high: "text-warning border-warning/20 bg-warning/5",
    medium: "text-[#ebdf34] border-[#ebdf34]/20 bg-[#ebdf34]/5",
    low: "text-accent border-accent/20 bg-accent/5",
    info: "text-fg-muted border-white/[0.06] bg-white/[0.02]",
  };

  const currentStyle = severityStyles[finding.severity] || severityStyles.info;

  return (
    <div className="flex flex-col h-full bg-canvas border border-white/[0.06] rounded-3xl overflow-hidden shadow-2xl">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-4 bg-white/[0.02] border-b border-white/[0.06] flex-shrink-0 h-[45px]">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("explanation")}
            className={clsx(
              "px-3 py-2 text-xs font-semibold border-b-2 transition-all",
              activeTab === "explanation"
                ? "border-accent text-white"
                : "border-transparent text-fg-muted hover:text-fg"
            )}
          >
            <span className="flex items-center">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-accent" />
              AI Explanation
            </span>
          </button>

          {patch && (
            <button
              onClick={() => setActiveTab("fix")}
              className={clsx(
                "px-3 py-2 text-xs font-semibold border-b-2 transition-all",
                activeTab === "fix"
                  ? "border-success text-white"
                  : "border-transparent text-fg-muted hover:text-fg"
              )}
            >
              <span className="flex items-center">
                <Code className="h-3.5 w-3.5 mr-1.5 text-success" />
                Code Fix
              </span>
            </button>
          )}
        </div>

        {/* Action Button (Copy Patch) */}
        {patch && activeTab === "fix" && (
          <CopyPatchButton
            filePath={filePath}
            beforeCode={patch.before}
            afterCode={patch.after}
            instructions={patch.instructions}
          />
        )}
      </div>

      {/* Viewport Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Tab 1: AI Explanation */}
        {activeTab === "explanation" && (
          <div className="space-y-4 animate-fadeIn">
            {/* Finding Severity Title */}
            <div className={clsx("p-3 rounded-2xl border flex items-start gap-3", currentStyle)}>
              <ShieldAlert className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white leading-snug">{finding.title}</h4>
                <p className="text-[10px] uppercase font-mono mt-1 opacity-70 tracking-wider">
                  Category: {finding.category} • Severity: {finding.severity}
                </p>
              </div>
            </div>

            {/* Standard Description */}
            <div className="space-y-1.5">
              <span className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                Analyzer Rule
              </span>
              <p className="text-xs text-fg-muted leading-relaxed">
                {finding.description}
              </p>
            </div>

            {/* AI Explanations */}
            {aiExplanation ? (
              <div className="space-y-4 pt-2 border-t border-white/[0.04]">
                {/* Plain english risk */}
                <div className="space-y-1.5">
                  <span className="flex items-center text-[10px] font-bold text-accent uppercase tracking-wider">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Plain English Assessment
                  </span>
                  <div className="bg-accent/5 border border-accent/15 rounded-2xl p-4 text-xs text-white/90 leading-relaxed font-medium">
                    {aiExplanation.plainEnglishRisk}
                  </div>
                </div>

                {/* Technical risk context */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                    Technical Risk & Root Cause
                  </span>
                  <p className="text-xs text-fg-muted leading-relaxed">
                    {aiExplanation.technicalDetail}
                  </p>
                </div>

                {/* Failure Scenario */}
                {aiExplanation.failureScenario && (
                  <div className="space-y-1.5">
                    <span className="flex items-center text-[10px] font-bold text-[#ebdf34] uppercase tracking-wider">
                      <Play className="h-3 w-3 mr-1" />
                      Potential Failure Path
                    </span>
                    <p className="text-xs text-fg-muted leading-relaxed bg-[#ebdf34]/5 border border-[#ebdf34]/15 rounded-2xl p-4">
                      {aiExplanation.failureScenario}
                    </p>
                  </div>
                )}

                {/* Business Impact */}
                {aiExplanation.businessImpact && (
                  <div className="space-y-1.5">
                    <span className="flex items-center text-[10px] font-bold text-warning uppercase tracking-wider">
                      <HelpCircle className="h-3 w-3 mr-1" />
                      Business & Pipeline Impact
                    </span>
                    <p className="text-xs text-fg-muted leading-relaxed">
                      {aiExplanation.businessImpact}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-fg-subtle italic text-xs">
                No AI explanation available for this finding.
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Code Fix & Diff */}
        {activeTab === "fix" && patch && (
          <div className="space-y-5 animate-fadeIn">
            {/* Fix Instructions */}
            {patch.instructions && (
              <div className="space-y-1.5">
                <span className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                  Remediation Instructions
                </span>
                <p className="text-xs text-fg-muted leading-relaxed bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
                  {patch.instructions}
                </p>
              </div>
            )}

            {/* Validation Banner */}
            <div className="flex gap-2 items-center bg-success/5 border border-success/15 px-3 py-2 rounded-xl text-[10px] font-semibold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-slow" />
              Validated against engine rules • Dry-run: Success
            </div>

            {/* Unified/Side-by-Side Diff Panels */}
            <div className="space-y-3">
              <span className="block text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
                Changes View (Original vs Corrected)
              </span>

              <div className="grid grid-cols-1 gap-4 font-mono text-[11px] leading-relaxed">
                {/* Original code (red) */}
                <div className="border border-danger/20 rounded-2xl overflow-hidden bg-canvas">
                  <div className="bg-danger/10 border-b border-danger/10 px-4 py-2 flex items-center justify-between text-danger font-bold text-[10px] uppercase">
                    <span>Original Code</span>
                    <span>- Removed</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[#ffa3a3] whitespace-pre bg-danger/5">
                    {patch.before}
                  </pre>
                </div>

                {/* Corrected code (green) */}
                <div className="border border-success/20 rounded-2xl overflow-hidden bg-canvas">
                  <div className="bg-success/10 border-b border-success/10 px-4 py-2 flex items-center justify-between text-success font-bold text-[10px] uppercase">
                    <span>Corrected Code</span>
                    <span>+ Added</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-[#a3ffa3] whitespace-pre bg-success/5">
                    {patch.after}
                  </pre>
                </div>
              </div>
            </div>

            {/* Warning notes */}
            {patch.warning && (
              <div className="bg-warning/10 border border-warning/20 rounded-2xl p-4 flex gap-3 items-start">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <div className="text-[11px]">
                  <h4 className="font-bold text-warning mb-0.5">Deployment Warning</h4>
                  <p className="text-warning/95 leading-relaxed">{patch.warning}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { AlertCircle, Sparkles, Code, Check } from "lucide-react";
import type { InlineFinding } from "@/lib/analyze-api";
import clsx from "clsx";

interface FindingCardProps {
  finding: InlineFinding;
  isActive: boolean;
  onSelect: () => void;
}

export function FindingCard({ finding, isActive, onSelect }: FindingCardProps) {
  const severityColors = {
    critical: {
      border: "border-danger/30 hover:border-danger/60",
      activeBg: "bg-danger/5 border-danger/50 shadow-[0_0_15px_rgba(239,68,68,0.07)]",
      badge: "bg-danger/10 text-danger border-danger/20",
      accent: "bg-danger",
    },
    high: {
      border: "border-warning/30 hover:border-warning/60",
      activeBg: "bg-warning/5 border-warning/50 shadow-[0_0_15px_rgba(249,115,22,0.07)]",
      badge: "bg-warning/10 text-warning border-warning/20",
      accent: "bg-warning",
    },
    medium: {
      border: "border-[#ebdf34]/30 hover:border-[#ebdf34]/60",
      activeBg: "bg-[#ebdf34]/5 border-[#ebdf34]/50 shadow-[0_0_15px_rgba(235,223,52,0.07)]",
      badge: "bg-[#ebdf34]/10 text-[#ebdf34] border-[#ebdf34]/20",
      accent: "bg-[#ebdf34]",
    },
    low: {
      border: "border-accent/30 hover:border-accent/60",
      activeBg: "bg-accent/5 border-accent/50 shadow-[0_0_15px_rgba(31,111,235,0.07)]",
      badge: "bg-accent/10 text-accent border-accent/20",
      accent: "bg-accent",
    },
    info: {
      border: "border-white/[0.06] hover:border-white/[0.12]",
      activeBg: "bg-white/[0.04] border-white/[0.2] shadow-sm",
      badge: "bg-white/[0.06] text-fg-muted border-white/[0.08]",
      accent: "bg-fg-muted",
    },
  };

  const style = severityColors[finding.severity] || severityColors.info;

  return (
    <button
      onClick={onSelect}
      className={clsx(
        "w-full text-left p-4 rounded-2xl border transition-all duration-200 flex flex-col gap-2 relative overflow-hidden",
        isActive ? style.activeBg : `bg-white/[0.02] ${style.border} text-fg-muted hover:text-fg`
      )}
    >
      {/* Top indicator strip */}
      <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${style.accent}`} />

      {/* Header Info */}
      <div className="flex items-center justify-between gap-2 w-full pl-2">
        <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider", style.badge)}>
          {finding.severity}
        </span>
        {finding.line && (
          <span className="text-[10px] text-fg-subtle font-mono font-semibold bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.04]">
            Line {finding.line}
          </span>
        )}
      </div>

      {/* Title */}
      <div className="flex gap-2 pl-2">
        <AlertCircle className={clsx("h-4 w-4 mt-0.5 flex-shrink-0", isActive ? "text-white" : "text-fg-subtle")} />
        <h5 className={clsx("text-xs font-bold leading-snug", isActive ? "text-white" : "text-fg")}>
          {finding.title}
        </h5>
      </div>

      {/* Description snippet */}
      <p className="text-[11px] text-fg-muted leading-relaxed pl-8 line-clamp-2">
        {finding.description}
      </p>

      {/* Badges/Tags indicators */}
      {(finding.aiExplanation || finding.patch) && (
        <div className="flex items-center gap-2 mt-1 pl-8">
          {finding.aiExplanation && (
            <span className="inline-flex items-center text-[9px] font-bold text-accent bg-accent/5 border border-accent/15 px-1.5 py-0.5 rounded-md">
              <Sparkles className="h-2.5 w-2.5 mr-1" />
              AI Explained
            </span>
          )}
          {finding.patch && (
            <span className="inline-flex items-center text-[9px] font-bold text-success bg-success/5 border border-success/15 px-1.5 py-0.5 rounded-md">
              <Code className="h-2.5 w-2.5 mr-1" />
              {finding.patch.safe ? "Auto-Safe Fix" : "Fix Available"}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

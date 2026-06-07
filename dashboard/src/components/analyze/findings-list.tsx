import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import type { InlineFinding } from "@/lib/analyze-api";

const severityColors = {
  critical: { bg: "rgba(248,81,73,0.15)", text: "#f85149", border: "rgba(248,81,73,0.3)" },
  high: { bg: "rgba(219,109,40,0.15)", text: "#db6d28", border: "rgba(219,109,40,0.3)" },
  medium: { bg: "rgba(210,153,34,0.15)", text: "#d29922", border: "rgba(210,153,34,0.3)" },
  low: { bg: "rgba(88,166,255,0.1)", text: "#58a6ff", border: "rgba(88,166,255,0.2)" },
  info: { bg: "rgba(139,148,158,0.1)", text: "#8b949e", border: "rgba(139,148,158,0.2)" },
};

export function FindingsList({
  findings,
  selectedId,
  onSelect,
}: {
  findings: InlineFinding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("All");

  const filteredFindings = filter === "All" 
    ? findings 
    : findings.filter(f => f.severity.toLowerCase() === filter.toLowerCase());

  let worstSeverity = "info";
  if (findings.length > 0) {
    const severities = findings.map(f => f.severity);
    if (severities.includes("critical")) worstSeverity = "critical";
    else if (severities.includes("high")) worstSeverity = "high";
    else if (severities.includes("medium")) worstSeverity = "medium";
    else if (severities.includes("low")) worstSeverity = "low";
  }

  const worstColor = severityColors[worstSeverity as keyof typeof severityColors] || severityColors.info;

  return (
    <div className="bg-[#0d1117] border-t border-[#30363d] flex flex-col h-[320px] shrink-0">
      <div className="p-[10px_16px] flex items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[12px] uppercase text-[#6e7681] tracking-widest font-medium">Findings in this file</span>
          {findings.length > 0 && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
              style={{ background: worstColor.bg, color: worstColor.text, border: `1px solid ${worstColor.border}` }}
            >
              {findings.length}
            </span>
          )}
        </div>
        
        <div className="ml-auto flex items-center gap-1">
          {["All", "Critical", "High", "Medium", "Low"].map((f) => {
            const isSelected = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[11px] px-2 py-1 rounded-full transition-colors"
                style={{
                  background: isSelected ? "rgba(255,255,255,0.1)" : "transparent",
                  color: isSelected ? "#e6edf3" : "#8b949e",
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {findings.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-[#3fb950]" />
            <span className="text-[#8b949e] text-[13px]">No findings in this file</span>
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-[#8b949e] text-[13px]">No {filter.toLowerCase()} findings in this file</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {filteredFindings.map((finding) => {
              const isSelected = selectedId === finding.id;
              const sevColor = severityColors[finding.severity] || severityColors.info;
              
              return (
                <div
                  key={finding.id}
                  onClick={() => onSelect(finding.id)}
                  className="p-[10px_16px] border-b border-[#21262d] cursor-pointer flex flex-col gap-1 transition-colors group"
                  style={{
                    background: isSelected ? "rgba(31,111,235,0.08)" : "transparent",
                    borderLeft: isSelected ? "2px solid #1f6feb" : "2px solid transparent",
                    paddingLeft: isSelected ? "14px" : "16px",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] uppercase px-1.5 py-0.5 rounded font-medium tracking-wide"
                      style={{ background: sevColor.bg, color: sevColor.text, border: `1px solid ${sevColor.border}` }}
                    >
                      {finding.severity}
                    </span>
                    <span className="font-mono text-[11px] text-[#8b949e]">{finding.ruleId}</span>
                    
                    {finding.line && (
                      <span className="bg-[#21262d] text-[#8b949e] text-[10px] px-[5px] py-[1px] rounded">
                        L{finding.line}
                      </span>
                    )}

                    {finding.patch && (
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-[#3fb950]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#3fb950]" />
                        Fix available
                      </span>
                    )}
                  </div>
                  <div
                    className="text-[13px] truncate"
                    style={{ color: isSelected ? "#e6edf3" : "#c9d1d9" }}
                  >
                    {finding.title}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

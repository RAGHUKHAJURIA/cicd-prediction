"use client";

import React from "react";
import { FileCode, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { FileScanDetail } from "@/lib/analyze-api";
import clsx from "clsx";

interface FileSelectorProps {
  files: FileScanDetail[];
  selectedFilePath: string | null;
  onFileSelected: (filePath: string) => void;
}

export function FileSelector({ files, selectedFilePath, onFileSelected }: FileSelectorProps) {
  const getSeverityBadgeColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-danger/10 border-danger/20 text-danger";
      case "high":
        return "bg-warning/10 border-warning/20 text-warning";
      case "medium":
        return "bg-[#ebdf34]/10 border-[#ebdf34]/20 text-[#ebdf34]";
      case "low":
        return "bg-accent/10 border-accent/20 text-accent";
      default:
        return "bg-success/10 border-success/20 text-success";
    }
  };

  return (
    <div className="flex flex-col gap-2 overflow-y-auto pr-1 max-h-[600px]">
      <div className="px-2 mb-1 flex items-center justify-between">
        <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
          Configuration Paths
        </span>
        <span className="text-[10px] text-fg-muted font-semibold bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </div>

      {files.map((file) => {
        const isSelected = file.filePath === selectedFilePath;
        const basename = file.filePath.split("/").pop() || file.filePath;
        const directory = file.filePath.split("/").slice(0, -1).join("/");

        return (
          <button
            key={file.filePath}
            onClick={() => onFileSelected(file.filePath)}
            className={clsx(
              "w-full text-left p-3.5 rounded-2xl border transition-all duration-200 group flex items-start justify-between gap-3",
              isSelected
                ? "bg-accent/10 border-accent/30 shadow-[0_4px_12px_rgba(31,111,235,0.1)] text-white"
                : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.12] text-fg-muted hover:text-fg"
            )}
          >
            <div className="flex gap-3 min-w-0">
              <div className="pt-0.5 flex-shrink-0">
                {file.findingCount > 0 ? (
                  <AlertTriangle
                    className={clsx(
                      "h-4 w-4",
                      file.worstSeverity === "critical"
                        ? "text-danger"
                        : file.worstSeverity === "high"
                        ? "text-warning"
                        : file.worstSeverity === "medium"
                        ? "text-[#ebdf34]"
                        : "text-accent"
                    )}
                  />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
              </div>

              <div className="min-w-0">
                <span
                  className={clsx(
                    "block text-xs font-bold truncate transition-colors",
                    isSelected ? "text-white" : "text-fg group-hover:text-white"
                  )}
                >
                  {basename}
                </span>
                {directory && (
                  <span className="block text-[10px] text-fg-subtle truncate mt-0.5 font-mono">
                    {directory}/
                  </span>
                )}
              </div>
            </div>

            {/* Findings Pill Count */}
            <div className="flex-shrink-0 flex items-center gap-1.5">
              {file.findingCount > 0 ? (
                <span
                  className={clsx(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wide uppercase",
                    getSeverityBadgeColor(file.worstSeverity)
                  )}
                >
                  {file.findingCount} {file.findingCount === 1 ? "issue" : "issues"}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-success/20 bg-success/5 text-success tracking-wide uppercase">
                  Clean
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

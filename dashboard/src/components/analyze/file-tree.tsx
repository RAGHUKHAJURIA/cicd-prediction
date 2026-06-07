import React from "react";
import { File, Box } from "lucide-react";
import type { FileScanDetail } from "@/lib/analyze-api";

// Simple icon mapper based on file type
const getFileIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case "github-actions":
    case "dockerfile":
    case "k8s":
    case "jenkinsfile":
    case "helm":
    case "terraform":
      return <Box className="w-4 h-4 text-[#58a6ff]" />;
    case "gitlab-ci":
      return <Box className="w-4 h-4 text-[#fc6d26]" />;
    default:
      return <File className="w-4 h-4 text-[#8b949e]" />;
  }
};

const severityColors = {
  critical: { bg: "#f85149", text: "#fff" },
  high: { bg: "#db6d28", text: "#fff" },
  medium: { bg: "#d29922", text: "#000" },
  low: { bg: "#1f6feb", text: "#fff" },
  info: { bg: "#58a6ff", text: "#000" },
  success: { bg: "transparent", text: "transparent" },
};

export function FileTree({
  files,
  selected,
  onSelect,
}: {
  files: FileScanDetail[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const sortedFiles = [...files].sort((a, b) => {
    if (a.findingCount !== b.findingCount) {
      return b.findingCount - a.findingCount; // most findings first
    }
    return a.filePath.localeCompare(b.filePath); // then alphabetical
  });

  const ciSystems = Array.from(new Set(files.map((f) => f.fileType))).join(" · ");

  return (
    <div className="h-full bg-[#0d1117] border-r border-[#30363d] flex flex-col relative overflow-hidden">
      <div className="p-[12px_16px] flex items-center justify-between shrink-0">
        <span className="text-[11px] uppercase text-[#6e7681] tracking-widest">Files scanned</span>
        <span className="text-[11px] bg-[#21262d] text-[#8b949e] px-2 py-0.5 rounded-full">{files.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto pb-16 custom-scrollbar">
        {sortedFiles.map((file) => {
          const isSelected = selected === file.filePath;
          const parts = file.filePath.split("/");
          const name = parts.pop() || file.filePath;
          const path = parts.length > 0 ? parts.join("/") + "/" : "";
          const hasFindings = file.findingCount > 0;
          const color = severityColors[file.worstSeverity] || severityColors.success;

          return (
            <div
              key={file.filePath}
              onClick={() => onSelect(file.filePath)}
              className="mx-1 my-0.5 px-3 py-2 flex items-center gap-2 cursor-pointer rounded transition-colors group"
              style={{
                background: isSelected ? "rgba(31,111,235,0.12)" : "transparent",
                borderLeft: isSelected ? "2px solid #1f6feb" : "2px solid transparent",
                paddingLeft: isSelected ? "10px" : "12px",
              }}
            >
              <div className="shrink-0">{getFileIcon(file.fileType)}</div>
              <div className="min-w-0 flex-1 flex flex-col">
                <span
                  className="text-[13px] truncate"
                  style={{ color: isSelected ? "#e6edf3" : "#c9d1d9" }}
                >
                  {name}
                </span>
                {path && (
                  <span className="text-[11px] text-[#6e7681] truncate leading-none mt-0.5">
                    {path}
                  </span>
                )}
              </div>
              {hasFindings && (
                <div
                  className="shrink-0 flex items-center justify-center font-bold text-[10px]"
                  style={{
                    width: file.findingCount >= 3 ? "auto" : "18px",
                    height: "18px",
                    padding: file.findingCount >= 3 ? "0 6px" : "0",
                    borderRadius: "9px",
                    background: color.bg,
                    color: color.text,
                    boxShadow: isSelected && file.worstSeverity === "critical" ? "0 0 8px rgba(248,81,73,0.4)" : "none",
                  }}
                >
                  {file.findingCount}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-0 left-0 right-0 border-t border-[#21262d] p-[10px_12px] bg-[#0d1117]">
        <div className="text-[11px] text-[#6e7681]">{files.length} files analyzed</div>
        <div className="text-[11px] text-[#6e7681] truncate">{ciSystems || "No systems detected"}</div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #484f58; }
      `}} />
    </div>
  );
}

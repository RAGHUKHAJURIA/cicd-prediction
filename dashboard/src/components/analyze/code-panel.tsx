import React, { useRef, useEffect, useState } from "react";
import { Copy, Check, File } from "lucide-react";
import type { FileScanDetail, InlineFinding } from "@/lib/analyze-api";

function highlightCode(line: string, fileType: string): string {
  let highlighted = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Basic syntax highlighting
  // YAML keys
  highlighted = highlighted.replace(/^(\s*)([\w-]+)(?=\s*:)/gm, '$1<span style="color:#ff7b72">$2</span>');
  // Comments
  highlighted = highlighted.replace(/(#.*)$/g, '<span style="color:#8b949e;font-style:italic">$1</span>');
  // Strings (basic)
  highlighted = highlighted.replace(/(:\s*)('[^']*')/g, '$1<span style="color:#a5d6ff">$2</span>');
  highlighted = highlighted.replace(/(:\s*)("[^"]*")/g, '$1<span style="color:#a5d6ff">$2</span>');
  // Booleans
  highlighted = highlighted.replace(/(:\s*)(true|false)(?=\s|$)/g, '$1<span style="color:#79c0ff">$2</span>');
  // GitHub expressions
  highlighted = highlighted.replace(/(\${{.*?}})/g, '<span style="color:#d2a8ff">$1</span>');
  
  return highlighted;
}

const severityColors = {
  critical: "#f85149",
  high: "#db6d28",
  medium: "#d29922",
  low: "#1f6feb",
  info: "#58a6ff",
};

export function CodePanel({
  file,
  selectedFindingId,
  onSelectFinding,
}: {
  file: FileScanDetail | null;
  selectedFindingId: string | null;
  onSelectFinding: (id: string | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (selectedFindingId && selectedRowRef.current && containerRef.current) {
      selectedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedFindingId]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [file?.filePath]);

  const handleCopy = async () => {
    if (!file?.content) return;
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Fallback ignored for brevity
    }
  };

  if (!file) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0d1117]">
        <File className="w-8 h-8 text-[#6e7681] mb-2" />
        <p className="text-[#6e7681] text-[14px]">Select a file to view its code</p>
      </div>
    );
  }

  const parts = file.filePath.split("/");
  const breadcrumb = parts.map((part, i) => (
    <React.Fragment key={i}>
      <span className={i === parts.length - 1 ? "text-[#e6edf3]" : "text-[#8b949e]"}>{part}</span>
      {i < parts.length - 1 && <span className="text-[#6e7681] mx-1">/</span>}
    </React.Fragment>
  ));

  const lines = file.content ? file.content.split("\n") : [];
  const hasContent = lines.length > 0 && file.content !== "";

  // Map findings by line
  const findingsByLine: Record<number, InlineFinding[]> = {};
  file.findings.forEach((f) => {
    if (f.line) {
      if (!findingsByLine[f.line]) findingsByLine[f.line] = [];
      findingsByLine[f.line].push(f);
    }
  });

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0d1117]">
      <div className="bg-[#161b22] border-b border-[#21262d] p-[10px_16px] flex items-center shrink-0">
        <div className="text-[13px] mr-4 truncate flex-1">{breadcrumb}</div>
        <div className="bg-[#1f6feb]/10 border border-[#1f6feb]/20 text-[#58a6ff] text-[11px] px-2 py-0.5 rounded shrink-0 mr-4">
          {file.fileType.toUpperCase()}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-[12px] text-[#6e7681]">
            {file.findingCount} finding{file.findingCount !== 1 && "s"}
          </div>
          <button
            onClick={handleCopy}
            className="text-[12px] text-[#6e7681] hover:text-[#e6edf3] flex items-center gap-1 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#3fb950]" /> : <Copy className="w-3.5 h-3.5" />}
            Copy file
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-[#010409] p-0 relative custom-scrollbar">
        {!hasContent ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-[#6e7681] text-[13px]">Source code not available for this file.</p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((lineContent, idx) => {
                const lineNum = idx + 1;
                const lineFindings = findingsByLine[lineNum] || [];
                const hasFinding = lineFindings.length > 0;
                
                // Get worst severity for the line
                let worstSev = "info";
                let sevColor = "transparent";
                if (hasFinding) {
                  const severities = lineFindings.map(f => f.severity);
                  if (severities.includes("critical")) worstSev = "critical";
                  else if (severities.includes("high")) worstSev = "high";
                  else if (severities.includes("medium")) worstSev = "medium";
                  else if (severities.includes("low")) worstSev = "low";
                  sevColor = severityColors[worstSev as keyof typeof severityColors] || "#8b949e";
                }

                const isSelected = lineFindings.some(f => f.id === selectedFindingId);

                return (
                  <tr
                    key={lineNum}
                    ref={isSelected ? selectedRowRef : null}
                    onClick={() => {
                      if (hasFinding) {
                        // Select the first finding on this line if clicking the row
                        const target = lineFindings.find(f => f.id === selectedFindingId) || lineFindings[0];
                        onSelectFinding(target.id);
                      }
                    }}
                    className={`group relative ${hasFinding ? "cursor-pointer" : ""}`}
                    style={{
                      backgroundColor: isSelected
                        ? `${sevColor}2E` // 18% opacity
                        : hasFinding
                        ? `${sevColor}0F` // 6% opacity
                        : "transparent",
                      borderLeft: isSelected
                        ? `3px solid ${sevColor}`
                        : hasFinding
                        ? `2px solid ${sevColor}`
                        : "2px solid transparent",
                      transition: "background-color 150ms",
                    }}
                  >
                    <td
                      className="w-[48px] min-w-[48px] text-right p-[0_16px_0_8px] text-[#6e7681] text-[12px] select-none align-top"
                      style={{ lineHeight: 1.6 }}
                    >
                      <div className="relative">
                        {hasFinding && (
                          <div
                            className="absolute left-[-4px] top-[6px] w-[6px] h-[6px] rounded-full"
                            style={{ backgroundColor: sevColor }}
                          />
                        )}
                        {lineNum}
                      </div>
                    </td>
                    <td
                      className="p-[0_16px_0_8px] whitespace-pre align-top w-full text-[13px] text-[#e6edf3]"
                      style={{ fontFamily: "'SFMono-Regular', Consolas, monospace", lineHeight: 1.6 }}
                      dangerouslySetInnerHTML={{ __html: highlightCode(lineContent, file.fileType) }}
                    />
                    
                    {/* Tooltip implementation: using a simple absolute positioned div inside the relative TR */}
                    {hasFinding && !isSelected && (
                      <td className="hidden group-hover:block absolute left-[100px] top-[10px] z-10 w-max max-w-[320px]">
                        <div
                          style={{
                            background: "#161b22",
                            border: `1px solid ${sevColor}`,
                            borderRadius: "6px",
                            padding: "8px 12px",
                            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="text-[10px] uppercase px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: `${sevColor}26`, color: sevColor }}
                            >
                              {worstSev}
                            </span>
                            <span className="text-[11px] text-[#8b949e] font-mono">{lineFindings[0].ruleId}</span>
                          </div>
                          <div className="text-[14px] text-white whitespace-normal">{lineFindings[0].title}</div>
                          <div className="text-[12px] mt-1" style={{ color: "#58a6ff" }}>Click to see fix &rarr;</div>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

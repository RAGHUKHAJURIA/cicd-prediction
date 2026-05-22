"use client";

import React, { useEffect, useRef } from "react";
import type { InlineFinding } from "@/lib/analyze-api";
import clsx from "clsx";

interface CodeViewerProps {
  filePath: string;
  fileContent: string;
  findings: InlineFinding[];
  selectedLine: number | null;
  onLineClick?: (line: number) => void;
}

export function CodeViewer({
  filePath,
  fileContent,
  findings,
  selectedLine,
  onLineClick,
}: CodeViewerProps) {
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);

  const lines = fileContent ? fileContent.split(/\r?\n/) : [];

  // Scroll to active line
  useEffect(() => {
    if (selectedLine && lineRefs.current[selectedLine]) {
      lineRefs.current[selectedLine]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedLine]);

  // Map line numbers to worst severity findings
  const findingsMap = React.useMemo(() => {
    const map: Record<number, InlineFinding[]> = {};
    findings.forEach((finding) => {
      if (finding.line !== null) {
        if (!map[finding.line]) {
          map[finding.line] = [];
        }
        map[finding.line]!.push(finding);
      }
    });
    return map;
  }, [findings]);

  const getLineStyles = (lineNum: number) => {
    const lineFindings = findingsMap[lineNum];
    const isSelected = selectedLine === lineNum;
    
    if (!lineFindings) {
      return {
        rowBg: isSelected ? "bg-white/[0.04] text-white" : "hover:bg-white/[0.02]",
        numColor: "text-fg-subtle",
        indicator: null,
      };
    }

    // Find worst severity
    const severities = lineFindings.map((f) => f.severity);
    const hasCritical = severities.includes("critical");
    const hasHigh = severities.includes("high");
    const hasMedium = severities.includes("medium");
    const hasLow = severities.includes("low");

    let worstSev = "info";
    let bg = "bg-white/[0.05]";
    let numColor = "text-fg-muted";
    let indicatorColor = "bg-fg-subtle";

    if (hasCritical) {
      worstSev = "critical";
      bg = isSelected ? "bg-danger/20" : "bg-danger/10 hover:bg-danger/15";
      numColor = "text-danger font-bold";
      indicatorColor = "bg-danger";
    } else if (hasHigh) {
      worstSev = "high";
      bg = isSelected ? "bg-warning/20" : "bg-warning/10 hover:bg-warning/15";
      numColor = "text-warning font-bold";
      indicatorColor = "bg-warning";
    } else if (hasMedium) {
      worstSev = "medium";
      bg = isSelected ? "bg-[#ebdf34]/20" : "bg-[#ebdf34]/10 hover:bg-[#ebdf34]/15";
      numColor = "text-[#ebdf34] font-bold";
      indicatorColor = "bg-[#ebdf34]";
    } else if (hasLow) {
      worstSev = "low";
      bg = isSelected ? "bg-accent/20" : "bg-accent/10 hover:bg-accent/15";
      numColor = "text-accent font-bold";
      indicatorColor = "bg-accent";
    }

    return {
      rowBg: isSelected ? `${bg} ring-1 ring-inset ring-white/10 text-white` : `${bg} text-white/95`,
      numColor,
      indicator: <div className={clsx("absolute left-0 top-0 bottom-0 w-1 shadow-sm", indicatorColor)} />,
    };
  };

  return (
    <div className="flex flex-col h-full bg-canvas border border-white/[0.06] rounded-3xl overflow-hidden shadow-2xl">
      {/* File Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.06] flex-shrink-0">
        <span className="text-xs font-semibold text-fg truncate max-w-xs sm:max-w-md font-mono">
          {filePath.split("/").pop()}
        </span>
        <span className="text-[10px] text-fg-subtle font-mono uppercase">
          {filePath.endsWith(".yml") || filePath.endsWith(".yaml") ? "YAML" : "TEXT"}
        </span>
      </div>

      {/* Code viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto font-mono text-[12px] leading-relaxed p-4 bg-canvas-subtle/20 select-text"
      >
        {lines.length === 0 ? (
          <div className="h-full flex items-center justify-center text-fg-subtle italic">
            File is empty or could not be loaded
          </div>
        ) : (
          <div className="min-w-max">
            {lines.map((lineContent, idx) => {
              const lineNum = idx + 1;
              const { rowBg, numColor, indicator } = getLineStyles(lineNum);

              return (
                <div
                  key={lineNum}
                  ref={(el) => {
                    lineRefs.current[lineNum] = el;
                  }}
                  onClick={() => onLineClick?.(lineNum)}
                  className={clsx(
                    "relative flex items-stretch pr-4 transition-colors group cursor-pointer py-[1px]",
                    rowBg
                  )}
                >
                  {indicator}

                  {/* Line Number Column */}
                  <div
                    className={clsx(
                      "w-12 text-right pr-4 select-none border-r border-white/[0.04] mr-4 flex-shrink-0",
                      numColor
                    )}
                  >
                    {lineNum}
                  </div>

                  {/* Code Line Content */}
                  <div className="whitespace-pre flex-1 text-left select-text">
                    {lineContent || " "}
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

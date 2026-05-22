"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Calendar, RotateCcw, AlertTriangle, ArrowRight, Gauge, FileCode, CheckCircle2 } from "lucide-react";
import type { FullResultsResponse, FileScanDetail, InlineFinding } from "@/lib/analyze-api";
import { GradeReveal } from "./grade-reveal";
import { FileSelector } from "./file-selector";
import { CodeViewer } from "./code-viewer";
import { FindingCard } from "./finding-card";
import { AiSuggestionPanel } from "./ai-suggestion-panel";
import { formatDistanceToNow } from "date-fns";

interface ResultsViewProps {
  results: FullResultsResponse;
  onScanNew: () => void;
}

export function ResultsView({ results, onScanNew }: ResultsViewProps) {
  const { meta, score, files, totalCostUsd } = results;

  // Selected file and finding states
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);

  // Initialize selected file to the first file (or null)
  useEffect(() => {
    if (files.length > 0 && !selectedFilePath) {
      // Find first file with findings, otherwise default to first file
      const fileWithFindings = files.find((f) => f.findingCount > 0);
      setSelectedFilePath(fileWithFindings ? fileWithFindings.filePath : files[0]!.filePath);
    }
  }, [files, selectedFilePath]);

  // Active file details
  const activeFile = files.find((f) => f.filePath === selectedFilePath) || null;

  // Initialize selected finding when active file changes
  useEffect(() => {
    if (activeFile && activeFile.findings.length > 0) {
      // If we don't have a selected finding, or the current selected finding is not in this file, select the first finding
      const hasSelectedInActive = activeFile.findings.some((f) => f.id === selectedFindingId);
      if (!hasSelectedInActive) {
        setSelectedFindingId(activeFile.findings[0]!.id);
      }
    } else {
      setSelectedFindingId(null);
    }
  }, [activeFile, selectedFindingId]);

  // Active finding details
  const activeFinding = activeFile?.findings.find((f) => f.id === selectedFindingId) || null;

  // Selected line for code highlighting
  const selectedLine = activeFinding?.line || null;

  const handleFileChange = (filePath: string) => {
    setSelectedFilePath(filePath);
    const file = files.find((f) => f.filePath === filePath);
    if (file && file.findings.length > 0) {
      setSelectedFindingId(file.findings[0]!.id);
    } else {
      setSelectedFindingId(null);
    }
  };

  const handleFindingSelect = (finding: InlineFinding) => {
    setSelectedFindingId(finding.id);
  };

  const handleLineClick = (lineNum: number) => {
    // If a line is clicked, see if there is a finding on that line and select it
    if (activeFile) {
      const lineFindings = activeFile.findings.filter((f) => f.line === lineNum);
      if (lineFindings.length > 0) {
        setSelectedFindingId(lineFindings[0]!.id);
      }
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Top Meta Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/[0.02] border border-white/[0.06] rounded-3xl p-6 shadow-sm">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 truncate">
            Scan Report: {meta.repoName}
          </h2>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-fg-subtle">
            <span className="bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.04] font-mono">
              {meta.branch}
            </span>
            <div className="flex items-center">
              <Calendar className="h-3.5 w-3.5 mr-1" />
              {formatDistanceToNow(new Date(meta.scannedAt), { addSuffix: true })}
            </div>
            <span>•</span>
            <span>Duration: {(meta.durationMs / 1000).toFixed(1)}s</span>
            {totalCostUsd > 0 && (
              <>
                <span>•</span>
                <span className="text-[#a3ffa3] font-semibold bg-[#a3ffa3]/5 border border-[#a3ffa3]/10 px-1.5 py-0.5 rounded">
                  AI Pipeline Cost: ${totalCostUsd.toFixed(4)}
                </span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={onScanNew}
          className="flex items-center px-4 py-2 border border-white/[0.08] hover:border-white/[0.15] bg-white/[0.02] hover:bg-white/[0.04] text-xs font-semibold text-fg-muted hover:text-fg rounded-xl transition-all"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Scan Another URL
        </button>
      </div>

      {/* Grade & Score Cards */}
      <GradeReveal
        score={score.value}
        grade={score.grade}
        trend={score.trend}
        breakdown={{
          criticalCount: score.breakdown.criticalCount,
          highCount: score.breakdown.highCount,
          mediumCount: score.breakdown.mediumCount,
          lowCount: score.breakdown.lowCount,
          infoCount: score.breakdown.infoCount,
        }}
      />

      {/* Main 3-Column Interface */}
      {files.length === 0 ? (
        <div className="text-center py-16 bg-white/[0.02] border border-white/[0.06] rounded-3xl">
          <FileCode className="h-10 w-10 text-fg-subtle mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white">No configuration files discovered</h3>
          <p className="text-xs text-fg-muted mt-1">
            We searched but couldn't find any supported CI/CD config files in this repository.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Column 1: Files Selector & Findings Cards List */}
          <div className="lg:col-span-3 flex flex-col gap-6 h-full max-h-[750px]">
            {/* File List */}
            <div className="flex-shrink-0">
              <FileSelector
                files={files}
                selectedFilePath={selectedFilePath}
                onFileSelected={handleFileChange}
              />
            </div>

            {/* Findings List (within active file) */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 min-h-[250px]">
              <div className="px-2 mb-1 flex items-center justify-between">
                <span className="text-[11px] font-bold text-fg-subtle uppercase tracking-wider">
                  Issues in this file
                </span>
                <span className="text-[10px] text-fg-muted font-semibold bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
                  {activeFile?.findingCount || 0} total
                </span>
              </div>

              {activeFile && activeFile.findings.length > 0 ? (
                <div className="space-y-2.5 pr-1">
                  {activeFile.findings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      isActive={finding.id === selectedFindingId}
                      onSelect={() => handleFindingSelect(finding)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex-1 border border-dashed border-white/[0.06] rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                  <CheckCircle2 className="h-8 w-8 text-success mb-2" />
                  <span className="text-xs font-bold text-white">No Issues Found</span>
                  <span className="text-[10px] text-fg-subtle mt-0.5 leading-relaxed">
                    This configuration file conforms to all analyzer standards.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Code Viewer */}
          <div className="lg:col-span-5 h-[500px] lg:h-[750px]">
            {activeFile ? (
              <CodeViewer
                filePath={activeFile.filePath}
                fileContent={activeFile.content}
                findings={activeFile.findings}
                selectedLine={selectedLine}
                onLineClick={handleLineClick}
              />
            ) : (
              <div className="h-full flex items-center justify-center bg-canvas border border-white/[0.06] rounded-3xl italic text-fg-subtle text-xs">
                Select a file to view code
              </div>
            )}
          </div>

          {/* Column 3: AI Explanations & Diff fixes */}
          <div className="lg:col-span-4 h-[500px] lg:h-[750px]">
            {activeFinding && activeFile ? (
              <AiSuggestionPanel finding={activeFinding} filePath={activeFile.filePath} />
            ) : (
              <div className="h-full border border-dashed border-white/[0.06] bg-white/[0.01] rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                <Sparkles className="h-10 w-10 text-accent/50 mb-3 animate-pulse-slow" />
                <h4 className="text-sm font-semibold text-white">AI Assistant Insights</h4>
                <p className="text-xs text-fg-muted mt-1 leading-relaxed max-w-xs">
                  Click on any issue card or highlighted line of code to view AI explanations and code
                  fixes.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

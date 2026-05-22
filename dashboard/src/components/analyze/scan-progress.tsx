"use client";

import React, { useState } from "react";
import { CheckCircle2, Circle, AlertCircle, XCircle, Loader2 } from "lucide-react";
import type { ScanStatusResponse } from "@/lib/analyze-api";

interface ScanProgressProps {
  status: ScanStatusResponse;
  repoId: string;
  onCancel: () => void;
}

export function ScanProgress({ status, repoId, onCancel }: ScanProgressProps) {
  const [cancelling, setCancelling] = useState(false);
  const { layers, progress, overallStatus, estimatedSeconds, repoName, branch, error } = status;

  const handleCancelClick = async () => {
    setCancelling(true);
    try {
      const jobId = `scan:${repoId}:${status.scanId}`;
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onCancel();
      } else {
        // If DELETE isn't allowed (already running), we call onCancel to return to input
        onCancel();
      }
    } catch {
      onCancel();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto py-6 px-4">
      <div className="bg-canvas-subtle/30 backdrop-blur-xl border border-white/[0.06] rounded-3xl p-6 sm:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight flex items-center">
              Scanning Pipeline
              <span className="ml-2.5 px-2 py-0.5 text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 rounded-md">
                Live
              </span>
            </h3>
            <p className="text-xs text-fg-subtle mt-1 font-mono truncate max-w-[280px] sm:max-w-md">
              {repoName} • {branch}
            </p>
          </div>
          {estimatedSeconds !== undefined && estimatedSeconds > 0 && (
            <div className="text-right">
              <span className="block text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
                Est. Remaining
              </span>
              <span className="text-lg font-bold text-accent animate-pulse-slow">
                {estimatedSeconds}s
              </span>
            </div>
          )}
        </div>

        {/* Global Progress Bar */}
        <div className="mb-8 space-y-1.5">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-fg-muted uppercase tracking-wider">Overall Progress</span>
            <span className="text-white">{progress}%</span>
          </div>
          <div className="w-full h-2.5 bg-canvas border border-white/[0.06] rounded-full overflow-hidden p-[1px]">
            <div
              className="h-full bg-gradient-to-r from-accent/70 to-accent rounded-full transition-all duration-500 ease-out shadow-[0_0_12px_rgba(31,111,235,0.4)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 7-Layer Vertical Timeline */}
        <div className="relative pl-1 space-y-6">
          {layers.map((layer, index) => {
            const isLast = index === layers.length - 1;
            
            // Status determinations
            const isCompleted = layer.status === "completed";
            const isRunning = layer.status === "running";
            const isFailed = layer.status === "failed";
            const isPending = layer.status === "pending";

            return (
              <div key={layer.id} className="relative flex gap-4 items-start group">
                {/* Vertical Line Connector */}
                {!isLast && (
                  <div
                    className={`absolute left-[13px] top-[26px] bottom-[-24px] w-[2px] transition-colors duration-300 ${
                      isCompleted
                        ? "bg-success/50"
                        : isRunning
                        ? "bg-accent/30 border-dashed border-l border-accent/40"
                        : "bg-white/[0.06]"
                    }`}
                  />
                )}

                {/* Layer Icon Indicator */}
                <div className="relative z-10 flex items-center justify-center h-7 w-7 rounded-full transition-all">
                  {isCompleted ? (
                    <CheckCircle2 className="h-6 w-6 text-success fill-success/10 bg-canvas rounded-full" />
                  ) : isFailed ? (
                    <XCircle className="h-6 w-6 text-danger fill-danger/10 bg-canvas rounded-full animate-bounce" />
                  ) : isRunning ? (
                    <div className="h-6 w-6 rounded-full border-2 border-accent border-t-transparent animate-spin bg-canvas shadow-[0_0_10px_rgba(31,111,235,0.2)]" />
                  ) : (
                    <Circle className="h-5 w-5 text-fg-subtle bg-canvas rounded-full" />
                  )}
                </div>

                {/* Layer Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-semibold transition-colors duration-200 ${
                        isCompleted
                          ? "text-fg"
                          : isRunning
                          ? "text-accent animate-pulse-slow font-bold"
                          : isFailed
                          ? "text-danger"
                          : "text-fg-subtle"
                      }`}
                    >
                      {layer.name}
                    </span>
                    {layer.durationMs && (
                      <span className="text-[10px] text-fg-subtle font-mono bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/[0.04]">
                        {(layer.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-xs mt-1 transition-colors ${
                      isFailed ? "text-danger/90 font-medium" : "text-fg-muted"
                    }`}
                  >
                    {layer.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Global Error Banner */}
        {overallStatus === "failed" && error && (
          <div className="mt-8 bg-danger/10 border border-danger/20 rounded-2xl p-4 flex gap-3 items-start">
            <AlertCircle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <h4 className="font-bold text-danger mb-0.5">Scan Failed</h4>
              <p className="text-danger/95 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-[11px] text-fg-subtle font-mono">
            ID: {status.scanId.slice(0, 8)}
          </span>
          <button
            onClick={handleCancelClick}
            disabled={cancelling}
            className="flex items-center px-4 py-2 border border-white/[0.08] hover:border-danger/30 hover:bg-danger/10 text-xs font-semibold text-fg-muted hover:text-danger rounded-xl transition-all"
          >
            {cancelling ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                Cancelling...
              </>
            ) : overallStatus === "failed" ? (
              "Go Back"
            ) : (
              "Cancel Scan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

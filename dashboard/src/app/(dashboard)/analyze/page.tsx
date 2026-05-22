"use client";

import React, { useState } from "react";
import { UrlInput } from "@/components/analyze/url-input";
import { ScanProgress } from "@/components/analyze/scan-progress";
import { ResultsView } from "@/components/analyze/results-view";
import { useAnalyzeStatus, useAnalyzeResults } from "@/lib/hooks/use-analyze";
import { Loader2, Sparkles, HelpCircle } from "lucide-react";

export default function AnalyzePage() {
  const [step, setStep] = useState<"input" | "scanning" | "results">("input");
  const [scanId, setScanId] = useState<string | null>(null);
  const [repoId, setRepoId] = useState<string | null>(null);

  // Hook to poll the scan status
  const { status, error: statusError } = useAnalyzeStatus(
    scanId && step === "scanning" ? scanId : undefined
  );

  // Auto-advance to results once the scan completes successfully
  React.useEffect(() => {
    if (status && status.overallStatus === "completed" && step === "scanning") {
      setStep("results");
    }
  }, [status, step]);

  // Hook to fetch full scan results once scan is completed
  const {
    results,
    error: resultsError,
    isLoading: resultsLoading,
  } = useAnalyzeResults(
    scanId && step === "results" ? scanId : undefined,
    step === "results"
  );

  const handleScanTriggered = (newScanId: string, newRepoId: string) => {
    setScanId(newScanId);
    setRepoId(newRepoId);
    setStep("scanning");
  };

  const handleReset = () => {
    setScanId(null);
    setRepoId(null);
    setStep("input");
  };

  return (
    <div className="flex-1 overflow-y-auto min-h-screen bg-canvas p-6">
      {/* Step 1: Input URL */}
      {step === "input" && <UrlInput onScanTriggered={handleScanTriggered} />}

      {/* Step 2: Scanning Progress */}
      {step === "scanning" && status && repoId && (
        <ScanProgress status={status} repoId={repoId} onCancel={handleReset} />
      )}

      {/* Step 3: Loading Results (Transitioning) */}
      {step === "results" && resultsLoading && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <div className="relative flex items-center justify-center">
            <div className="h-12 w-12 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <Sparkles className="absolute h-5 w-5 text-accent animate-pulse-slow" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Aggregating Analysis Results</h3>
            <p className="text-xs text-fg-muted mt-1 max-w-xs">
              Joining Drizzle scan tables and fetching Claude AI explanations...
            </p>
          </div>
        </div>
      )}

      {/* Step 4: Display Results */}
      {step === "results" && results && <ResultsView results={results} onScanNew={handleReset} />}

      {/* Error state fallback */}
      {step === "results" && resultsError && (
        <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
          <HelpCircle className="h-12 w-12 text-danger mx-auto" />
          <h3 className="text-sm font-bold text-white">Error Loading Results</h3>
          <p className="text-xs text-fg-muted leading-relaxed">
            {resultsError.message || "Failed to fetch final Drizzle database scan details."}
          </p>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-xs font-semibold text-white rounded-xl transition-all"
          >
            Go Back
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useAnalyzeFlow } from "@/lib/hooks/use-analyze-flow";
import { URLInputHero } from "@/components/analyze/url-input-hero";
import { ScanPipeline } from "@/components/analyze/scan-pipeline";
import { ResultsShell } from "@/components/analyze/results-shell";

export default function AnalyzePage() {
  const flow = useAnalyzeFlow();
  const { phase } = flow.state;

  return (
    <div className="relative">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 200ms ease forwards;
        }
      `}} />
      {(phase === "idle" || phase === "submitting" || phase === "error") && (
        <div key="hero" className="animate-fadeIn">
          <URLInputHero flow={flow} />
        </div>
      )}

      {(phase === "scanning" || phase === "completed") && (
        <div key="pipeline" className="animate-fadeIn">
          <ScanPipeline flow={flow} />
        </div>
      )}

      {phase === "results" && (
        <div key="results" className="animate-fadeIn">
          <ResultsShell flow={flow} />
        </div>
      )}
    </div>
  );
}

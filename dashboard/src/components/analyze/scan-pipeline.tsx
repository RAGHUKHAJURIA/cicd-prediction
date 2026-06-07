import React, { useEffect, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

const GitlabIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M22.646 11.132l-1.91-5.885c-.157-.481-.84-.481-.996 0l-1.396 4.298H5.656L4.26 5.247c-.157-.481-.84-.481-.996 0l-1.91 5.885c-.116.357-.015.753.256 1.002l10.39 8.243 10.39-8.243c.27-.249.37-.645.256-1.002z" />
  </svg>
);

export function ScanPipeline({ flow }: { flow: any }) {
  const { state, reset } = flow;
  const isCompleted = state.phase === "completed";
  const repoName = state.input?.repoUrl.split("/").slice(-2).join("/") || "Repository";
  const provider = state.input?.repoUrl.includes("gitlab") ? "gitlab" : "github";
  const branch = state.input?.branch || "main";

  // Mock estimated time
  const [estimatedTime, setEstimatedTime] = useState(60);
  useEffect(() => {
    if (state.phase === "scanning") {
      const interval = setInterval(() => {
        setEstimatedTime((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [state.phase]);

  if (isCompleted) {
    return (
      <div style={{ minHeight: "calc(100vh - 56px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ animation: "scaleIn 400ms cubic-bezier(0.16, 1, 0.3, 1)" }} className="text-center">
          <div className="w-16 h-16 rounded-full bg-[#3fb950]/10 flex items-center justify-center mx-auto mb-4 border border-[#3fb950]/20">
            <Check className="w-8 h-8 text-[#3fb950]" />
          </div>
          <h2 className="text-[18px] font-medium text-[#3fb950] mb-2">Analysis complete!</h2>
          <div className="flex items-center justify-center gap-2 text-sm text-[#8b949e]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading results...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ maxWidth: "560px", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {provider === "github" ? <span className="text-[#e6edf3]"><GithubIcon /></span> : <span className="text-[#fc6d26]"><GitlabIcon /></span>}
          <span style={{ fontSize: "16px", fontWeight: 500, color: "#e6edf3" }}>{repoName}</span>
          <span style={{ background: "#161b22", border: "1px solid #30363d", color: "#8b949e", fontSize: "12px", padding: "2px 8px", borderRadius: "20px" }}>
            {branch}
          </span>
          <button
            onClick={reset}
            style={{ marginLeft: "auto", fontSize: "12px", color: "#6e7681", background: "none", border: "none", cursor: "pointer" }}
            className="hover:text-[#8b949e]"
          >
            Cancel
          </button>
        </div>

        <div style={{ marginTop: "8px", fontSize: "14px", color: "#58a6ff", display: "flex", alignItems: "center", gap: "4px" }}>
          Analyzing<span className="animate-pulse">...</span>
        </div>

        <div style={{ marginTop: "20px" }}>
          <div style={{ height: "4px", background: "#21262d", borderRadius: "2px", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${state.overallProgress}%`,
                background: "linear-gradient(90deg, #1f6feb, #3fb950)",
                transition: "width 500ms ease-out",
              }}
            />
          </div>
          <div style={{ fontSize: "12px", color: "#6e7681", textAlign: "right", marginTop: "4px" }}>
            {state.overallProgress}% complete
          </div>
        </div>

        <div style={{ marginTop: "24px", position: "relative", display: "flex", flexDirection: "column", gap: 0 }}>
          {/* Left rail background line */}
          <div style={{ position: "absolute", left: "20px", top: "20px", bottom: "20px", width: "2px", background: "#21262d", zIndex: 0 }} />

          {/* Left rail fill line */}
          <div
            style={{
              position: "absolute",
              left: "20px",
              top: "20px",
              height: `${Math.max(0, (state.layers.filter((l: any) => l.status === "completed").length - 1) * (100 / Math.max(1, state.layers.length - 1)))}%`,
              width: "2px",
              background: "#3fb950",
              zIndex: 1,
              transition: "height 500ms ease",
            }}
          />

          {state.layers.map((layer: any, idx: number) => {
            const isPending = layer.status === "pending";
            const isRunning = layer.status === "running";
            const isCompleted = layer.status === "completed";
            const isFailed = layer.status === "failed";

            return (
              <div
                key={layer.id}
                style={{
                  position: "relative",
                  padding: "12px 16px 12px 48px",
                  background: isRunning ? "rgba(31,111,235,0.04)" : isCompleted ? "rgba(63,185,80,0.02)" : isFailed ? "rgba(248,81,73,0.05)" : "transparent",
                  borderLeft: isRunning ? "2px solid #1f6feb" : "2px solid transparent",
                  borderRadius: isRunning ? "0 6px 6px 0" : "0",
                  zIndex: 2,
                }}
              >
                {/* Indicator Circle */}
                <div
                  style={{
                    position: "absolute",
                    left: isRunning ? "12px" : "14px", // Adjust for border
                    top: "16px",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: isCompleted ? "#3fb950" : isFailed ? "#f85149" : isRunning ? "transparent" : "#21262d",
                    border: isPending ? "1.5px solid #30363d" : isRunning ? "2px solid #1f6feb" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 3,
                  }}
                >
                  {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  {isFailed && <X className="w-3 h-3 text-white" strokeWidth={3} />}
                  {isRunning && (
                    <div
                      style={{
                        width: "6px",
                        height: "6px",
                        backgroundColor: "#1f6feb",
                        borderRadius: "50%",
                        animation: "pulse 1.2s ease-in-out infinite",
                      }}
                    />
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "14px",
                      color: isPending ? "#6e7681" : isRunning ? "#e6edf3" : isFailed ? "#f85149" : "#8b949e",
                      fontWeight: isRunning ? 500 : 400,
                    }}
                  >
                    {layer.name}
                  </span>
                  {isCompleted && layer.durationMs && (
                    <span style={{ marginLeft: "auto", fontSize: "11px", color: "#6e7681" }}>
                      {(layer.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
                {(isRunning || isCompleted || isFailed) && layer.detail && (
                  <div style={{ marginTop: "3px", fontSize: "12px", color: "#8b949e", fontStyle: "italic", animation: "fadeIn 200ms ease" }}>
                    {layer.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {state.phase === "scanning" && (
          <div style={{ marginTop: "24px", fontSize: "12px", color: "#6e7681", textAlign: "center" }}>
            Estimated time remaining: ~{estimatedTime} seconds
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
      `}} />
    </div>
  );
}

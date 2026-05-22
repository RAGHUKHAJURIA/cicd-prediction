"use client";

import React, { useState } from "react";
import { Key, GitBranch, ArrowRight, Loader2, Play } from "lucide-react";

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const GitlabIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="m22 14-10 7-10-7L2 2l4 7h12l4-7z" />
  </svg>
);
import { analyzeApi } from "@/lib/analyze-api";

interface UrlInputProps {
  onScanTriggered: (scanId: string, repoId: string, branch: string) => void;
}

export function UrlInput({ onScanTriggered }: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect URL provider type to change icon/branding color
  const getProvider = (inputUrl: string) => {
    if (inputUrl.includes("github.com")) return "github";
    if (inputUrl.includes("gitlab.com")) return "gitlab";
    return "other";
  };

  const provider = getProvider(url);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeApi.submitUrl({
        repoUrl: url,
        branch: branch || "main",
        token: token || undefined,
      });

      onScanTriggered(response.scanId, response.repoId, response.branch);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while queuing the scan.");
    } finally {
      setLoading(false);
    }
  };

  const selectExample = (exampleUrl: string, exampleBranch: string) => {
    setUrl(exampleUrl);
    setBranch(exampleBranch);
    setError(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-8 px-4">
      <div className="bg-canvas-subtle/30 backdrop-blur-xl border border-white/[0.06] rounded-3xl p-6 sm:p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] transition-all duration-300">
        <div className="mb-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2">
            Paste CI/CD URL to Analyze
          </h2>
          <p className="text-sm text-fg-muted">
            Enter a public GitHub or GitLab repository. No login or installation required.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Main URL Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              {provider === "github" ? (
                <GithubIcon className="h-5 w-5 text-[#f0f6fc]" />
              ) : provider === "gitlab" ? (
                <GitlabIcon className="h-5 w-5 text-[#fc6d26]" />
              ) : (
                <GitBranch className="h-5 w-5 text-accent" />
              )}
            </div>
            <input
              type="url"
              required
              placeholder="https://github.com/owner/repository"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="block w-full pl-12 pr-4 py-3.5 bg-canvas border border-white/[0.08] hover:border-white/[0.15] focus:border-accent rounded-xl text-white placeholder-fg-subtle text-sm focus:outline-none transition-all"
            />
          </div>

          {/* Branch & Token Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-1.5 ml-1">
                Branch (Optional)
              </label>
              <input
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="block w-full px-4 py-2.5 bg-canvas border border-white/[0.08] hover:border-white/[0.12] focus:border-accent rounded-lg text-white text-sm focus:outline-none transition-all"
              />
            </div>

            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="flex items-center justify-between px-4 py-2.5 border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] rounded-lg text-xs font-medium text-fg-muted hover:text-fg transition-all text-left"
              >
                <span className="flex items-center">
                  <Key className="h-3.5 w-3.5 mr-2 text-fg-subtle" />
                  Add Personal Access Token
                </span>
                <span className="text-[10px] text-accent font-semibold">
                  {showToken ? "Hide" : "Show"}
                </span>
              </button>
            </div>
          </div>

          {/* Collapsible Token input */}
          {showToken && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-2 animate-fadeIn">
              <div className="flex items-start justify-between">
                <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
                  Private Token (Stored Ephemerally in Memory)
                </span>
                <span className="text-[9px] text-[#ffbf00] bg-[#ffbf00]/10 border border-[#ffbf00]/20 px-1.5 py-0.5 rounded uppercase font-bold">
                  Ephemeral
                </span>
              </div>
              <input
                type="password"
                placeholder="github_pat_... or gitlab_glpat_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="block w-full px-4 py-2.5 bg-canvas border border-white/[0.08] focus:border-accent rounded-lg text-white text-sm focus:outline-none transition-all"
              />
              <p className="text-[11px] text-fg-subtle leading-relaxed">
                Needed only if the repository is private or rate-limited. This token will be deleted
                immediately from memory within 1 hour.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 text-xs text-danger font-medium">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !url}
            className="w-full flex items-center justify-center py-3.5 bg-accent hover:bg-accent-hover disabled:bg-accent/40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-[0_4px_12px_rgba(31,111,235,0.25)] hover:shadow-[0_4px_20px_rgba(31,111,235,0.4)]"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing Repository Pipelines...
              </>
            ) : (
              <>
                Start Intelligence Scan
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </button>
        </form>

        {/* Examples Section */}
        <div className="mt-8 border-t border-white/[0.06] pt-6">
          <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3 text-center sm:text-left">
            Try an Example Repository
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() =>
                selectExample(
                  "https://github.com/kubernetes/kubernetes",
                  "master"
                )
              }
              className="flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-xl hover:border-white/[0.12] transition-all text-left"
            >
              <div className="flex items-center min-w-0">
                <GithubIcon className="h-4 w-4 text-[#f0f6fc] mr-2 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-white truncate">
                    kubernetes/kubernetes
                  </span>
                  <span className="block text-[10px] text-fg-subtle">
                    Branch: master
                  </span>
                  </div>
                </div>
              <Play className="h-3 w-3 text-fg-subtle hover:text-accent" />
            </button>

            <button
              onClick={() =>
                selectExample(
                  "https://gitlab.com/gitlab-org/gitlab-runner",
                  "main"
                )
              }
              className="flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] rounded-xl hover:border-white/[0.12] transition-all text-left"
            >
              <div className="flex items-center min-w-0">
                <GitlabIcon className="h-4 w-4 text-[#fc6d26] mr-2 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-white truncate">
                    gitlab-org/gitlab-runner
                  </span>
                  <span className="block text-[10px] text-fg-subtle">
                    Branch: main
                  </span>
                  </div>
                </div>
              <Play className="h-3 w-3 text-fg-subtle hover:text-accent" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

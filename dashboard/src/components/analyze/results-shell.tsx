// @ts-nocheck
import React, { useState } from "react";
import { GitBranch, ExternalLink } from "lucide-react";
import { GradeCard } from "./grade-card";
import { ShareButton } from "./share-button";
import { FileTree } from "./file-tree";
import { CodePanel } from "./code-panel";
import { FindingsList } from "./findings-list";
import { AIFixPanel } from "./ai-fix-panel";

const GithubIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

const GitlabIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M22.646 11.132l-1.91-5.885c-.157-.481-.84-.481-.996 0l-1.396 4.298H5.656L4.26 5.247c-.157-.481-.84-.481-.996 0l-1.91 5.885c-.116.357-.015.753.256 1.002l10.39 8.243 10.39-8.243c.27-.249.37-.645.256-1.002z" />
  </svg>
);

export function ResultsShell({ flow }: { flow: any }) {
  const { state, selectFile, selectFinding, reset } = flow;
  const results = state.results;
  const [activeTab, setActiveTab] = useState<"files" | "code" | "ai">("code"); // Mobile tabs

  if (!results) {
    return <div className="p-8 text-center text-[#8b949e]">Loading results...</div>;
  }

  const { meta, score, files, aiReport } = results;
  const provider = meta.repoUrl?.includes("gitlab") ? "gitlab" : "github";

  const selectedFileData = files.find((f: any) => f.filePath === state.selectedFile) || null;
  
  let selectedFinding = null;
  if (selectedFileData && state.selectedFindingId) {
    selectedFinding = selectedFileData.findings.find((f: any) => f.id === state.selectedFindingId) || null;
  }

  const allFindings = files.flatMap((f: any) => f.findings || []);

  const handleSelectFinding = (id: string | null) => {
    selectFinding(id);
    if (id && window.innerWidth < 768) {
      setActiveTab("ai");
    }
  };

  const handleSelectFile = (path: string) => {
    selectFile(path);
    if (window.innerWidth < 768) {
      setActiveTab("code");
    }
  };

  return (
    <div className="h-[calc(100vh-56px)] flex flex-col overflow-hidden bg-[#0d1117]">
      {/* ROW 1: HEADER */}
      <header className="h-16 shrink-0 bg-[#161b22] border-b border-[#30363d] px-5 flex items-center gap-4">
        <div className="flex flex-col justify-center max-w-[300px]">
          <div className="flex items-center gap-2 truncate">
            {provider === "github" ? <span className="text-[#e6edf3]"><GithubIcon /></span> : <span className="text-[#fc6d26]"><GitlabIcon /></span>}
            <span className="font-medium text-[14px] text-[#e6edf3] truncate">{meta.repoName}</span>
            <span className="bg-[#21262d] border border-[#30363d] text-[#8b949e] text-[11px] px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> {meta.branch}
            </span>
          </div>
          <div className="text-[12px] text-[#6e7681] truncate mt-0.5">Analyzed just now</div>
        </div>

        <div className="mx-auto hidden md:flex items-center gap-6">
          <GradeCard grade={score.grade as any} score={score.value} trend={score.trend as any} compact />
          <div className="h-6 w-px bg-[#30363d]" />
          <div className="flex items-center gap-3">
            <span className="text-[13px] flex items-center gap-1 text-[#e6edf3]">
              <div className="w-2 h-2 rounded-full bg-[#f85149]" /> {score.breakdown.criticalCount}
            </span>
            <span className="text-[13px] flex items-center gap-1 text-[#e6edf3]">
              <div className="w-2 h-2 rounded-full bg-[#db6d28]" /> {score.breakdown.highCount}
            </span>
            <span className="text-[13px] flex items-center gap-1 text-[#e6edf3]">
              <div className="w-2 h-2 rounded-full bg-[#d29922]" /> {score.breakdown.mediumCount}
            </span>
            <span className="text-[13px] flex items-center gap-1 text-[#e6edf3]">
              <div className="w-2 h-2 rounded-full bg-[#58a6ff]" /> {score.breakdown.lowCount}
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={reset}
            className="hidden sm:flex h-8 px-3 rounded-md text-[13px] font-medium text-[#e6edf3] bg-transparent border border-[#30363d] hover:bg-[#21262d] transition-colors"
          >
            Re-analyze
          </button>
          {meta.scanId && <ShareButton scanId={meta.scanId} repoName={meta.repoName} />}
          <a
            href={`/repos/${meta.repoId}/scans/${meta.scanId}`}
            target="_blank"
            rel="noreferrer"
            className="hidden lg:flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium text-[#e6edf3] bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] transition-colors"
          >
            Full report <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </header>

      {/* MOBILE TABS */}
      <div className="md:hidden flex border-b border-[#30363d] bg-[#161b22] shrink-0">
        <button
          className={`flex-1 py-3 text-[13px] font-medium border-b-2 ${activeTab === "files" ? "border-[#1f6feb] text-[#e6edf3]" : "border-transparent text-[#8b949e]"}`}
          onClick={() => setActiveTab("files")}
        >
          Files
        </button>
        <button
          className={`flex-1 py-3 text-[13px] font-medium border-b-2 ${activeTab === "code" ? "border-[#1f6feb] text-[#e6edf3]" : "border-transparent text-[#8b949e]"}`}
          onClick={() => setActiveTab("code")}
        >
          Code
        </button>
        <button
          className={`flex-1 py-3 text-[13px] font-medium border-b-2 ${activeTab === "ai" ? "border-[#1f6feb] text-[#e6edf3]" : "border-transparent text-[#8b949e]"}`}
          onClick={() => setActiveTab("ai")}
        >
          AI Fix
        </button>
      </div>

      {/* ROW 2: THREE COLUMNS */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className={`w-[240px] shrink-0 h-full md:block ${activeTab === "files" ? "block w-full" : "hidden"}`}>
          <FileTree files={files} selected={state.selectedFile} onSelect={handleSelectFile} />
        </div>
        
        <div className={`flex-1 flex flex-col min-w-0 h-full border-l border-[#30363d] md:flex ${activeTab === "code" ? "flex" : "hidden"}`}>
          <CodePanel
            file={selectedFileData}
            selectedFindingId={state.selectedFindingId}
            onSelectFinding={handleSelectFinding}
          />
          {selectedFileData && (
            <FindingsList
              findings={selectedFileData.findings}
              selectedId={state.selectedFindingId}
              onSelect={handleSelectFinding}
            />
          )}
        </div>

        <div className={`xl:block xl:w-[400px] shrink-0 h-full ${activeTab === "ai" ? "block w-full" : "hidden"}`}>
          <AIFixPanel
            finding={selectedFinding as any}
            aiReport={aiReport}
            allFindings={allFindings}
            onClose={() => handleSelectFinding(null)}
          />
        </div>
      </div>
    </div>
  );
}

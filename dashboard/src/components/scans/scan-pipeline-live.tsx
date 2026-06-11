'use client';

import { ScanPhase } from '@/lib/types/scan.types';
import { FolderOpen, Download, Code, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

const Github = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

interface ScanPipelineLiveProps {
  phase: ScanPhase;
  progress: number;
  currentStage: number;
  repoName: string;
  onCancel?: () => void;
}

const STAGES = [
  { 
    id: 1, 
    name: 'Connecting to GitHub',
    detail: 'Authenticating with your access token',
    icon: Github
  },
  { 
    id: 2, 
    name: 'Fetching repository files',
    detail: 'Scanning for CI/CD configuration files',
    icon: FolderOpen
  },
  { 
    id: 3, 
    name: 'Downloading file contents',
    detail: 'Reading workflow YAML, Dockerfiles, manifests',
    icon: Download
  },
  { 
    id: 4, 
    name: 'Parsing configurations',
    detail: 'Building normalized AST from all CI/CD files',
    icon: Code
  },
  { 
    id: 5, 
    name: 'Running 26 security & reliability rules',
    detail: 'Checking for vulnerabilities and misconfigurations',
    icon: ShieldCheck
  },
  { 
    id: 6, 
    name: 'AI-powered analysis',
    detail: 'Claude is generating explanations and patches',
    icon: Sparkles
  },
];

export function ScanPipelineLive({
  phase,
  progress,
  currentStage,
  repoName,
  onCancel
}: ScanPipelineLiveProps) {
  const [stageDurations, setStageDurations] = useState<Record<number, number>>({});
  const [lastStageChangeTime, setLastStageChangeTime] = useState<number>(Date.now());
  const [prevStage, setPrevStage] = useState<number>(currentStage);

  // Dynamic elapsed time tracking
  useEffect(() => {
    if (currentStage !== prevStage) {
      const now = Date.now();
      const elapsed = Math.max(0.1, parseFloat(((now - lastStageChangeTime) / 1000).toFixed(1)));
      setStageDurations(prev => ({
        ...prev,
        [prevStage]: elapsed
      }));
      setLastStageChangeTime(now);
      setPrevStage(currentStage);
    }
  }, [currentStage, prevStage, lastStageChangeTime]);

  const estimatedTimeRemaining = Math.max(0, Math.round(((100 - progress) / 100) * 45));

  // Dynamically calculate the green track height for the left rail line
  const completedRatio = Math.min(100, Math.max(0, ((currentStage - 1) / (STAGES.length - 1)) * 100));

  return (
    <div className="w-full max-w-[560px] mx-auto bg-transparent p-4 animate-fade-in">
      <style jsx global>{`
        @keyframes stageRingPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.75); }
        }
        .animate-ring-pulse {
          animation: stageRingPulse 1.2s infinite;
        }
        @keyframes loadingDots {
          0%, 100% { content: ''; }
          25% { content: '.'; }
          50% { content: '..'; }
          75% { content: '...'; }
        }
        .ai-thinking-dots::after {
          display: inline-block;
          animation: loadingDots 1.5s infinite;
          content: '';
          width: 24px;
          text-align: left;
        }
      `}</style>

      {/* Repo Header Row */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-fg-muted" />
          <span className="text-sm font-medium text-fg">{repoName}</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-900/30 text-blue-400 border border-blue-800/50 animate-pulse">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
            Analyzing...
          </span>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-fg-muted hover:text-fg flex items-center gap-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}
      </div>

      {/* Overall Progress Bar */}
      <div className="mt-4">
        <div className="w-full h-1 bg-[#21262d] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#1f6feb] to-[#3fb950] transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-[11px] text-fg-subtle">
            {phase === 'scanning' && `Estimated time remaining: ~${estimatedTimeRemaining}s`}
          </span>
          <span className="text-[11px] font-mono text-fg-subtle">{progress}%</span>
        </div>
      </div>

      {/* Stages List */}
      <div className="relative mt-6">
        {/* Left Rail Line */}
        <div className="absolute left-[18px] top-4 bottom-4 w-[1.5px] bg-[#21262d]">
          <div
            className="w-full bg-[#3fb950] transition-all duration-500 ease-out origin-top"
            style={{ height: `${completedRatio}%` }}
          />
        </div>

        {/* Each Stage Row */}
        <div className="space-y-1">
          {STAGES.map((stage) => {
            const IconComponent = stage.icon;
            const isCompleted = stage.id < currentStage;
            const isRunning = stage.id === currentStage;
            const isPending = stage.id > currentStage;

            const duration = stageDurations[stage.id];

            return (
              <div
                key={stage.id}
                className={clsx(
                  "relative pl-11 pr-4 py-2.5 min-height-[48px] flex justify-between items-start transition-all border-l-2 border-transparent",
                  isRunning && "bg-blue-500/5 border-l-[#1f6feb] rounded-r-md -ml-0.5"
                )}
              >
                {/* Status Circle indicator */}
                <div className="absolute left-[12px] top-[14px] w-3.5 h-3.5 flex items-center justify-center">
                  {isCompleted && (
                    <div className="w-3.5 h-3.5 rounded-full bg-[#3fb950] flex items-center justify-center">
                      <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 5 4.5 7.5 8 3" />
                      </svg>
                    </div>
                  )}

                  {isRunning && (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-[#1f6feb] flex items-center justify-center bg-canvas">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1f6feb] animate-ring-pulse" />
                    </div>
                  )}

                  {isPending && (
                    <div className="w-3.5 h-3.5 rounded-full bg-[#21262d] border border-[#30363d]" />
                  )}
                </div>

                {/* Stage Info */}
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <IconComponent
                      className={clsx(
                        "w-4 h-4 shrink-0",
                        isCompleted && "text-[#8b949e]",
                        isRunning && "text-[#e6edf3]",
                        isPending && "text-[#6e7681]"
                      )}
                    />
                    <span
                      className={clsx(
                        "text-xs font-semibold",
                        isCompleted && "text-[#8b949e]",
                        isRunning && "text-[#e6edf3]",
                        isPending && "text-[#6e7681]"
                      )}
                    >
                      {stage.name}
                    </span>
                  </div>

                  {/* Stage Details */}
                  {(isRunning || isCompleted) && (
                    <div className="mt-0.5 pl-6 text-[11px]">
                      {isRunning && stage.id === 6 ? (
                        <span className="text-[#8b949e] italic ai-thinking-dots">Claude is thinking</span>
                      ) : isRunning ? (
                        <span className="text-[#8b949e] italic">{stage.detail}</span>
                      ) : (
                        <span className="text-[#6e7681]">{stage.detail}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Duration Badge */}
                {isCompleted && duration !== undefined && (
                  <span className="text-[10px] font-mono text-[#6e7681] shrink-0 mt-0.5">
                    {duration}s
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

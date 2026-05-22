"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GradeRevealProps {
  score: number;
  grade: string;
  trend: "new" | "improving" | "stable" | "degrading";
  breakdown: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
}

export function GradeReveal({ score, grade, trend, breakdown }: GradeRevealProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  // Animate numeric score count up
  useEffect(() => {
    let start = 0;
    const duration = 1400; // matching CSS animation
    const stepTime = Math.abs(Math.floor(duration / score));
    
    if (score === 0) return;

    const timer = setInterval(() => {
      start += 1;
      setAnimatedScore(start);
      if (start >= score) {
        clearInterval(timer);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [score]);

  // SVG ring variables
  const radius = 65;
  const circumference = 2 * Math.PI * radius; // ~408.41
  const offset = circumference - (score / 100) * circumference;

  // Trend styles
  const trendDetails = {
    new: { text: "First scan", icon: Minus, color: "text-fg-subtle border-white/[0.06] bg-white/[0.02]" },
    improving: { text: "Postures improving", icon: TrendingUp, color: "text-success border-success/20 bg-success/5" },
    stable: { text: "Stable posture", icon: Minus, color: "text-fg-subtle border-white/[0.06] bg-white/[0.02]" },
    degrading: { text: "Degraded posture", icon: TrendingDown, color: "text-danger border-danger/20 bg-danger/5" },
  };

  const currentTrend = trendDetails[trend] || trendDetails.stable;

  // Grade color map
  const gradeColors: Record<string, string> = {
    A: "text-success drop-shadow-[0_0_12px_rgba(34,197,94,0.3)]",
    B: "text-[#8ceb34] drop-shadow-[0_0_12px_rgba(140,235,52,0.2)]",
    C: "text-[#ebdf34] drop-shadow-[0_0_12px_rgba(235,223,52,0.2)]",
    D: "text-[#eba834] drop-shadow-[0_0_12px_rgba(235,168,52,0.2)]",
    E: "text-warning drop-shadow-[0_0_12px_rgba(249,115,22,0.2)]",
    F: "text-danger drop-shadow-[0_0_12px_rgba(239,68,68,0.3)]",
  };

  const gradeColor = gradeColors[grade] || "text-white";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center bg-white/[0.02] border border-white/[0.06] rounded-3xl p-6 shadow-sm">
      {/* Circle Ring Reveal */}
      <div className="flex justify-center items-center gap-6 md:border-r border-white/[0.06] py-2">
        <div className="relative h-36 w-36 flex items-center justify-center">
          <svg className="absolute transform -rotate-90 w-full h-full">
            {/* Background circle */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              className="stroke-white/[0.04]"
              strokeWidth="10"
              fill="transparent"
            />
            {/* Animated foreground circle */}
            <circle
              cx="72"
              cy="72"
              r={radius}
              className="score-ring-fill stroke-accent"
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={circumference}
              style={{
                strokeDashoffset: circumference,
                // Custom CSS variable for ring animation
                // @ts-ignore
                "--ring-offset": offset,
              }}
            />
          </svg>
          <div className="text-center z-10">
            <span className="block text-2xl font-extrabold text-white leading-none">
              {animatedScore}
            </span>
            <span className="block text-[10px] text-fg-subtle uppercase tracking-wider font-semibold mt-1">
              Score
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider block">
            Reliability Grade
          </span>
          <span className={`text-5xl font-black block tracking-tighter ${gradeColor}`}>
            {grade}
          </span>
          {/* Trend Badge */}
          <div
            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium mt-1 ${currentTrend.color}`}
          >
            <currentTrend.icon className="h-3 w-3 mr-1" />
            {currentTrend.text}
          </div>
        </div>
      </div>

      {/* Finding Breakdown Bar */}
      <div className="md:col-span-2 flex flex-col justify-center h-full px-2 sm:px-6">
        <h4 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-4">
          Finding Severity Profile
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          {/* Critical */}
          <div className="bg-canvas/30 border border-white/[0.04] rounded-2xl p-3 text-center">
            <span className="text-xs font-medium text-fg-muted block">Critical</span>
            <span className="text-xl font-bold text-danger block mt-1 count-up">
              {breakdown.criticalCount}
            </span>
          </div>

          {/* High */}
          <div className="bg-canvas/30 border border-white/[0.04] rounded-2xl p-3 text-center">
            <span className="text-xs font-medium text-fg-muted block">High</span>
            <span className="text-xl font-bold text-warning block mt-1 count-up">
              {breakdown.highCount}
            </span>
          </div>

          {/* Medium */}
          <div className="bg-canvas/30 border border-white/[0.04] rounded-2xl p-3 text-center">
            <span className="text-xs font-medium text-fg-muted block">Medium</span>
            <span className="text-xl font-bold text-[#ebdf34] block mt-1 count-up">
              {breakdown.mediumCount}
            </span>
          </div>

          {/* Low */}
          <div className="bg-canvas/30 border border-white/[0.04] rounded-2xl p-3 text-center">
            <span className="text-xs font-medium text-fg-muted block">Low</span>
            <span className="text-xl font-bold text-accent block mt-1 count-up">
              {breakdown.lowCount}
            </span>
          </div>

          {/* Total */}
          <div className="bg-canvas/40 border border-white/[0.06] rounded-2xl p-3 text-center col-span-2 sm:col-span-1">
            <span className="text-xs font-medium text-fg-muted block">Total</span>
            <span className="text-xl font-bold text-white block mt-1 count-up">
              {breakdown.criticalCount +
                breakdown.highCount +
                breakdown.mediumCount +
                breakdown.lowCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

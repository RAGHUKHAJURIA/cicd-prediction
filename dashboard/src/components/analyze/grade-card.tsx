import React, { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, ArrowRight, Sparkles } from "lucide-react";

export function GradeCard({
  grade,
  score,
  trend,
  compact = false,
}: {
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
  trend?: "new" | "improving" | "stable" | "degrading";
  compact?: boolean;
}) {
  const gradeColors = {
    A: { primary: "#3fb950", glow: "rgba(63,185,80,0.3)", bg: "rgba(63,185,80,0.08)", border: "rgba(63,185,80,0.2)" },
    B: { primary: "#58a6ff", glow: "rgba(88,166,255,0.3)", bg: "rgba(88,166,255,0.08)", border: "rgba(88,166,255,0.2)" },
    C: { primary: "#d29922", glow: "rgba(210,153,34,0.3)", bg: "rgba(210,153,34,0.08)", border: "rgba(210,153,34,0.2)" },
    D: { primary: "#db6d28", glow: "rgba(219,109,40,0.3)", bg: "rgba(219,109,40,0.08)", border: "rgba(219,109,40,0.2)" },
    F: { primary: "#f85149", glow: "rgba(248,81,73,0.3)", bg: "rgba(248,81,73,0.08)", border: "rgba(248,81,73,0.2)" },
  };

  const colors = gradeColors[grade] || gradeColors.C;
  const [animatedScore, setAnimatedScore] = useState(0);
  const circumference = 2 * Math.PI * 50;

  useEffect(() => {
    if (!compact) {
      const duration = 600;
      const start = performance.now();
      const animate = (time: number) => {
        const elapsed = time - start;
        const progress = Math.min(elapsed / duration, 1);
        // easeOutQuart
        const ease = 1 - Math.pow(1 - progress, 4);
        setAnimatedScore(Math.round(score * ease));
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
  }, [score, compact]);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: "32px",
            height: "32px",
            background: colors.bg,
            border: `1.5px solid ${colors.border}`,
          }}
        >
          <span style={{ fontSize: "16px", fontWeight: 500, color: colors.primary }}>{grade}</span>
        </div>
        <div className="flex items-baseline">
          <span className="text-[14px] text-[#e6edf3] font-medium">{score}</span>
          <span className="text-[12px] text-[#6e7681]">/100</span>
        </div>
        {trend === "improving" && <ArrowUp className="w-3.5 h-3.5 text-[#3fb950]" />}
        {trend === "degrading" && <ArrowDown className="w-3.5 h-3.5 text-[#f85149]" />}
        {trend === "stable" && <ArrowRight className="w-3.5 h-3.5 text-[#8b949e]" />}
      </div>
    );
  }

  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes gradeScale {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes glowPulse {
          0% { box-shadow: 0 0 0 rgba(0,0,0,0); }
          50% { box-shadow: 0 0 24px ${colors.glow}; }
          100% { box-shadow: 0 0 0 rgba(0,0,0,0); }
        }
        .grade-anim {
          animation: gradeScale 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        .glow-wrap {
          border-radius: 50%;
          animation: glowPulse 1.5s ease-out 800ms;
        }
      `}} />
      <div className="glow-wrap relative" style={{ width: "120px", height: "120px" }}>
        <svg viewBox="0 0 120 120" width="120" height="120" className="rotate-[-90deg]">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#21262d" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={colors.primary}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 800ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[36px] font-medium grade-anim" style={{ color: colors.primary, lineHeight: 1 }}>
            {grade}
          </span>
          <span className="text-[13px] text-[#8b949e] mt-1">{animatedScore}/100</span>
        </div>
      </div>
      {trend && (
        <div
          className="flex items-center gap-1 text-[12px] font-medium mt-1 px-2 py-0.5 rounded-full"
          style={{
            color: trend === "improving" ? "#3fb950" : trend === "degrading" ? "#f85149" : trend === "new" ? "#58a6ff" : "#8b949e",
            background: trend === "improving" ? "rgba(63,185,80,0.1)" : trend === "degrading" ? "rgba(248,81,73,0.1)" : trend === "new" ? "rgba(88,166,255,0.1)" : "rgba(139,148,158,0.1)",
          }}
        >
          {trend === "improving" && <><ArrowUp className="w-3 h-3" /> Improved</>}
          {trend === "degrading" && <><ArrowDown className="w-3 h-3" /> Degraded</>}
          {trend === "stable" && <><ArrowRight className="w-3 h-3" /> Stable</>}
          {trend === "new" && <><Sparkles className="w-3 h-3" /> First scan</>}
        </div>
      )}
    </div>
  );
}

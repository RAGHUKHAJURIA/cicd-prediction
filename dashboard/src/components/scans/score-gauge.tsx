import clsx from 'clsx';
import { useEffect, useState } from 'react';

interface ScoreGaugeProps {
  score: number;
  grade: string;
}

export function ScoreGauge({ score, grade }: ScoreGaugeProps) {
  const validScore = typeof score === 'number' && !isNaN(score) ? score : 0;
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedScore(validScore);
    }, 100);
    return () => clearTimeout(timer);
  }, [validScore]);

  // Map score to 0-180 degrees for semi-circle
  const rotation = (animatedScore / 100) * 180;

  let colorClass = 'text-success glow-success';
  if (validScore >= 25 && validScore < 50) colorClass = 'text-blue-400 glow-accent';
  else if (validScore >= 50 && validScore < 75) colorClass = 'text-warning glow-warning';
  else if (validScore >= 75 && validScore < 90) colorClass = 'text-severe glow-warning'; // no orange glow, fallback to warning
  else if (validScore >= 90) colorClass = 'text-danger glow-danger';

  let fillClass = 'stroke-success';
  if (validScore >= 25 && validScore < 50) fillClass = 'stroke-blue-400';
  else if (validScore >= 50 && validScore < 75) fillClass = 'stroke-warning';
  else if (validScore >= 75 && validScore < 90) fillClass = 'stroke-severe';
  else if (validScore >= 90) fillClass = 'stroke-danger';

  return (
    <div className="relative w-48 h-24 flex flex-col items-center justify-end overflow-hidden">
      <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible absolute top-0 left-0">
        {/* Background track */}
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-border"
        />
        {/* Animated fill */}
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className={clsx("transition-all duration-1000 ease-out", fillClass)}
          strokeDasharray="125.6" // approx Math.PI * 40
          strokeDashoffset={125.6 - (125.6 * (animatedScore / 100))}
        />
      </svg>
      
      <div className="z-10 flex flex-col items-center mb-1">
        <span className={clsx("text-4xl font-bold leading-none", colorClass)}>{validScore}</span>
        <span className="text-xs text-fg-muted font-mono mt-1">Grade {grade || 'N/A'}</span>
      </div>
    </div>
  );
}

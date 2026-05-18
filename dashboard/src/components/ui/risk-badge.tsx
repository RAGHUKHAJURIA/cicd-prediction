import clsx from 'clsx';

interface RiskBadgeProps {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RiskBadge({ grade, size = 'md', className }: RiskBadgeProps) {
  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  const gradeClasses = {
    A: 'text-success border-success-subtle bg-success-subtle/30 glow-success',
    B: 'text-blue-400 border-blue-900/50 bg-blue-900/20 glow-accent',
    C: 'text-warning border-warning-subtle bg-warning-subtle/30 glow-warning',
    D: 'text-severe border-severe-subtle bg-severe-subtle/30',
    F: 'text-danger border-danger-subtle bg-danger-subtle/30 glow-danger',
  };

  return (
    <span
      className={clsx(
        'rounded-full border font-bold font-mono inline-flex items-center justify-center animate-fade-in',
        sizeClasses[size],
        gradeClasses[grade],
        className
      )}
    >
      {grade}
    </span>
  );
}

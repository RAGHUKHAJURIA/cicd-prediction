'use client'

import { Loader2 } from 'lucide-react'

interface ImportProgressProps {
  repoName: string
  status?: 'importing' | 'scanning' | 'done'
}

export function ImportProgress({
  repoName,
  status = 'importing',
}: ImportProgressProps) {
  const messages: Record<string, string> = {
    importing: 'Importing repository…',
    scanning: 'Fetching repository files…',
    done: 'Import complete!',
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <div className="relative mb-6">
        <div className="w-12 h-12 rounded-full border-2 border-[#30363d] flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#1f6feb] animate-spin" />
        </div>
        {/* Subtle glow */}
        <div className="absolute inset-0 w-12 h-12 rounded-full bg-[#1f6feb]/10 blur-md" />
      </div>

      <p className="text-sm font-medium text-[#e6edf3] mb-1">
        {messages[status]}
      </p>
      <p className="text-xs text-[#8b949e] font-mono">{repoName}</p>

      {/* Animated dots */}
      <div className="flex gap-1 mt-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[#1f6feb]"
            style={{
              animation: 'pulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

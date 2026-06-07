'use client'

import { Lock, Loader2, Check, ExternalLink } from 'lucide-react'
import type { GitHubRepo } from '@/lib/github-repos-api'
import { formatDistanceToNow } from 'date-fns'

// Language color map
const LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  Ruby: '#701516',
  'C++': '#f34b7d',
  C: '#555555',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  HCL: '#844fba',
  YAML: '#cb171e',
}

interface GitHubRepoCardProps {
  repo: GitHubRepo
  isImported?: boolean
  isImporting?: boolean
  importSuccess?: boolean
  onImport: () => void
  onView?: () => void
}

export function GitHubRepoCard({
  repo,
  isImported = false,
  isImporting = false,
  importSuccess = false,
  onImport,
  onView,
}: GitHubRepoCardProps) {
  const langColor = LANG_COLORS[repo.language ?? ''] ?? '#8b949e'
  const timeAgo = repo.updated_at
    ? formatDistanceToNow(new Date(repo.updated_at), { addSuffix: true })
    : ''

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 border-b border-[#21262d] hover:bg-white/[0.03] transition-colors ${
        isImported ? 'border-l-2 border-l-[#3fb950]' : ''
      }`}
    >
      {/* Left: Avatar + repo info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <img
          src={repo.owner.avatar_url}
          alt={repo.owner.login}
          className="w-6 h-6 rounded-full flex-shrink-0 border border-[#30363d]"
        />
        <div className="min-w-0 flex-1">
          {/* Row 1: name + lock */}
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-[#e6edf3] truncate">
              {repo.full_name}
            </span>
            {repo.private && (
              <Lock className="w-3 h-3 text-[#8b949e] flex-shrink-0" />
            )}
          </div>
          {/* Row 2: description */}
          {repo.description && (
            <p className="text-xs text-[#8b949e] truncate max-w-[350px] mt-0.5">
              {repo.description}
            </p>
          )}
          {/* Row 3: language + time */}
          <div className="flex items-center gap-2 mt-1">
            {repo.language && (
              <div className="flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: langColor }}
                />
                <span className="text-xs text-[#8b949e]">{repo.language}</span>
              </div>
            )}
            {repo.language && timeAgo && (
              <span className="text-xs text-[#6e7681]">·</span>
            )}
            {timeAgo && (
              <span className="text-xs text-[#6e7681]">{timeAgo}</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: button */}
      <div className="flex-shrink-0 ml-3">
        {isImported ? (
          <button
            onClick={onView}
            className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-[#8b949e] hover:text-[#e6edf3] bg-transparent border border-[#30363d] hover:border-[#8b949e] rounded-md transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View
          </button>
        ) : importSuccess ? (
          <span className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-[#3fb950]">
            <Check className="w-3.5 h-3.5" />
            Imported
          </span>
        ) : (
          <button
            onClick={onImport}
            disabled={isImporting}
            className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-white bg-[#1f6feb] hover:bg-[#388bfd] rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Importing…
              </>
            ) : (
              'Import'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

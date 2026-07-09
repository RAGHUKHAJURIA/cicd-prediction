'use client'

import React from 'react'
import { GitPullRequest, Info } from 'lucide-react'

export interface ApplyFixesButtonProps {
  scanId: string
  repoId: string
  repoName: string
  branch: string
  defaultBranch: string
  hasAutoFixes: boolean
  autoFixCount: number
  manualFixCount: number
  isGithubConnected: boolean
  onOpenModal: () => void
}

export function ApplyFixesButton({
  hasAutoFixes,
  autoFixCount,
  manualFixCount,
  isGithubConnected,
  onOpenModal,
}: ApplyFixesButtonProps) {
  return (
    <div className="flex flex-col gap-1.5 items-end">
      {isGithubConnected && hasAutoFixes ? (
        <button
          onClick={onOpenModal}
          className="flex items-center gap-2 h-9 px-4 rounded-md text-xs font-semibold border transition-all select-none"
          style={{
            backgroundColor: 'rgba(63, 185, 80, 0.1)',
            borderColor: 'rgba(63, 185, 80, 0.3)',
            color: '#3fb950',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(63, 185, 80, 0.15)'
            e.currentTarget.style.borderColor = 'rgba(63, 185, 80, 0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(63, 185, 80, 0.1)'
            e.currentTarget.style.borderColor = 'rgba(63, 185, 80, 0.3)'
          }}
        >
          <GitPullRequest className="w-3.5 h-3.5" />
          <span>Apply {autoFixCount} fix{autoFixCount === 1 ? '' : 'es'} →</span>
        </button>
      ) : !isGithubConnected ? (
        <div className="relative group">
          <button
            disabled
            className="flex items-center gap-2 h-9 px-4 rounded-md text-xs font-semibold border opacity-50 cursor-not-allowed select-none"
            style={{
              backgroundColor: 'rgba(63, 185, 80, 0.1)',
              borderColor: 'rgba(63, 185, 80, 0.3)',
              color: '#3fb950',
            }}
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>Apply fixes</span>
          </button>
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block bg-canvas-inset border border-border text-fg-muted text-[10px] py-1 px-2.5 rounded shadow-lg whitespace-nowrap z-50">
            Connect GitHub to apply fixes automatically
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#8b949e' }}>
          <Info className="w-3.5 h-3.5" />
          <span>Fixes require manual review</span>
        </div>
      )}

      {hasAutoFixes && (
        <div className="text-[10px]" style={{ color: '#6e7681' }}>
          {autoFixCount} auto-fix{autoFixCount === 1 ? '' : 'es'} available
          {manualFixCount > 0 && ` + ${manualFixCount} need manual review`}
        </div>
      )}
    </div>
  )
}

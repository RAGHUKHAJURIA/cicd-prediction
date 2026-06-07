'use client'

import * as Dialog from '@radix-ui/react-dialog'
import {
  X,
  GitCommitHorizontal,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
  Info,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useScanActions } from '@/lib/hooks/use-scan-actions'
import { githubReposApi, GitHubBranch } from '@/lib/github-repos-api'

interface AIPatch {
  id: string
  ruleId: string | null
  title: string
  beforeCode: string | null
  afterCode: string | null
  language: string | null
  instructions: string | null
  filePath?: string
}

interface PushPatchModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scanId: string
  repoId: string
  repoOwner: string
  repoName: string
  defaultBranch: string
  patches: AIPatch[]
}

export function PushPatchModal({
  open,
  onOpenChange,
  scanId,
  repoId,
  repoOwner,
  repoName,
  defaultBranch,
  patches,
}: PushPatchModalProps) {
  const { pushPatch, pushPatchState, pushPatchResult, pushPatchError, resetPushPatch } =
    useScanActions(scanId, repoId)

  const [selectedBranch, setSelectedBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedBranch(defaultBranch)
      resetPushPatch()
      githubReposApi
        .getBranches(repoOwner, repoName)
        .then((r) => setBranches(r.branches))
        .catch(() => setBranches([{ name: defaultBranch, protected: false }]))
    }
  }, [open, defaultBranch, repoOwner, repoName, resetPushPatch])

  const handlePush = async () => {
    try {
      await pushPatch(selectedBranch, patches.map((p) => p.id))
    } catch {
      // Error handled by hook
    }
  }

  const isNonDefault = selectedBranch !== defaultBranch

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[480px] bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl animate-slide-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#1f6feb]/10 border border-[#1f6feb]/20 flex items-center justify-center">
                <GitCommitHorizontal className="w-4 h-4 text-[#58a6ff]" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold text-[#e6edf3]">
                  Push patch file to GitHub
                </Dialog.Title>
                <p className="text-xs text-[#8b949e]">
                  Commits a patch file to your repository
                </p>
              </div>
            </div>
            <Dialog.Close className="text-[#8b949e] hover:text-[#e6edf3] p-1 rounded-md hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          {pushPatchState === 'success' && pushPatchResult ? (
            /* Success state */
            <div className="px-5 pb-6 pt-4 flex flex-col items-center text-center">
              <CheckCircle2 className="w-12 h-12 text-[#3fb950] mb-4" />
              <p className="text-sm font-semibold text-[#e6edf3] mb-1">
                Patch file pushed!
              </p>
              <p className="text-xs text-[#8b949e] mb-5">
                {pushPatchResult.patchesIncluded} patches committed to{' '}
                <span className="font-mono">{selectedBranch}</span>
              </p>
              <div className="flex gap-3">
                <a
                  href={pushPatchResult.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 h-8 px-4 text-xs font-medium text-white bg-[#1f6feb] hover:bg-[#388bfd] rounded-md transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View commit
                </a>
                <button
                  onClick={() => onOpenChange(false)}
                  className="h-8 px-4 text-xs font-medium text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Form state */
            <div className="px-5 pb-5 space-y-4">
              {/* Repo info */}
              <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-md">
                <svg
                  viewBox="0 0 16 16"
                  className="w-4 h-4 text-[#8b949e]"
                  fill="currentColor"
                >
                  <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 01-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 010 8c0-4.42 3.58-8 8-8z" />
                </svg>
                <span className="text-xs font-mono text-[#e6edf3]">
                  {repoOwner}/{repoName}
                </span>
              </div>

              {/* Branch selector */}
              <div>
                <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">
                  Target branch
                </label>
                <div className="relative">
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full h-9 px-3 pr-8 bg-[#010409] border border-[#30363d] rounded-md text-xs text-[#e6edf3] focus:outline-none focus:border-[#1f6feb] appearance-none cursor-pointer"
                  >
                    {branches.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8b949e] pointer-events-none" />
                </div>
                {isNonDefault && (
                  <div className="flex items-start gap-1.5 mt-2 px-2.5 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <span className="text-[11px] text-yellow-400">
                      Pushing to a non-default branch
                    </span>
                  </div>
                )}
              </div>

              {/* Patch preview */}
              <div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-[#58a6ff] hover:underline"
                >
                  {showPreview ? 'Hide' : 'Preview'} patch file
                </button>
                {showPreview && (
                  <div className="mt-2 max-h-32 overflow-y-auto px-3 py-2 bg-[#0d1117] border border-[#21262d] rounded-md">
                    <pre className="text-[10px] text-[#8b949e] font-mono whitespace-pre-wrap">
                      {patches
                        .slice(0, 3)
                        .map((p) => `## Fix: ${p.ruleId}\nFile: ${p.filePath ?? 'unknown'}`)
                        .join('\n\n')}
                      {patches.length > 3 && `\n\n...and ${patches.length - 3} more fixes`}
                    </pre>
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[#1f6feb]/5 border border-[#1f6feb]/15 rounded-md">
                <Info className="w-3.5 h-3.5 text-[#58a6ff] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#8b949e] leading-relaxed">
                  A file will be committed to{' '}
                  <span className="font-mono text-[#e6edf3]">
                    .github/cicd-reliability/patches.md
                  </span>{' '}
                  on the{' '}
                  <span className="font-mono text-[#e6edf3]">{selectedBranch}</span>{' '}
                  branch. This does not modify any of your existing files.
                </p>
              </div>

              {/* Error */}
              {pushPatchState === 'error' && pushPatchError && (
                <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-400">
                  {pushPatchError}
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  onClick={() => onOpenChange(false)}
                  className="h-8 px-4 text-xs font-medium text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePush}
                  disabled={pushPatchState === 'loading'}
                  className="flex items-center gap-1.5 h-8 px-4 text-xs font-medium text-white bg-[#1f6feb] hover:bg-[#388bfd] rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {pushPatchState === 'loading' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Pushing…
                    </>
                  ) : (
                    'Push patch file'
                  )}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

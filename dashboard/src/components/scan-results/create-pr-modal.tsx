'use client'

import * as Dialog from '@radix-ui/react-dialog'
import {
  X,
  GitPullRequestArrow,
  Loader2,
  CheckCircle2,
  ExternalLink,
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

interface CreatePRModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scanId: string
  repoId: string
  repoOwner: string
  repoName: string
  defaultBranch: string
  patches: AIPatch[]
}

export function CreatePRModal({
  open,
  onOpenChange,
  scanId,
  repoId,
  repoOwner,
  repoName,
  defaultBranch,
  patches,
}: CreatePRModalProps) {
  const { createPR, createPRState, createPRResult, createPRError, resetCreatePR } =
    useScanActions(scanId, repoId)

  const [baseBranch, setBaseBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [prTitle, setPrTitle] = useState(
    `fix: CI/CD reliability improvements (${patches.length} fixes)`
  )
  const [selectedPatchIds, setSelectedPatchIds] = useState<Set<string>>(
    new Set(patches.map((p) => p.id))
  )
  const [showDescription, setShowDescription] = useState(false)

  useEffect(() => {
    if (open) {
      setBaseBranch(defaultBranch)
      setPrTitle(`fix: CI/CD reliability improvements (${patches.length} fixes)`)
      setSelectedPatchIds(new Set(patches.map((p) => p.id)))
      resetCreatePR()
      githubReposApi
        .getBranches(repoOwner, repoName)
        .then((r) => setBranches(r.branches))
        .catch(() => setBranches([{ name: defaultBranch, protected: false }]))
    }
  }, [open, defaultBranch, patches, repoOwner, repoName, resetCreatePR])

  const handleCreate = async () => {
    try {
      await createPR(baseBranch, Array.from(selectedPatchIds))
    } catch {
      // Error handled by hook
    }
  }

  const togglePatch = (id: string) => {
    setSelectedPatchIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => setSelectedPatchIds(new Set(patches.map((p) => p.id)))
  const deselectAll = () => setSelectedPatchIds(new Set())

  const newBranchName = `cicd-reliability/fixes-${scanId.slice(0, 8)}`

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[520px] max-h-[85vh] bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl animate-slide-in overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#3fb950]/10 border border-[#3fb950]/20 flex items-center justify-center">
                <GitPullRequestArrow className="w-4 h-4 text-[#3fb950]" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-semibold text-[#e6edf3]">
                  Create pull request
                </Dialog.Title>
                <p className="text-xs text-[#8b949e]">
                  Open a PR with all fixes applied
                </p>
              </div>
            </div>
            <Dialog.Close className="text-[#8b949e] hover:text-[#e6edf3] p-1 rounded-md hover:bg-white/[0.06] transition-colors">
              <X className="w-4 h-4" />
            </Dialog.Close>
          </div>

          {createPRState === 'success' && createPRResult ? (
            /* Success state */
            <div className="px-5 pb-6 pt-4 flex flex-col items-center text-center">
              <CheckCircle2 className="w-12 h-12 text-[#3fb950] mb-4" />
              <p className="text-sm font-semibold text-[#e6edf3] mb-1">
                Pull request created!
              </p>
              <div className="px-3 py-1.5 bg-[#0d1117] border border-[#21262d] rounded-md mb-5">
                <span className="text-xs font-mono text-[#8b949e]">
                  {createPRResult.prTitle}
                </span>
              </div>
              <div className="flex gap-3">
                <a
                  href={createPRResult.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 h-9 px-5 text-xs font-medium text-white bg-[#3fb950] hover:bg-[#46d160] rounded-md transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View pull request
                </a>
                <button
                  onClick={() => onOpenChange(false)}
                  className="h-9 px-4 text-xs font-medium text-[#8b949e] hover:text-[#e6edf3] border border-[#30363d] rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Form state */
            <div className="px-5 pb-5 space-y-4">
              {/* PR title */}
              <div className="bg-[#0d1117] border border-[#30363d] rounded-md p-3.5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">
                    PR title
                  </label>
                  <input
                    type="text"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    className="w-full h-8 px-3 bg-[#010409] border border-[#30363d] rounded-md text-xs text-[#e6edf3] focus:outline-none focus:border-[#1f6feb] transition-colors"
                  />
                </div>

                <button
                  onClick={() => setShowDescription(!showDescription)}
                  className="text-xs text-[#58a6ff] hover:underline"
                >
                  {showDescription ? 'Hide' : 'Show'} full description
                </button>
                {showDescription && (
                  <pre className="max-h-24 overflow-y-auto text-[10px] text-[#8b949e] font-mono whitespace-pre-wrap px-2 py-1.5 bg-[#010409] border border-[#21262d] rounded">
                    {`## CI/CD Reliability Fixes\n\nThis PR was automatically generated.\n\n### Fixes included\n${patches.map((p, i) => `${i + 1}. ${p.ruleId} — ${p.filePath ?? 'unknown'}`).join('\n')}`}
                  </pre>
                )}
              </div>

              {/* Base branch */}
              <div>
                <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">
                  Merge into
                </label>
                <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                  <span className="font-mono">
                    {repoOwner}/{repoName}
                  </span>
                  <span>←</span>
                  <div className="relative flex-1">
                    <select
                      value={baseBranch}
                      onChange={(e) => setBaseBranch(e.target.value)}
                      className="w-full h-8 px-3 pr-7 bg-[#010409] border border-[#30363d] rounded-md text-xs text-[#e6edf3] focus:outline-none focus:border-[#1f6feb] appearance-none cursor-pointer"
                    >
                      {branches.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#8b949e] pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* New branch name */}
              <div>
                <label className="block text-xs font-medium text-[#e6edf3] mb-1.5">
                  From branch (auto-generated)
                </label>
                <div className="h-8 px-3 bg-[#0d1117] border border-[#21262d] rounded-md flex items-center">
                  <span className="text-xs font-mono text-[#8b949e]">
                    {newBranchName}
                  </span>
                </div>
                <p className="text-[11px] text-[#6e7681] mt-1">
                  This branch will be created automatically
                </p>
              </div>

              {/* Patches included */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#e6edf3]">
                    Fixes included ({selectedPatchIds.size})
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-[11px] text-[#58a6ff] hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      onClick={deselectAll}
                      className="text-[11px] text-[#58a6ff] hover:underline"
                    >
                      Deselect all
                    </button>
                  </div>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {patches.map((patch) => (
                    <label
                      key={patch.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPatchIds.has(patch.id)}
                        onChange={() => togglePatch(patch.id)}
                        className="rounded bg-[#010409] border-[#30363d] text-[#1f6feb] focus:ring-[#1f6feb] focus:ring-offset-0 w-3.5 h-3.5"
                      />
                      <span className="text-xs text-[#e6edf3] truncate">
                        {patch.ruleId ?? 'fix'}
                      </span>
                      <span className="text-[11px] text-[#6e7681] truncate">
                        ({patch.filePath ?? 'unknown'})
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Info box */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[#3fb950]/5 border border-[#3fb950]/15 rounded-md">
                <Info className="w-3.5 h-3.5 text-[#3fb950] flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-[#8b949e] leading-relaxed">
                  A new branch will be created and a PR will be opened against{' '}
                  <span className="font-mono text-[#e6edf3]">{baseBranch}</span>.
                  None of your files are changed until you merge the PR.
                </p>
              </div>

              {/* Error */}
              {createPRState === 'error' && createPRError && (
                <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-400">
                  {createPRError}
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
                  onClick={handleCreate}
                  disabled={
                    createPRState === 'loading' || selectedPatchIds.size === 0
                  }
                  className="flex items-center gap-1.5 h-8 px-4 text-xs font-medium text-white bg-[#3fb950] hover:bg-[#46d160] rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {createPRState === 'loading' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    'Create pull request'
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

'use client'

import React, { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X,
  GitPullRequest,
  GitBranch,
  FileCode,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import type { ApplyFixesResult, ApplyFixesRequest } from '@/lib/types'
import clsx from 'clsx'

const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" className={className}>
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
)

export interface ManualFixInstruction {
  ruleId: string
  filePath: string
  title: string
  severity: string
  currentCode?: string
  guidance: string
}

export interface AutoFixFile {
  filePath: string
  appliedPatchRuleIds: string[]
  manualFixes: ManualFixInstruction[]
}

export interface ApplyFixesModalProps {
  scanId: string
  repoId: string
  repoName: string
  branch: string
  defaultBranch: string
  autoFixFiles: AutoFixFile[]
  manualFixes: ManualFixInstruction[]
  onClose: () => void
  onSuccess: (result: ApplyFixesResult) => void
}

type ModalPhase = 'confirm' | 'applying' | 'success' | 'error'

export function ApplyFixesModal({
  scanId,
  repoId,
  repoName,
  branch,
  defaultBranch,
  autoFixFiles,
  manualFixes,
  onClose,
  onSuccess
}: ApplyFixesModalProps) {
  const [phase, setPhase] = useState<ModalPhase>('confirm')
  const [branchChoice, setBranchChoice] = useState<'new' | 'existing'>('new')
  const [customBranch, setCustomBranch] = useState(
    `cicd-reliability/fixes-${scanId.slice(0, 8)}`
  )
  const [createPR, setCreatePR] = useState(true)
  const [prTitle, setPrTitle] = useState(
    `fix: CI/CD reliability improvements (${autoFixFiles.length} file${
      autoFixFiles.length === 1 ? '' : 's'
    } fixed)`
  )
  const [result, setResult] = useState<ApplyFixesResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<string[]>(
    autoFixFiles.map(f => f.filePath)
  )
  const [isManualListOpen, setIsManualListOpen] = useState(false)
  const [isSkippedListOpen, setIsSkippedListOpen] = useState(false)

  // Applying progress steps
  const [step1, setStep1] = useState<'pending' | 'running' | 'done'>('pending')
  const [step2, setStep2] = useState<'pending' | 'running' | 'done'>('pending')
  const [step3, setStep3] = useState<'pending' | 'running' | 'done'>('pending')
  const [step4, setStep4] = useState<'pending' | 'running' | 'done'>('pending')

  useEffect(() => {
    if (phase !== 'applying') return

    setStep1('running')
    const t1 = setTimeout(() => {
      setStep1('done')
      setStep2('running')
    }, 600)

    const t2 = setTimeout(() => {
      setStep2('done')
      setStep3('running')
    }, 1600)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [phase])

  const handleApply = async () => {
    setPhase('applying')
    setError(null)
    setErrorCode(null)

    try {
      const payload: ApplyFixesRequest = {
        branch: branchChoice === 'new' ? customBranch : branch,
        createPR,
        prTitle: createPR ? prTitle : undefined,
        targetBranch: defaultBranch,
        selectedFileIds: selectedFiles
      }

      const res = await apiClient.applyFixes(repoId, scanId, payload)
      
      setStep3('done')
      if (createPR) {
        setStep4('running')
      }
      
      setTimeout(() => {
        setStep4('done')
        setResult(res)
        setPhase('success')
      }, 800)

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
      
      if (err.code) {
        setErrorCode(err.code)
      } else if (err.message?.includes('NO_GITHUB_TOKEN') || err.message?.includes('authentication required')) {
        setErrorCode('NO_GITHUB_TOKEN')
      } else if (err.message?.includes('NO_AUTO_FIXES')) {
        setErrorCode('NO_AUTO_FIXES')
      } else if (err.message?.includes('COMMIT_FAILED')) {
        setErrorCode('COMMIT_FAILED')
      } else {
        setErrorCode(err.status === 422 ? 'NO_GITHUB_TOKEN' : 'GENERIC')
      }
      
      setPhase('error')
    }
  }

  const handleSelectAll = () => {
    setSelectedFiles(autoFixFiles.map(f => f.filePath))
  }

  const handleSelectNone = () => {
    setSelectedFiles([])
  }

  const toggleFile = (filePath: string) => {
    if (selectedFiles.includes(filePath)) {
      setSelectedFiles(selectedFiles.filter(p => p !== filePath))
    } else {
      setSelectedFiles([...selectedFiles, filePath])
    }
  }

  const isMainBranch = branch === 'main' || branch === 'master'

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-canvas/80 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl w-full max-w-[520px] p-6 z-50 overflow-hidden animate-slide-in text-fg"
        >
          {/* HEADER */}
          <div className="flex justify-between items-start mb-6">
            <div className="flex gap-3 items-center">
              <div className="p-2 rounded-lg bg-success/10 border border-success/20 text-success">
                <GitPullRequest className="w-5 h-5" style={{ color: '#3fb950' }} />
              </div>
              <div>
                <Dialog.Title className="text-base font-semibold text-white">
                  Apply reliability fixes
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Select and apply automated reliability fixes to the repository.
                </Dialog.Description>
                <p className="text-xs text-fg-muted">
                  Commits fixed files to GitHub and optionally opens a PR
                </p>
              </div>
            </div>
            {phase !== 'applying' && (
              <Dialog.Close className="text-fg-muted hover:text-fg transition-colors">
                <X className="w-5 h-5" />
              </Dialog.Close>
            )}
          </div>

          {/* PHASE: CONFIRM */}
          {phase === 'confirm' && (
            <div className="space-y-5">
              {/* Repo info */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-canvas-inset border border-border">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <GithubIcon className="w-4 h-4 text-fg-muted" />
                  <span>{repoName}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-fg-muted bg-canvas border border-border px-2 py-0.5 rounded-full">
                  <GitBranch className="w-3 h-3" />
                  <span>{branch}</span>
                </div>
              </div>

              {/* Files to change */}
              {autoFixFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    <span>Files to change ({selectedFiles.length})</span>
                    <div className="flex gap-2 font-normal lowercase tracking-normal">
                      <button onClick={handleSelectAll} className="text-accent hover:underline">
                        select all
                      </button>
                      <span className="text-border">|</span>
                      <button onClick={handleSelectNone} className="text-accent hover:underline">
                        deselect all
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[160px] overflow-y-auto border border-border rounded-lg bg-canvas-inset divide-y divide-border">
                    {autoFixFiles.map(file => {
                      const isSelected = selectedFiles.includes(file.filePath)
                      return (
                        <div
                          key={file.filePath}
                          onClick={() => toggleFile(file.filePath)}
                          className="flex items-start gap-3 p-2.5 hover:bg-canvas-subtle/50 cursor-pointer select-none transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 rounded border-border text-accent focus:ring-accent bg-canvas"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <FileCode className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                              <span className="font-mono text-xs text-white truncate">
                                {file.filePath}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {file.appliedPatchRuleIds.map(ruleId => (
                                <span
                                  key={ruleId}
                                  className="text-[9px] bg-canvas border border-border text-fg-muted px-1.5 py-0.5 rounded"
                                >
                                  {ruleId}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Commit destination settings */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  Commit to
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setBranchChoice('new')}
                    className={clsx(
                      'flex flex-col items-start p-3 border rounded-lg text-left transition-all',
                      branchChoice === 'new'
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-canvas-inset hover:border-fg-muted'
                    )}
                  >
                    <span className="text-xs font-medium text-white">New branch</span>
                    <span className="text-[10px] text-fg-muted mt-0.5">
                      Create branch & apply fixes
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBranchChoice('existing')}
                    className={clsx(
                      'flex flex-col items-start p-3 border rounded-lg text-left transition-all',
                      branchChoice === 'existing'
                        ? 'border-accent bg-accent/5'
                        : 'border-border bg-canvas-inset hover:border-fg-muted'
                    )}
                  >
                    <span className="text-xs font-medium text-white">Current branch</span>
                    <span className="text-[10px] text-fg-muted mt-0.5">
                      Commit directly to {branch}
                    </span>
                  </button>
                </div>

                {branchChoice === 'new' && (
                  <input
                    type="text"
                    value={customBranch}
                    onChange={(e) => setCustomBranch(e.target.value)}
                    className="block w-full px-3 py-2 bg-canvas-inset border border-border rounded-md text-xs text-fg font-mono focus:outline-none focus:border-accent"
                  />
                )}

                {branchChoice === 'existing' && isMainBranch && (
                  <div className="p-3 rounded-lg border border-warning/20 bg-warning/5 text-warning text-xs">
                    ⚠️ You are committing directly to <strong>{branch}</strong>. We recommend using a new branch instead to safely review the changes.
                  </div>
                )}
              </div>

              {/* PR Toggle option */}
              <div className="p-4 rounded-lg bg-canvas-inset border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-white">
                      Create pull request
                    </span>
                    <p className="text-[10px] text-fg-muted">
                      Opens a PR from the fix branch into {defaultBranch}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={createPR}
                    onChange={(e) => setCreatePR(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent bg-canvas"
                  />
                </div>

                {createPR && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-fg-muted">PR Title</label>
                    <input
                      type="text"
                      value={prTitle}
                      onChange={(e) => setPrTitle(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-canvas border border-border rounded-md text-xs text-fg focus:outline-none focus:border-accent"
                    />
                  </div>
                )}
              </div>

              {/* Manual fixes notice */}
              {manualFixes.length > 0 && (
                <div className="p-3 rounded-lg border border-warning/20 bg-warning/5 text-warning">
                  <div
                    onClick={() => setIsManualListOpen(!isManualListOpen)}
                    className="flex justify-between items-center cursor-pointer select-none"
                  >
                    <span className="text-xs font-medium">
                      ⚠️ {manualFixes.length} fix{manualFixes.length === 1 ? '' : 'es'} require manual review
                    </span>
                    {isManualListOpen ? (
                      <ChevronUp className="w-4 h-4 text-warning" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-warning" />
                    )}
                  </div>
                  <p className="text-[10px] text-warning/80 mt-1 leading-relaxed">
                    These cannot be applied automatically and will be listed in the PR description for you to resolve.
                  </p>
                  {isManualListOpen && (
                    <div className="mt-2.5 max-h-[100px] overflow-y-auto font-mono text-[9px] border border-warning/10 bg-canvas/30 p-2 rounded divide-y divide-warning/10 space-y-1">
                      {manualFixes.map((f, i) => (
                        <div key={i} className="pt-1 first:pt-0">
                          {f.filePath} : {f.ruleId}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FOOTER */}
              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-fg-muted hover:text-fg bg-canvas hover:bg-canvas-subtle border border-border rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={selectedFiles.length === 0}
                  className={clsx(
                    'px-4 py-2 text-xs font-semibold text-white rounded-md transition-colors',
                    selectedFiles.length === 0
                      ? 'bg-success/50 cursor-not-allowed'
                      : 'bg-success hover:bg-success-hover'
                  )}
                  style={selectedFiles.length > 0 ? { backgroundColor: '#238636' } : {}}
                >
                  Apply {selectedFiles.length} fix{selectedFiles.length === 1 ? '' : 'es'}
                </button>
              </div>
            </div>
          )}

          {/* PHASE: APPLYING */}
          {phase === 'applying' && (
            <div className="flex flex-col items-center py-10 space-y-6">
              <Loader2 className="w-10 h-10 text-success animate-spin" style={{ color: '#3fb950' }} />
              <div className="text-center space-y-1">
                <h3 className="text-sm font-semibold text-white">Applying fixes...</h3>
                <p className="text-xs text-fg-muted">Please keep this window open</p>
              </div>

              {/* Timeline steps */}
              <div className="w-full max-w-[280px] space-y-3 pt-4 text-xs font-medium">
                <div className="flex items-center gap-3">
                  {step1 === 'done' ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : step1 === 'running' ? (
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-border" />
                  )}
                  <span className={step1 === 'done' ? 'text-fg' : 'text-fg-muted'}>
                    Loading scan results
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {step2 === 'done' ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : step2 === 'running' ? (
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-border" />
                  )}
                  <span className={step2 === 'done' ? 'text-fg' : 'text-fg-muted'}>
                    Fetching original files
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {step3 === 'done' ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : step3 === 'running' ? (
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-border" />
                  )}
                  <span className={step3 === 'done' ? 'text-fg' : 'text-fg-muted'}>
                    Committing fixed files
                  </span>
                </div>

                {createPR && (
                  <div className="flex items-center gap-3">
                    {step4 === 'done' ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : step4 === 'running' ? (
                      <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-border" />
                    )}
                    <span className={step4 === 'done' ? 'text-fg' : 'text-fg-muted'}>
                      Creating pull request
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PHASE: SUCCESS */}
          {phase === 'success' && result && (
            <div className="space-y-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-success/15 border border-success/30 flex items-center justify-center text-success">
                <Check className="w-6 h-6 animate-scale-up" style={{ color: '#3fb950' }} />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">Fixes applied successfully!</h3>
                <p className="text-xs text-fg-muted">
                  {result.committedFiles.length} file{result.committedFiles.length === 1 ? '' : 's'} committed to branch <span className="font-mono text-white bg-canvas-inset border border-border px-1.5 py-0.5 rounded text-[10px]">{result.branch}</span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2.5 pt-3 max-w-[280px] mx-auto">
                {result.pr && (
                  <a
                    href={result.pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 h-10 px-4 rounded-md text-xs font-semibold text-white select-none"
                    style={{ backgroundColor: '#238636' }}
                  >
                    <GitPullRequest className="w-4 h-4" />
                    <span>View pull request</span>
                  </a>
                )}
                <a
                  href={`https://github.com/${repoName}/tree/${result.branch}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 h-10 px-4 rounded-md text-xs font-semibold text-fg hover:text-white bg-canvas hover:bg-canvas-subtle border border-border select-none"
                >
                  <span>View on GitHub</span>
                </a>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 bg-canvas-inset border border-border p-3 rounded-lg text-center text-xs">
                <div>
                  <div className="text-white font-bold">{result.stats.filesCommitted}</div>
                  <div className="text-fg-muted text-[10px]">files fixed</div>
                </div>
                <div>
                  <div className="text-white font-bold">{result.stats.filesSkipped}</div>
                  <div className="text-fg-muted text-[10px]">files skipped</div>
                </div>
                <div>
                  <div className="text-white font-bold">{result.stats.manualFixCount}</div>
                  <div className="text-fg-muted text-[10px]">need manual review</div>
                </div>
              </div>

              {/* Skipped files details */}
              {result.skippedFiles.length > 0 && (
                <div className="text-left border border-warning/20 bg-warning/5 rounded-lg p-3">
                  <div
                    onClick={() => setIsSkippedListOpen(!isSkippedListOpen)}
                    className="flex justify-between items-center text-xs font-semibold text-warning cursor-pointer select-none"
                  >
                    <span>⚠️ {result.skippedFiles.length} file{result.skippedFiles.length === 1 ? '' : 's'} could not be committed</span>
                    {isSkippedListOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                  {isSkippedListOpen && (
                    <div className="mt-2 divide-y divide-warning/10 max-h-[100px] overflow-y-auto text-[10px] font-mono text-warning/90 space-y-1">
                      {result.skippedFiles.map((s, i) => (
                        <div key={i} className="pt-1.5 first:pt-0">
                          <div className="text-white truncate">{s.filePath}</div>
                          <div className="text-fg-muted text-[9px] mt-0.5">{s.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Manual review notice */}
              {result.stats.manualFixCount > 0 && (
                <div className="text-left p-3 border border-warning/20 bg-warning/5 rounded-lg text-warning text-xs space-y-1">
                  <div className="font-semibold">These fixes still need your attention:</div>
                  <p className="text-[10px] text-warning/80 leading-relaxed">
                    Refer to the PR description or scan findings dashboard to resolve these manually.
                  </p>
                </div>
              )}

              {/* FOOTER */}
              <div className="flex justify-end pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onSuccess(result)
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-canvas hover:bg-canvas-subtle border border-border rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* PHASE: ERROR */}
          {phase === 'error' && (
            <div className="space-y-5 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-danger/15 border border-danger/30 flex items-center justify-center text-danger">
                <AlertCircle className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">Could not apply fixes</h3>
                <p className="text-xs text-danger-hover leading-relaxed max-w-[320px] mx-auto">
                  {error}
                </p>
              </div>

              {/* Specific CTA boxes based on errorCode */}
              {errorCode === 'NO_GITHUB_TOKEN' && (
                <div className="p-4 bg-canvas-inset border border-border rounded-lg max-w-[340px] mx-auto space-y-3">
                  <p className="text-xs text-fg-muted leading-relaxed">
                    You need to authorize the platform to write commits and open pull requests on your behalf.
                  </p>
                  <a
                    href="/settings/integrations"
                    className="inline-flex items-center justify-center h-8 px-4 rounded bg-accent hover:bg-accent-hover text-xs font-semibold text-white"
                  >
                    Connect GitHub →
                  </a>
                </div>
              )}

              {errorCode === 'NO_AUTO_FIXES' && (
                <div className="p-4 bg-canvas-inset border border-border rounded-lg max-w-[340px] mx-auto text-xs text-fg-muted">
                  All security and reliability issues detected require your manual review. You can copy the code guidance directly from the findings view.
                </div>
              )}

              {/* FOOTER */}
              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setPhase('confirm')
                    setError(null)
                    setErrorCode(null)
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-canvas hover:bg-canvas-subtle border border-border rounded-md transition-colors"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-fg-muted hover:text-fg bg-canvas hover:bg-canvas-subtle border border-border rounded-md transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

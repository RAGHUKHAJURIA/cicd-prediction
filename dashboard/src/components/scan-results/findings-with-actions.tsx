'use client'

import { Sparkles, GitCommitHorizontal, GitPullRequestArrow } from 'lucide-react'
import { useState } from 'react'
import { CopySnippetButton } from './copy-snippet-button'
import { PushPatchModal } from './push-patch-modal'
import { CreatePRModal } from './create-pr-modal'

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

interface FindingsWithActionsProps {
  scanId: string
  repoId: string
  patches: AIPatch[]
  repoOwner: string
  repoName: string
  defaultBranch: string
}

export function FindingsWithActions({
  scanId,
  repoId,
  patches,
  repoOwner,
  repoName,
  defaultBranch,
}: FindingsWithActionsProps) {
  const [pushPatchOpen, setPushPatchOpen] = useState(false)
  const [createPROpen, setCreatePROpen] = useState(false)

  const validatedPatches = patches.filter((p) => p.beforeCode && p.afterCode)

  if (validatedPatches.length === 0) return null

  // Unique files being fixed
  const fixedFiles = Array.from(
    new Set(validatedPatches.map((p) => p.filePath ?? '').filter(Boolean))
  )

  return (
    <>
      <div className="mt-4 bg-[#161b22] border border-[#30363d] rounded-lg p-4 animate-fade-in">
        {/* Header row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#a371f7]" />
            <span className="text-[13px] font-medium text-[#e6edf3]">
              AI-generated fixes available
            </span>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium text-[#3fb950] bg-[#3fb950]/10 border border-[#3fb950]/30 rounded-full">
            {validatedPatches.length} patches validated
          </span>
        </div>

        {/* Patch summary */}
        {fixedFiles.length > 0 && (
          <p className="text-xs text-[#8b949e] mb-3.5">
            Fixes:{' '}
            {fixedFiles
              .slice(0, 3)
              .map((f) => {
                const parts = f.split('/')
                return parts[parts.length - 1]
              })
              .join(', ')}
            {fixedFiles.length > 3 && `, +${fixedFiles.length - 3} more`}
          </p>
        )}

        {/* Three buttons */}
        <div className="flex gap-2.5 flex-wrap">
          {/* Copy button */}
          <CopySnippetButton patches={validatedPatches} />

          {/* Push patch button */}
          <button
            onClick={() => setPushPatchOpen(true)}
            className="flex items-center gap-2 h-9 px-4 text-[13px] font-medium rounded-md border transition-colors bg-[#1f6feb]/10 border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/20 hover:border-[#1f6feb]/50"
          >
            <GitCommitHorizontal className="w-3.5 h-3.5" />
            Push patch file
          </button>

          {/* Create PR button */}
          <button
            onClick={() => setCreatePROpen(true)}
            className="flex items-center gap-2 h-9 px-4 text-[13px] font-medium rounded-md border transition-colors bg-[#3fb950]/10 border-[#3fb950]/30 text-[#3fb950] hover:bg-[#3fb950]/20 hover:border-[#3fb950]/50"
          >
            <GitPullRequestArrow className="w-3.5 h-3.5" />
            Create pull request
          </button>
        </div>
      </div>

      {/* Modals */}
      <PushPatchModal
        open={pushPatchOpen}
        onOpenChange={setPushPatchOpen}
        scanId={scanId}
        repoId={repoId}
        repoOwner={repoOwner}
        repoName={repoName}
        defaultBranch={defaultBranch}
        patches={validatedPatches}
      />
      <CreatePRModal
        open={createPROpen}
        onOpenChange={setCreatePROpen}
        scanId={scanId}
        repoId={repoId}
        repoOwner={repoOwner}
        repoName={repoName}
        defaultBranch={defaultBranch}
        patches={validatedPatches}
      />
    </>
  )
}

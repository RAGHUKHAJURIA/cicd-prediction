'use client'

import { ReactNode } from 'react'
import { FindingsWithActions } from './findings-with-actions'
import { useAuth } from '@/lib/hooks/use-auth'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface AIPatch {
  id: string
  ruleId: string | null
  title: string
  beforeCode: string | null
  afterCode: string | null
  language: string | null
  instructions: string | null
  filePath?: string
  safe?: boolean | null
}

interface ScanResultsShellProps {
  children: ReactNode
  scanId: string
  repoId: string
  repoOwner: string
  repoName: string
  defaultBranch: string
  patches?: AIPatch[]
}

export function ScanResultsShell({
  children,
  scanId,
  repoId,
  repoOwner,
  repoName,
  defaultBranch,
  patches = [],
}: ScanResultsShellProps) {
  const { user, isAuthenticated } = useAuth()
  const hasGithub = !!user?.githubUsername
  const validatedPatches = patches.filter((p) => p.safe === true)

  return (
    <div>
      {children}

      {isAuthenticated && hasGithub && validatedPatches.length > 0 && (
        <FindingsWithActions
          scanId={scanId}
          repoId={repoId}
          patches={validatedPatches}
          repoOwner={repoOwner}
          repoName={repoName}
          defaultBranch={defaultBranch}
        />
      )}

      {isAuthenticated && !hasGithub && validatedPatches.length > 0 && (
        <div className="mt-4 bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex items-center justify-between">
          <p className="text-xs text-[#8b949e]">
            Connect your GitHub account to push fixes directly to your repo
          </p>
          <Link
            href="/settings"
            className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium text-[#58a6ff] border border-[#1f6feb]/30 rounded-md hover:bg-[#1f6feb]/10 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Connect GitHub
          </Link>
        </div>
      )}
    </div>
  )
}

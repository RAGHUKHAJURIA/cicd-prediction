'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { X, GitBranch, ChevronDown, Loader2 } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useSWRConfig } from 'swr'
import { useRouter } from 'next/navigation'
import { useGithubRepos } from '@/lib/hooks/use-github-repos'
import { githubReposApi, GitHubBranch } from '@/lib/github-repos-api'
import { RepoSearchInput } from './repo-search-input'
import { GitHubRepoCard } from './github-repo-card'
import { ImportProgress } from './import-progress'
import clsx from 'clsx'

interface ImportRepoModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FilterTab = 'all' | 'public' | 'private'

export function ImportRepoModal({ open, onOpenChange }: ImportRepoModalProps) {
  const router = useRouter()
  const { mutate: globalMutate } = useSWRConfig()

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [importingRepoId, setImportingRepoId] = useState<number | null>(null)
  const [importedRepoIds, setImportedRepoIds] = useState<Set<number>>(new Set())
  const [importProgress, setImportProgress] = useState<{
    repoName: string
    status: 'importing' | 'scanning'
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Branch selection state
  const [expandedRepoId, setExpandedRepoId] = useState<number | null>(null)
  const [branches, setBranches] = useState<GitHubBranch[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('')
  const [loadingBranches, setLoadingBranches] = useState(false)

  const { repos, isLoading, error: reposError, hasMore, loadMore } = useGithubRepos({
    search,
    type: activeTab === 'all' ? undefined : activeTab,
    sort: 'updated',
  })

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setSearch('')
        setActiveTab('all')
        setImportingRepoId(null)
        setImportProgress(null)
        setError(null)
        setExpandedRepoId(null)
        setBranches([])
        setSelectedBranch('')
      }, 300)
    }
  }, [open])

  const handleImportClick = useCallback(
    async (repoId: number, owner: string, repo: string, defaultBranch: string) => {
      // If already expanded for this repo, start import
      if (expandedRepoId === repoId) {
        return
      }

      // Expand to show branch selection
      setExpandedRepoId(repoId)
      setSelectedBranch(defaultBranch)
      setLoadingBranches(true)
      setError(null)

      try {
        const result = await githubReposApi.getBranches(owner, repo)
        setBranches(result.branches)
      } catch {
        setBranches([{ name: defaultBranch, protected: false }])
      } finally {
        setLoadingBranches(false)
      }
    },
    [expandedRepoId]
  )

  const handleStartImport = useCallback(
    async (owner: string, repo: string) => {
      const repoFullName = `${owner}/${repo}`
      setImportingRepoId(expandedRepoId)
      setImportProgress({ repoName: repoFullName, status: 'importing' })
      setError(null)

      try {
        const result = await githubReposApi.importRepo({
          owner,
          repo,
          branch: selectedBranch,
          autoScanOnPush: false,
        })

        setImportProgress({ repoName: repoFullName, status: 'scanning' })

        // Brief delay to show scanning status
        await new Promise((r) => setTimeout(r, 800))

        if (expandedRepoId !== null) {
          setImportedRepoIds((prev) => new Set(prev).add(expandedRepoId))
        }
        setImportProgress(null)
        setExpandedRepoId(null)
        setImportingRepoId(null)

        // Refresh repos list
        globalMutate('repos')

        // Close modal and navigate if new
        if (result.isNew && result.repo?.id) {
          onOpenChange(false)
          router.push(`/repos/${result.repo.id}`)
        }
      } catch (err) {
        setImportProgress(null)
        setImportingRepoId(null)
        setError(err instanceof Error ? err.message : 'Failed to import repository')
      }
    },
    [expandedRepoId, selectedBranch, globalMutate, onOpenChange, router]
  )

  const tabs: { label: string; value: FilterTab }[] = [
    { label: 'All', value: 'all' },
    { label: 'Public', value: 'public' },
    { label: 'Private', value: 'private' },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-[640px] h-[80vh] bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl flex flex-col animate-slide-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
            <div>
              <Dialog.Title className="text-base font-semibold text-[#e6edf3]">
                Import Git Repository
              </Dialog.Title>
              <p className="text-xs text-[#8b949e] mt-0.5">
                Select a repository to import and scan
              </p>
            </div>
            <Dialog.Close className="text-[#8b949e] hover:text-[#e6edf3] transition-colors p-1 rounded-md hover:bg-white/[0.06]">
              <X className="w-5 h-5" />
            </Dialog.Close>
          </div>

          {importProgress ? (
            <ImportProgress
              repoName={importProgress.repoName}
              status={importProgress.status}
            />
          ) : (
            <>
              {/* Search bar (sticky) */}
              <div className="px-5 pb-3 flex-shrink-0">
                <RepoSearchInput value={search} onChange={setSearch} />
              </div>

              {/* Filter tabs */}
              <div className="flex gap-0 px-5 pb-0 border-b border-[#21262d] flex-shrink-0">
                {tabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={clsx(
                      'px-4 py-2 text-xs font-medium transition-colors relative',
                      activeTab === tab.value
                        ? 'text-[#e6edf3]'
                        : 'text-[#8b949e] hover:text-[#c9d1d9]'
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.value && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1f6feb] rounded-full" />
                    )}
                  </button>
                ))}
              </div>

              {/* Error banner */}
              {(error || reposError) && (
                <div className="mx-5 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-md text-xs text-red-400">
                  {error || reposError}
                </div>
              )}

              {/* Repo list (scrollable) */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {isLoading ? (
                  // Skeleton loading
                  <div className="space-y-0">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-3 border-b border-[#21262d]"
                      >
                        <div className="w-6 h-6 rounded-full bg-[#21262d] animate-pulse" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-48 bg-[#21262d] rounded animate-pulse" />
                          <div className="h-2.5 w-32 bg-[#21262d] rounded animate-pulse" />
                        </div>
                        <div className="h-7 w-16 bg-[#21262d] rounded-md animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : repos.length === 0 ? (
                  // Empty state
                  <div className="flex flex-col items-center justify-center py-16 text-center px-5">
                    <GitBranch className="w-8 h-8 text-[#6e7681] mb-3" />
                    <p className="text-sm text-[#8b949e]">
                      {search
                        ? `No results for "${search}"`
                        : 'No repositories found'}
                    </p>
                  </div>
                ) : (
                  <div>
                    {repos.map((repo) => (
                      <div key={repo.id}>
                        <GitHubRepoCard
                          repo={repo}
                          isImported={importedRepoIds.has(repo.id)}
                          isImporting={importingRepoId === repo.id}
                          importSuccess={importedRepoIds.has(repo.id)}
                          onImport={() =>
                            handleImportClick(
                              repo.id,
                              repo.owner.login,
                              repo.name,
                              repo.default_branch
                            )
                          }
                          onView={() => {
                            onOpenChange(false)
                          }}
                        />
                        {/* Branch selection expansion */}
                        {expandedRepoId === repo.id && !importingRepoId && (
                          <div className="px-5 py-3 bg-[#0d1117] border-b border-[#21262d] animate-fade-in">
                            <p className="text-xs font-medium text-[#e6edf3] mb-2">
                              Select branch to scan
                            </p>
                            <div className="flex items-center gap-3">
                              <div className="relative flex-1">
                                <GitBranch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8b949e]" />
                                {loadingBranches ? (
                                  <div className="h-8 pl-8 pr-3 bg-[#010409] border border-[#30363d] rounded-md flex items-center">
                                    <Loader2 className="w-3.5 h-3.5 text-[#8b949e] animate-spin" />
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <select
                                      value={selectedBranch}
                                      onChange={(e) =>
                                        setSelectedBranch(e.target.value)
                                      }
                                      className="w-full h-8 pl-8 pr-7 bg-[#010409] border border-[#30363d] rounded-md text-xs text-[#e6edf3] focus:outline-none focus:border-[#1f6feb] appearance-none cursor-pointer"
                                    >
                                      {branches.map((b) => (
                                        <option key={b.name} value={b.name}>
                                          {b.name}
                                          {b.protected ? ' (protected)' : ''}
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-[#8b949e] pointer-events-none" />
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() =>
                                  handleStartImport(
                                    repo.owner.login,
                                    repo.name
                                  )
                                }
                                disabled={loadingBranches}
                                className="h-8 px-4 text-xs font-medium text-white bg-[#1f6feb] hover:bg-[#388bfd] rounded-md transition-colors disabled:opacity-50"
                              >
                                Start import
                              </button>
                              <button
                                onClick={() => {
                                  setExpandedRepoId(null)
                                  setBranches([])
                                }}
                                className="h-8 px-3 text-xs text-[#8b949e] hover:text-[#e6edf3] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Load more */}
                    {hasMore && (
                      <div className="flex justify-center py-4">
                        <button
                          onClick={loadMore}
                          className="text-xs text-[#8b949e] hover:text-[#58a6ff] transition-colors"
                        >
                          Load more repositories
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

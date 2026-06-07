const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  description: string | null
  default_branch: string
  updated_at: string
  language: string | null
  stargazers_count: number
  html_url: string
  owner: { login: string; avatar_url: string }
}

export interface GitHubBranch {
  name: string
  protected: boolean
}

export interface ImportResult {
  repo: {
    id: string
    repoUrl: string
    name: string
    owner: string
    repoName: string
    defaultBranch: string
    status: string
  }
  scanId?: string
  isNew: boolean
}

export interface PushPatchResult {
  commitUrl: string
  commitSha: string
  patchFilePath: string
  patchesIncluded: number
}

export interface CreatePRResult {
  prUrl: string
  prNumber: number
  prTitle: string
  headBranch: string
}

export interface ValidateUrlResult {
  accessible: boolean
  owner: string
  repo: string
  private: boolean
  defaultBranch: string
  description: string | null
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function ghFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const body = await res.json()

  if (!res.ok) {
    const message = body?.error || body?.message || 'An error occurred'
    const err = new Error(message)
    ;(err as Error & { status: number }).status = res.status
    throw err
  }

  return body.data as T
}

// ─── API Client ───────────────────────────────────────────────────────────────

export const githubReposApi = {
  async listRepos(params?: {
    page?: number
    perPage?: number
    sort?: string
    type?: string
    search?: string
  }): Promise<{
    repos: GitHubRepo[]
    hasMore: boolean
    currentPage: number
    totalCount: number
  }> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.append('page', params.page.toString())
    if (params?.perPage)
      searchParams.append('perPage', params.perPage.toString())
    if (params?.sort) searchParams.append('sort', params.sort)
    if (params?.type) searchParams.append('type', params.type)
    if (params?.search) searchParams.append('search', params.search)

    const query = searchParams.toString()
    return ghFetch(`/api/github/repos${query ? `?${query}` : ''}`)
  },

  async validateUrl(url: string): Promise<ValidateUrlResult> {
    return ghFetch('/api/github/actions/validate-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    })
  },

  async importRepo(data: {
    owner: string
    repo: string
    branch: string
    autoScanOnPush: boolean
  }): Promise<ImportResult> {
    return ghFetch('/api/github/repos/import', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async getBranches(
    owner: string,
    repo: string
  ): Promise<{ branches: GitHubBranch[] }> {
    return ghFetch(`/api/github/repos/${owner}/${repo}/branches`)
  },

  async pushPatch(data: {
    repoId: string
    scanId: string
    branch: string
    patchIds?: string[]
  }): Promise<PushPatchResult> {
    return ghFetch('/api/github/actions/push-patch', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async createPR(data: {
    repoId: string
    scanId: string
    baseBranch: string
    patchIds?: string[]
  }): Promise<CreatePRResult> {
    return ghFetch('/api/github/actions/create-pr', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

/**
 * @file github.webhook.ts
 * @description Strongly typed GitHub webhook payload models and utility functions.
 *
 * Supported events: push, pull_request, ping
 */

// ── GitHub Shared Types ─────────────────────────────────────────────────────

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  private: boolean
  html_url: string
  clone_url: string
  default_branch: string
  owner: {
    login: string
    id: number
  }
}

export interface GitHubSender {
  login: string
  id: number
}

export interface GitHubCommit {
  id: string
  message: string
  timestamp: string
  author: {
    name: string
    email: string
    username?: string
  }
  added: string[]
  modified: string[]
  removed: string[]
}

// ── Push Event ──────────────────────────────────────────────────────────────

export interface GitHubPushEvent {
  ref: string
  before: string
  after: string
  repository: GitHubRepository
  commits: GitHubCommit[]
  head_commit: GitHubCommit | null
  sender: GitHubSender
  created: boolean
  deleted: boolean
  forced: boolean
}

// ── Pull Request Event ──────────────────────────────────────────────────────

export interface GitHubPullRequest {
  number: number
  title: string
  state: 'open' | 'closed'
  html_url: string
  head: {
    ref: string
    sha: string
    repo: GitHubRepository
  }
  base: {
    ref: string
    sha: string
    repo: GitHubRepository
  }
  user: GitHubSender
  merged: boolean
}

export interface GitHubPullRequestEvent {
  action: string
  number: number
  pull_request: GitHubPullRequest
  repository: GitHubRepository
  sender: GitHubSender
}

// ── Ping Event ──────────────────────────────────────────────────────────────

export interface GitHubPingEvent {
  zen: string
  hook_id: number
  hook: {
    type: string
    id: number
    events: string[]
    active: boolean
  }
  repository: GitHubRepository
  sender: GitHubSender
}

// ── Utility Functions ───────────────────────────────────────────────────────

const CI_FILE_PATTERNS: string[] = [
  '.github/workflows/',
  '.github/workflows\\',
  'Dockerfile',
  'docker-compose',
  'k8s/',
  'helm/',
  'kubernetes/',
  'Jenkinsfile',
  '.gitlab-ci.yml',
  '.gitlab-ci.yaml',
  '.circleci/',
  '.travis.yml',
  'bitbucket-pipelines.yml',
  'azure-pipelines.yml',
  'terraform/'
]

/**
 * Extract branch name from a git ref.
 * "refs/heads/main" → "main"
 * "refs/heads/feature/login" → "feature/login"
 */
export function extractBranchFromRef(ref: string): string {
  const prefix = 'refs/heads/'
  if (ref.startsWith(prefix)) {
    return ref.slice(prefix.length)
  }
  return ref
}

/**
 * Detect if any CI/CD configuration files were changed in a set of commits.
 * Inspects added, modified, and removed files across all commits.
 */
export function detectCIFileChanges(commits: GitHubCommit[]): {
  changed: boolean
  files: string[]
} {
  const ciFiles = new Set<string>()

  for (const commit of commits) {
    const allFiles = [
      ...commit.added,
      ...commit.modified,
      ...commit.removed
    ]

    for (const file of allFiles) {
      if (isCIFile(file)) {
        ciFiles.add(file)
      }
    }
  }

  return {
    changed: ciFiles.size > 0,
    files: Array.from(ciFiles)
  }
}

/**
 * Check if a file path matches a known CI/CD configuration pattern.
 */
function isCIFile(filePath: string): boolean {
  return CI_FILE_PATTERNS.some(pattern => filePath.includes(pattern))
}

/**
 * Check if a PR action is one we should process.
 */
export function isActionableprAction(action: string): boolean {
  return ['opened', 'synchronize', 'reopened'].includes(action)
}

export const CacheKeys = {
  // Scan results cache
  // TTL: 5 minutes (fresh enough for polling, not stale)
  scanResult: (repoId: string) =>
    `cache:scan:result:${repoId}`,

  // Latest scan ID per repo
  // TTL: 5 minutes
  latestScanId: (repoId: string) =>
    `cache:scan:latest:${repoId}`,

  // Full scan detail (findings + AI data)
  // TTL: 30 minutes (expensive to build, rarely changes)
  scanDetail: (scanId: string) =>
    `cache:scan:detail:${scanId}`,

  // Parsed manifest (NormalizedWorkflow AST)
  // TTL: 7 days (keyed by content SHA — only changes if file changes)
  manifest: (blobSha: string) =>
    `cache:manifest:${blobSha}`,

  // GitHub repo metadata
  // TTL: 10 minutes
  githubRepoMeta: (owner: string, repo: string) =>
    `cache:gh:repo:${owner}:${repo}`,

  // GitHub user's repo list
  // TTL: 2 minutes (changes when user creates/deletes repos)
  githubUserRepos: (userId: string, page: number) =>
    `cache:gh:userrepos:${userId}:p${page}`,

  // AI explanation (expensive — $0.01-0.05 per generation)
  // TTL: 24 hours (AI output for same input is deterministic)
  aiExplanation: (scanId: string, ruleId: string) =>
    `cache:ai:explain:${scanId}:${ruleId}`,

  // AI full report
  // TTL: 24 hours
  aiReport: (scanId: string) =>
    `cache:ai:report:${scanId}`,

  // Repo list for dashboard (pre-computed)
  // TTL: 30 seconds (live enough for the repos page)
  userRepoList: (userId: string) =>
    `cache:user:repos:${userId}`,

  // Queue stats (Bull Board data)
  // TTL: 10 seconds (dashboard polls every 10s)
  queueStats: () =>
    `cache:queue:stats`,

  // Ephemeral GitHub tokens (for scan workers)
  // TTL: 24 hours
  tempToken: (repoId: string) =>
    `temp-token:${repoId}`,

  // Scan app context (for GitHub App webhook handling)
  // TTL: 24 hours
  scanAppContext: (scanId: string) =>
    `scan-app-context:${scanId}`,

  // Installation token cache (GitHub App)
  // TTL: 55 minutes (tokens expire at 60 min)
  installationToken: (installationId: number) =>
    `cache:gh:install-token:${installationId}`,
}

export const CacheTTLs = {
  scanResult: 5 * 60,           // 5 minutes (seconds for Redis)
  latestScanId: 5 * 60,
  scanDetail: 30 * 60,          // 30 minutes
  manifest: 7 * 24 * 60 * 60,   // 7 days
  githubRepoMeta: 10 * 60,
  githubUserRepos: 2 * 60,
  aiExplanation: 24 * 60 * 60,  // 24 hours
  aiReport: 24 * 60 * 60,
  userRepoList: 30,             // 30 seconds
  queueStats: 10,              // 10 seconds
  tempToken: 24 * 60 * 60,
  scanAppContext: 24 * 60 * 60,
  installationToken: 55 * 60,   // 55 minutes
}

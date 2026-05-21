/**
 * @file cache.keys.ts
 * @description Centralized deterministic Redis key generation.
 *
 * ALL Redis cache keys in the project originate here.
 * No inline Redis key strings are allowed anywhere else.
 *
 * Namespace hierarchy:
 *   ci-intel:manifests:{repoId}:{gitSha}
 *   ci-intel:github:tree:{owner}:{repo}:{branch}
 *   ci-intel:github:file:{owner}:{repo}:{sha}
 *   ci-intel:scans:latest:{repoId}
 *   ci-intel:scans:result:{scanId}
 *   ci-intel:analysis:report:{scanId}
 *   ci-intel:analysis:risk:{scanId}
 *   ci-intel:ai:report:{scanId}
 *   ci-intel:ai:prediction:{scanId}
 *   ci-intel:ai:remediation:{scanId}
 *   ci-intel:tags:repo:{repoId}
 */

const PREFIX = 'ci-intel'

// ── Manifest Cache Keys ─────────────────────────────────────────────────────

/**
 * Key for a parsed normalized workflow cached by immutable git SHA.
 * Same SHA = identical content = no need to re-parse.
 */
export function manifestKey(repoId: string, gitSha: string): string {
  return `${PREFIX}:manifests:${repoId}:${gitSha}`
}

// ── GitHub API Cache Keys ───────────────────────────────────────────────────

/**
 * Key for a cached GitHub repository tree listing.
 * TTL should be short (5 min) since trees change on push.
 */
export function githubTreeKey(owner: string, repo: string, branch: string): string {
  return `${PREFIX}:github:tree:${owner}:${repo}:${branch}`
}

/**
 * Key for a cached GitHub file content, keyed by immutable blob SHA.
 * Since SHA is content-addressable, this is safe to cache long-term.
 */
export function githubFileKey(owner: string, repo: string, sha: string): string {
  return `${PREFIX}:github:file:${owner}:${repo}:${sha}`
}

// ── Scan Cache Keys ─────────────────────────────────────────────────────────

/**
 * Key for the latest completed scan summary for a repo.
 * Short TTL (5 min) since new scans replace this frequently.
 */
export function latestScanKey(repoId: string): string {
  return `${PREFIX}:scans:latest:${repoId}`
}

/**
 * Key for a full scan result (findings, scores, summaries).
 * Long TTL (24h) since completed scans are immutable.
 */
export function scanResultKey(scanId: string): string {
  return `${PREFIX}:scans:result:${scanId}`
}

// ── Analysis Cache Keys ─────────────────────────────────────────────────────

/**
 * Key for a cached analysis report for a given scan.
 */
export function analysisReportKey(scanId: string): string {
  return `${PREFIX}:analysis:report:${scanId}`
}

/**
 * Key for a cached risk score for a given scan.
 */
export function riskScoreKey(scanId: string): string {
  return `${PREFIX}:analysis:risk:${scanId}`
}

// ── AI Cache Keys ───────────────────────────────────────────────────────────

/**
 * Key for a cached full AI report for a given scan.
 */
export function aiReportKey(scanId: string): string {
  return `${PREFIX}:ai:report:${scanId}`
}

/**
 * Key for cached AI failure predictions for a given scan.
 */
export function predictionKey(scanId: string): string {
  return `${PREFIX}:ai:prediction:${scanId}`
}

/**
 * Key for cached AI remediations for a given scan.
 */
export function remediationKey(scanId: string): string {
  return `${PREFIX}:ai:remediation:${scanId}`
}

// ── Cache Tag / Invalidation Helpers ────────────────────────────────────────

/**
 * Tag key that tracks all cache keys associated with a specific repo.
 * Used for bulk invalidation when a repo's data changes.
 */
export function repoCacheTag(repoId: string): string {
  return `${PREFIX}:tags:repo:${repoId}`
}

/**
 * SCAN pattern for invalidating all manifest entries for a repo.
 * Used with Redis SCAN (never KEYS).
 */
export function manifestInvalidationPattern(repoId: string): string {
  return `${PREFIX}:manifests:${repoId}:*`
}

/**
 * SCAN pattern for invalidating all GitHub tree/file entries for a repo.
 */
export function githubInvalidationPattern(owner: string, repo: string): string {
  return `${PREFIX}:github:*:${owner}:${repo}:*`
}

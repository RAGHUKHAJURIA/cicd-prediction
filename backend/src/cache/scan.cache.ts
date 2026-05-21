/**
 * @file scan.cache.ts
 * @description Cache for scan results, analysis reports, and AI reports.
 *
 * Powers:
 *   GET /api/repos/:id/scans/latest — without hitting PostgreSQL
 *
 * Invalidation rules:
 *   When a new scan completes:
 *     1. invalidate previous latest scan cache
 *     2. set new latest scan cache
 *     3. invalidate outdated analysis cache for previous scan
 *     4. invalidate outdated AI cache for previous scan
 */

import { cache, CACHE_TTL } from './cache.client'
import {
  latestScanKey,
  scanResultKey,
  analysisReportKey,
  riskScoreKey,
  aiReportKey,
  predictionKey,
  remediationKey
} from './cache.keys'

// ── Cached Types ────────────────────────────────────────────────────────────

export interface CachedLatestScan {
  scanId: string
  repoId: string
  score: number
  grade: string
  findingsCount: number
  completedAt: string
  status: string
}

export interface CachedScanResult {
  scanId: string
  repoId: string
  findings: unknown[]
  riskScore: number
  riskGrade: string
  totalFiles: number
  totalFindings: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  completedAt: string
}

export interface CachedAnalysisReport {
  scanId: string
  reportJson: unknown
  riskScore: number
  riskGrade: string
  generatedAt: string
}

export interface CachedAIReport {
  scanId: string
  explanations: unknown[]
  remediations: unknown[]
  predictions: unknown[]
  tokensUsed: number
  costUsd: number
  generatedAt: string
}

// ── ScanCache ───────────────────────────────────────────────────────────────

export class ScanCache {

  // ── Latest Scan ─────────────────────────────────────────────────────────

  /**
   * Get the cached latest scan summary for a repo.
   * Short TTL (5 min) since new scans replace this frequently.
   */
  async getLatestScan(repoId: string): Promise<CachedLatestScan | null> {
    const key = latestScanKey(repoId)
    const result = await cache.get<CachedLatestScan>(key)
    return result.hit ? result.value : null
  }

  /**
   * Cache the latest scan summary for a repo.
   */
  async setLatestScan(repoId: string, scan: CachedLatestScan): Promise<boolean> {
    const key = latestScanKey(repoId)
    return cache.set(key, scan, CACHE_TTL.LATEST_SCAN)
  }

  // ── Full Scan Result ────────────────────────────────────────────────────

  /**
   * Get a cached full scan result.
   * Long TTL (24h) since completed scans are immutable.
   */
  async getScanResult(scanId: string): Promise<CachedScanResult | null> {
    const key = scanResultKey(scanId)
    const result = await cache.get<CachedScanResult>(key)
    return result.hit ? result.value : null
  }

  /**
   * Cache a full scan result.
   */
  async setScanResult(scanId: string, scanResult: CachedScanResult): Promise<boolean> {
    const key = scanResultKey(scanId)
    return cache.set(key, scanResult, CACHE_TTL.SCAN_RESULT)
  }

  // ── Analysis Report ─────────────────────────────────────────────────────

  /**
   * Get a cached analysis report.
   */
  async getAnalysisReport(scanId: string): Promise<CachedAnalysisReport | null> {
    const key = analysisReportKey(scanId)
    const result = await cache.get<CachedAnalysisReport>(key)
    return result.hit ? result.value : null
  }

  /**
   * Cache an analysis report.
   */
  async setAnalysisReport(scanId: string, report: CachedAnalysisReport): Promise<boolean> {
    const key = analysisReportKey(scanId)
    return cache.set(key, report, CACHE_TTL.ANALYSIS_REPORT)
  }

  // ── AI Report ───────────────────────────────────────────────────────────

  /**
   * Get a cached AI report.
   */
  async getAIReport(scanId: string): Promise<CachedAIReport | null> {
    const key = aiReportKey(scanId)
    const result = await cache.get<CachedAIReport>(key)
    return result.hit ? result.value : null
  }

  /**
   * Cache an AI report.
   */
  async setAIReport(scanId: string, report: CachedAIReport): Promise<boolean> {
    const key = aiReportKey(scanId)
    return cache.set(key, report, CACHE_TTL.AI_REPORT)
  }

  // ── Invalidation ────────────────────────────────────────────────────────

  /**
   * Invalidate all cache entries for a specific scan.
   * Called when a scan is re-run or deleted.
   */
  async invalidateScan(scanId: string): Promise<number> {
    const keys = [
      scanResultKey(scanId),
      analysisReportKey(scanId),
      riskScoreKey(scanId),
      aiReportKey(scanId),
      predictionKey(scanId),
      remediationKey(scanId)
    ]

    let deleted = 0
    for (const key of keys) {
      const removed = await cache.delete(key)
      if (removed) deleted++
    }

    return deleted
  }

  /**
   * Invalidate all scan-related cache for a repo.
   * Called when a repo is deleted or when a new scan replaces
   * the previous latest.
   */
  async invalidateRepo(repoId: string): Promise<boolean> {
    const key = latestScanKey(repoId)
    return cache.delete(key)
  }

  /**
   * Full invalidation cycle when a new scan completes.
   * Replaces the latest scan cache and clears stale analysis/AI caches.
   */
  async onScanCompleted(
    repoId: string,
    newScan: CachedLatestScan,
    previousScanId?: string
  ): Promise<void> {
    // 1. Invalidate previous latest scan
    await this.invalidateRepo(repoId)

    // 2. Set new latest scan
    await this.setLatestScan(repoId, newScan)

    // 3. Invalidate outdated analysis and AI cache from previous scan
    if (previousScanId) {
      await this.invalidateScan(previousScanId)
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────────────────

export const scanCache = new ScanCache()

/**
 * @file manifest.cache.ts
 * @description Cache for parsed normalized workflows.
 *
 * This is the highest-value cache in the system.
 * Same git SHA = identical file content = no need to re-parse.
 *
 * Without this cache, every scan re-parses every YAML file.
 * With this cache, unchanged files are instantly reused.
 */

import type { NormalizedWorkflow, ParserError } from '../models/workflow.model'
import { cache, CACHE_TTL } from './cache.client'
import { manifestKey, manifestInvalidationPattern, repoCacheTag } from './cache.keys'

// ── Cached Manifest Type ────────────────────────────────────────────────────

export interface CachedManifest {
  parser: string
  normalizedWorkflow: NormalizedWorkflow
  warnings: ParserError[]
  parsedAt: string
}

// ── ManifestCache ───────────────────────────────────────────────────────────

export class ManifestCache {
  /**
   * Retrieve a cached parsed workflow by repo ID and git SHA.
   * Returns null on miss or if the cached data is invalid.
   */
  async getManifest(repoId: string, gitSha: string): Promise<CachedManifest | null> {
    const key = manifestKey(repoId, gitSha)
    const result = await cache.get<CachedManifest>(key)
    return result.hit ? result.value : null
  }

  /**
   * Store a parsed workflow in the cache.
   * Uses git SHA as the identity key, guaranteeing immutability.
   */
  async setManifest(
    repoId: string,
    gitSha: string,
    manifest: CachedManifest
  ): Promise<boolean> {
    const key = manifestKey(repoId, gitSha)
    const stored = await cache.set(key, manifest, CACHE_TTL.MANIFEST)

    if (stored) {
      // Track this key under the repo tag for bulk invalidation
      await this.addToRepoTag(repoId, key)
    }

    return stored
  }

  /**
   * Check if a manifest exists in cache without fetching the full value.
   */
  async hasManifest(repoId: string, gitSha: string): Promise<boolean> {
    const key = manifestKey(repoId, gitSha)
    return cache.exists(key)
  }

  /**
   * Invalidate a specific manifest entry.
   */
  async invalidateManifest(repoId: string, gitSha: string): Promise<boolean> {
    const key = manifestKey(repoId, gitSha)
    return cache.delete(key)
  }

  /**
   * Invalidate ALL cached manifests for a specific repository.
   * Used when a repo is deleted or when a full re-scan is forced.
   */
  async invalidateRepo(repoId: string): Promise<number> {
    const pattern = manifestInvalidationPattern(repoId)
    const deleted = await cache.invalidatePattern(pattern)

    // Also clear the repo tag set
    const tagKey = repoCacheTag(repoId)
    await cache.delete(tagKey)

    return deleted
  }

  /**
   * Track a cache key under the repo's tag set for later bulk invalidation.
   */
  private async addToRepoTag(repoId: string, cacheKey: string): Promise<void> {
    try {
      const tagKey = repoCacheTag(repoId)
      const existing = await cache.get<string[]>(tagKey)
      const keys = existing.hit && existing.value ? existing.value : []

      if (!keys.includes(cacheKey)) {
        keys.push(cacheKey)
        await cache.set(tagKey, keys, CACHE_TTL.MANIFEST)
      }
    } catch {
      // Tag tracking is best-effort
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────────────────

export const manifestCache = new ManifestCache()

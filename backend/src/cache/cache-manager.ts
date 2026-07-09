import { redisConnections } from './redis-client'
import { CacheKeys, CacheTTLs } from './cache-keys'

class CacheManager {
  private redis = redisConnections.cache

  // GENERIC GET/SET WITH TYPE SAFETY
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch (err: any) {
      console.error(`[cache] GET error for ${key}:`, err.message)
      return null
    }
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number
  ): Promise<void> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value))
    } catch (err: any) {
      console.error(`[cache] SET error for ${key}:`, err.message)
      // Never throw — cache failure is not fatal
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (err: any) {
      console.error(`[cache] DEL error for ${key}:`, err.message)
    }
  }

  async delPattern(pattern: string): Promise<number> {
    // Delete all keys matching a pattern
    // Use SCAN not KEYS (KEYS blocks Redis)
    try {
      let cursor = '0'
      let deleted = 0
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor, 'MATCH', pattern, 'COUNT', 100
        )
        cursor = nextCursor
        if (keys.length > 0) {
          await this.redis.del(...keys)
          deleted += keys.length
        }
      } while (cursor !== '0')
      return deleted
    } catch (err: any) {
      console.error(`[cache] DEL pattern error for ${pattern}:`, err.message)
      return 0
    }
  }

  // CACHE-ASIDE PATTERN (check cache, fallback to DB query)
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fallback: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) return cached

    const fresh = await fallback()
    await this.set(key, fresh, ttlSeconds)
    return fresh
  }

  // DOMAIN-SPECIFIC OPERATIONS
  async getScanDetail(scanId: string) {
    return this.get(CacheKeys.scanDetail(scanId))
  }
  async setScanDetail(scanId: string, data: unknown) {
    return this.set(CacheKeys.scanDetail(scanId), data, CacheTTLs.scanDetail)
  }
  async invalidateScanDetail(scanId: string) {
    return this.del(CacheKeys.scanDetail(scanId))
  }

  async getManifest(blobSha: string) {
    return this.get(CacheKeys.manifest(blobSha))
  }
  async setManifest(blobSha: string, workflow: unknown) {
    return this.set(CacheKeys.manifest(blobSha), workflow, CacheTTLs.manifest)
  }

  async getLatestScanId(repoId: string): Promise<string | null> {
    return this.get<string>(CacheKeys.latestScanId(repoId))
  }
  async setLatestScanId(repoId: string, scanId: string) {
    return this.set(CacheKeys.latestScanId(repoId), scanId, CacheTTLs.latestScanId)
  }

  async getQueueStats() {
    return this.get(CacheKeys.queueStats())
  }
  async setQueueStats(stats: unknown) {
    return this.set(CacheKeys.queueStats(), stats, CacheTTLs.queueStats)
  }

  async getAIReport(scanId: string) {
    return this.get(CacheKeys.aiReport(scanId))
  }
  async setAIReport(scanId: string, report: unknown) {
    return this.set(CacheKeys.aiReport(scanId), report, CacheTTLs.aiReport)
  }

  async getUserRepoList(userId: string) {
    return this.get(CacheKeys.userRepoList(userId))
  }
  async setUserRepoList(userId: string, repos: unknown) {
    return this.set(CacheKeys.userRepoList(userId), repos, CacheTTLs.userRepoList)
  }
  async invalidateUserRepoList(userId: string) {
    return this.del(CacheKeys.userRepoList(userId))
  }

  async getGithubUserRepos(userId: string, page: number) {
    return this.get(CacheKeys.githubUserRepos(userId, page))
  }
  async setGithubUserRepos(userId: string, page: number, repos: unknown) {
    return this.set(
      CacheKeys.githubUserRepos(userId, page),
      repos,
      CacheTTLs.githubUserRepos
    )
  }

  async getInstallationToken(installationId: number): Promise<string | null> {
    return this.get<string>(CacheKeys.installationToken(installationId))
  }
  async setInstallationToken(installationId: number, token: string) {
    return this.set(
      CacheKeys.installationToken(installationId),
      token,
      CacheTTLs.installationToken
    )
  }

  // CACHE INVALIDATION: call these when data changes
  async onScanCompleted(repoId: string, scanId: string): Promise<void> {
    await Promise.allSettled([
      this.del(CacheKeys.scanResult(repoId)),
      this.del(CacheKeys.latestScanId(repoId)),
      this.setLatestScanId(repoId, scanId),
    ])
  }

  async onRepoCreated(userId: string): Promise<void> {
    await this.invalidateUserRepoList(userId)
  }

  async onRepoDeleted(userId: string, repoId: string): Promise<void> {
    await Promise.allSettled([
      this.invalidateUserRepoList(userId),
      this.del(CacheKeys.scanResult(repoId)),
      this.del(CacheKeys.latestScanId(repoId)),
      // delete all scan details for this repo:
      this.delPattern(`cache:scan:detail:*`)
    ])
  }

  // CACHE STATISTICS
  async getCacheInfo(): Promise<{
    keys: number
    memoryUsed: string
    hitRate: string
  }> {
    try {
      const info = await this.redis.info('stats')
      const hits = info.match(/keyspace_hits:(\d+)/)?.[1] ?? '0'
      const misses = info.match(/keyspace_misses:(\d+)/)?.[1] ?? '0'
      const hitsN = parseInt(hits, 10)
      const missesN = parseInt(misses, 10)
      const total = hitsN + missesN
      const hitRate = total > 0
        ? ((hitsN / total) * 100).toFixed(1) + '%'
        : 'N/A'

      const dbInfo = await this.redis.info('keyspace')
      const keyMatch = dbInfo.match(/db1:keys=(\d+)/)
      const keys = keyMatch ? parseInt(keyMatch[1], 10) : 0

      const memInfo = await this.redis.info('memory')
      const memUsed = memInfo.match(/used_memory_human:(\S+)/)?.[1] ?? 'N/A'

      return { keys, memoryUsed: memUsed, hitRate }
    } catch {
      return { keys: 0, memoryUsed: 'N/A', hitRate: 'N/A' }
    }
  }
}

export const cacheManager = new CacheManager()

/**
 * @file cache.client.ts
 * @description Typed Redis cache abstraction.
 *
 * All cache operations go through CacheClient.
 * No raw Redis usage outside this file.
 *
 * Failure strategy: cache is optimization-only.
 * If Redis is unavailable, operations return misses / no-ops
 * and log warnings. Workers MUST NOT crash on cache failure.
 */

import Redis from 'ioredis'
import { queueRedis } from '../queue/redis.client'

// ── TTL Constants (seconds) ─────────────────────────────────────────────────

export const CACHE_TTL = {
  MANIFEST:        86400,   // 24h — parsed workflows keyed by immutable SHA
  GITHUB_TREE:     300,     // 5 min — repo file trees change on push
  GITHUB_FILE:     3600,    // 1h — file content keyed by blob SHA (immutable)
  LATEST_SCAN:     300,     // 5 min — latest scan summary changes often
  SCAN_RESULT:     86400,   // 24h — completed scan results are immutable
  ANALYSIS_REPORT: 86400,   // 24h
  AI_REPORT:       86400,   // 24h
  JOB_STATUS:      86400    // 24h
} as const

// ── Result Types ────────────────────────────────────────────────────────────

export interface CacheGetResult<T> {
  hit: boolean
  value: T | null
  key: string
  ttlRemaining?: number
}

export interface CacheHealthResult {
  healthy: boolean
  latencyMs: number
  memoryUsage?: string
  connectedClients?: number
}

// ── CacheClient ─────────────────────────────────────────────────────────────

export class CacheClient {
  private readonly redis: Redis

  constructor(redis?: Redis) {
    this.redis = redis ?? queueRedis
  }

  // ── get ──────────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<CacheGetResult<T>> {
    try {
      const raw = await this.redis.get(key)

      if (raw === null) {
        return { hit: false, value: null, key }
      }

      try {
        const parsed = JSON.parse(raw) as T
        const ttlRemaining = await this.redis.ttl(key)
        return { hit: true, value: parsed, key, ttlRemaining }
      } catch {
        this.log('warn', 'cache_json_corrupt', { key })
        await this.redis.del(key)
        return { hit: false, value: null, key }
      }
    } catch (err: any) {
      this.log('warn', 'cache_get_failed', { key, error: err.message })
      return { hit: false, value: null, key }
    }
  }

  // ── set ──────────────────────────────────────────────────────────────────

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value)
      await this.redis.setex(key, ttlSeconds, serialized)
      return true
    } catch (err: any) {
      this.log('warn', 'cache_set_failed', { key, error: err.message })
      return false
    }
  }

  // ── delete ───────────────────────────────────────────────────────────────

  async delete(key: string): Promise<boolean> {
    try {
      const count = await this.redis.del(key)
      return count > 0
    } catch (err: any) {
      this.log('warn', 'cache_delete_failed', { key, error: err.message })
      return false
    }
  }

  // ── exists ───────────────────────────────────────────────────────────────

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key)
      return result === 1
    } catch {
      return false
    }
  }

  // ── ttl ──────────────────────────────────────────────────────────────────

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key)
    } catch {
      return -1
    }
  }

  // ── expire ───────────────────────────────────────────────────────────────

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, ttlSeconds)
      return result === 1
    } catch {
      return false
    }
  }

  // ── mget ─────────────────────────────────────────────────────────────────

  async mget<T>(keys: string[]): Promise<CacheGetResult<T>[]> {
    if (keys.length === 0) return []

    try {
      const rawValues = await this.redis.mget(...keys)
      return keys.map((key, i) => {
        const raw = rawValues[i]
        if (raw === null || raw === undefined) {
          return { hit: false, value: null, key }
        }
        try {
          const parsed = JSON.parse(raw) as T
          return { hit: true, value: parsed, key }
        } catch {
          this.log('warn', 'cache_json_corrupt', { key })
          void this.redis.del(key).catch(() => {})
          return { hit: false, value: null, key }
        }
      })
    } catch (err: any) {
      this.log('warn', 'cache_mget_failed', { error: err.message, keyCount: keys.length })
      return keys.map(key => ({ hit: false, value: null, key }))
    }
  }

  // ── mset ─────────────────────────────────────────────────────────────────

  async mset<T>(entries: Array<{ key: string; value: T; ttl: number }>): Promise<boolean> {
    if (entries.length === 0) return true

    try {
      const pipeline = this.redis.pipeline()
      for (const entry of entries) {
        pipeline.setex(entry.key, entry.ttl, JSON.stringify(entry.value))
      }
      await pipeline.exec()
      return true
    } catch (err: any) {
      this.log('warn', 'cache_mset_failed', { error: err.message, entryCount: entries.length })
      return false
    }
  }

  // ── remember (cache-aside pattern) ───────────────────────────────────────

  async remember<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached.hit && cached.value !== null) {
      this.log('info', 'cache_hit', { key })
      return cached.value
    }

    this.log('info', 'cache_miss', { key })
    const value = await factory()
    await this.set(key, value, ttlSeconds)
    return value
  }

  // ── invalidatePattern (uses SCAN, never KEYS) ───────────────────────────

  async invalidatePattern(pattern: string): Promise<number> {
    let deleted = 0
    let cursor = '0'

    try {
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH', pattern,
          'COUNT', '100'
        )
        cursor = nextCursor

        if (keys.length > 0) {
          const count = await this.redis.del(...keys)
          deleted += count
        }
      } while (cursor !== '0')

      if (deleted > 0) {
        this.log('info', 'cache_invalidated', { pattern, deleted })
      }

      return deleted
    } catch (err: any) {
      this.log('warn', 'cache_invalidate_failed', { pattern, error: err.message })
      return deleted
    }
  }

  // ── health ───────────────────────────────────────────────────────────────

  async health(): Promise<CacheHealthResult> {
    const start = Date.now()
    try {
      await this.redis.ping()
      const latencyMs = Date.now() - start
      const result: CacheHealthResult = { healthy: true, latencyMs }

      const info = await this.redis.info('memory')
      const memoryMatch = info.match(/used_memory_human:(.+)/)
      if (memoryMatch) {
        result.memoryUsage = memoryMatch[1].trim()
      }

      const clientInfo = await this.redis.info('clients')
      const clientMatch = clientInfo.match(/connected_clients:(\d+)/)
      if (clientMatch) {
        result.connectedClients = parseInt(clientMatch[1], 10)
      }

      return result
    } catch {
      return { healthy: false, latencyMs: Date.now() - start }
    }
  }

  // ── internal logging ─────────────────────────────────────────────────────

  private log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown>): void {
    const entry = JSON.stringify({
      level,
      event,
      ...data,
      timestamp: new Date().toISOString()
    })

    if (level === 'error') {
      console.error(entry)
    } else if (level === 'warn') {
      console.warn(entry)
    } else {
      console.log(entry)
    }
  }
}

// ── Singleton Export ────────────────────────────────────────────────────────

export const cache = new CacheClient()

import { eq, desc, gt } from 'drizzle-orm'
import { db } from '../db/client'
import { users, repos } from '../db/schema'
import { cacheManager } from './cache-manager'
import { scanQueue, analysisQueue, aiQueue } from '../queue/queue.definitions'
import { checkRedisHealth as checkQueueRedisHealth } from '../queue/redis.client'

async function computeQueueStats() {
  const [scanCounts, analysisCounts, aiCounts, redisHealth] = await Promise.all([
    scanQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    analysisQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    aiQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    checkQueueRedisHealth()
  ])

  return {
    queues: {
      scan: scanCounts,
      analysis: analysisCounts,
      ai: aiCounts
    },
    redis: {
      healthy: redisHealth.healthy,
      latencyMs: redisHealth.latencyMs
    },
    timestamp: new Date().toISOString()
  }
}

async function warmQueueStats(): Promise<void> {
  // Queue stats are expensive (multiple BullMQ calls)
  // Pre-compute on startup
  try {
    const stats = await computeQueueStats()
    await cacheManager.setQueueStats(stats)
    console.log('[cache-warmer] Queue stats warmed')
  } catch (err: any) {
    console.warn('[cache-warmer] Queue stats warm failed:', err.message)
  }
}

async function warmActiveUserRepoLists(): Promise<void> {
  // Find users who were active in the last 24 hours
  try {
    const recentUsers = await db.select({ id: users.id })
      .from(users)
      .where(gt(users.lastLoginAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .limit(50)  // cap to avoid startup spike

    for (const user of recentUsers) {
      try {
        const userRepos = await db.select().from(repos)
          .where(eq(repos.userId, user.id))
          .orderBy(desc(repos.updatedAt))
          .limit(20)
        await cacheManager.setUserRepoList(user.id, userRepos)
      } catch {}
    }
    console.log(
      `[cache-warmer] Warmed repo lists for ${recentUsers.length} users`
    )
  } catch (err: any) {
    console.warn('[cache-warmer] User repo warm failed:', err.message)
  }
}

export async function warmCache(): Promise<void> {
  console.log('[cache-warmer] Starting cache warm-up...')

  const start = Date.now()
  const results = await Promise.allSettled([
    // Warm queue stats (hit on every dashboard load)
    warmQueueStats(),

    // Warm repo lists for active users
    // (only users who logged in the last 24 hours)
    warmActiveUserRepoLists(),
  ])

  const failed = results.filter(r => r.status === 'rejected').length
  console.log(
    `[cache-warmer] Completed in ${Date.now() - start}ms. ${failed} errors.`
  )
}

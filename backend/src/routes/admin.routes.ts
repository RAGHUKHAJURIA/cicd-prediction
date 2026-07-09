import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.middleware'
import { RATE_LIMITS } from '../middleware/rate-limit-configs'
import { cacheManager } from '../cache/cache-manager'
import { checkRedisHealth } from '../cache/redis-client'

const router = Router()

router.get('/rate-limits', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configs: any[] = []
    for (const [name, config] of Object.entries(RATE_LIMITS)) {
      if (name === 'publicScan') {
        for (const [subName, subConfig] of Object.entries(config)) {
          configs.push({
            name: `${name}.${subName}`,
            limit: subConfig.limit,
            windowSeconds: subConfig.windowMs / 1000,
            prefix: subConfig.prefix
          })
        }
      } else {
        const c = config as any
        configs.push({
          name,
          limit: c.limit,
          windowSeconds: c.windowMs / 1000,
          prefix: c.prefix
        })
      }
    }
    
    const [cacheInfo, redisHealth] = await Promise.all([
      cacheManager.getCacheInfo(),
      checkRedisHealth()
    ])

    res.status(200).json({
      success: true,
      data: {
        configs,
        cache: cacheInfo,
        redis: redisHealth
      }
    })
  } catch (err) {
    next(err)
  }
})

router.post('/cache/flush', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await cacheManager.delPattern('cache:*')
    res.status(200).json({ success: true, keysDeleted: deleted })
  } catch (err) {
    next(err)
  }
})

export const adminRoutes = router
export default router

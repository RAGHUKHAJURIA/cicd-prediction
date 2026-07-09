import { redisConnections, checkRedisHealth } from '../cache/redis-client'
import { slidingWindowCheck, initSlidingWindow } from '../middleware/sliding-window'
import { cacheManager } from '../cache/cache-manager'

async function runHealthCheck() {
  console.log('=== Redis Health Check ===\n')

  // 1. Basic connectivity
  console.log('1. Checking Redis connectivity...')
  const health = await checkRedisHealth()
  console.log(health.connected ? '✓ Connected' : '✗ NOT connected')
  console.log(`  Latency: ${health.latencyMs}ms`)
  console.log(`  Version: ${health.version}`)
  console.log(`  Memory: ${health.memoryUsedMb}MB`)
  if (health.error) console.error('  Error:', health.error)

  // 2. Sliding window test
  console.log('\n2. Testing sliding window rate limiter...')
  await redisConnections.rateLimiter.connect().catch(() => {})
  await initSlidingWindow()

  const testId = `healthcheck-${Date.now()}`
  let allowed = 0
  let blocked = 0
  for (let i = 0; i < 15; i++) {
    const result = await slidingWindowCheck(testId, 'test', 10, 60000)
    if (result.allowed) allowed++
    else blocked++
  }
  console.log(`✓ Sliding window: ${allowed} allowed, ${blocked} blocked`)
  console.log(`  (Expected: 10 allowed, 5 blocked)`)
  
  // Clean up test keys
  await redisConnections.rateLimiter.del(
    `rl:test:${testId}:*`
  ).catch(() => {})

  // 3. Cache operations test
  console.log('\n3. Testing cache operations...')
  await redisConnections.cache.connect().catch(() => {})
  const testKey = `healthcheck:test:${Date.now()}`
  const testValue = { hello: 'world', timestamp: Date.now() }
  await cacheManager.set(testKey, testValue, 30)
  const retrieved = await cacheManager.get(testKey)
  const cacheWorking = JSON.stringify(retrieved) === JSON.stringify(testValue)
  console.log(cacheWorking ? '✓ Cache SET/GET working' : '✗ Cache NOT working')
  await cacheManager.del(testKey)

  // 4. Cache info
  const cacheInfo = await cacheManager.getCacheInfo()
  console.log(`  Cache keys: ${cacheInfo.keys}`)
  console.log(`  Hit rate: ${cacheInfo.hitRate}`)

  // 5. Summary
  console.log('\n=== Summary ===')
  const allGood = health.connected && cacheWorking
  console.log(allGood ? '✅ All checks passed' : '❌ Some checks failed')

  // Cleanup
  await Promise.allSettled([
    redisConnections.rateLimiter.disconnect(),
    redisConnections.cache.disconnect(),
  ])

  process.exit(allGood ? 0 : 1)
}

runHealthCheck().catch(err => {
  console.error('Health check crashed:', err)
  process.exit(1)
})

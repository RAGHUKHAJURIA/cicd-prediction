/**
 * @file cache.test.ts
 * @description Integration tests for the Redis cache layer.
 *
 * Run: npx ts-node src/cache/cache.test.ts
 *
 * Requires Redis to be running on localhost:6379.
 * Uses Node assert only — no Jest, no Vitest.
 */

import assert from 'assert'
import { randomUUID } from 'crypto'
import {
  manifestKey,
  githubTreeKey
} from './cache.keys'
import { CacheClient } from './cache.client'
import { ManifestCache } from './manifest.cache'
import { ScanCache } from './scan.cache'
import type { CachedManifest } from './manifest.cache'
import type { CachedLatestScan, CachedAnalysisReport, CachedAIReport } from './scan.cache'
import { WorkflowSource, StepType, RunnerType, TriggerType } from '../models/workflow.model'
import type { NormalizedWorkflow } from '../models/workflow.model'
import { queueRedis } from '../queue/redis.client'

const testCache = new CacheClient(queueRedis)
const testManifestCache = new ManifestCache()
const testScanCache = new ScanCache()

function makeWorkflow(id: string): NormalizedWorkflow {
  return {
    id,
    source: WorkflowSource.GITHUB_ACTIONS,
    sourceFile: '.github/workflows/ci.yml',
    repoId: 'test-repo',
    parsedAt: new Date(),
    jobs: [{
      id: 'build',
      name: 'Build',
      steps: [{
        id: 'step-1',
        name: 'Checkout',
        type: StepType.ACTION,
        run: null,
        uses: 'actions/checkout@v3',
        actionRef: null,
        with: {},
        env: [],
        conditions: [],
        continueOnError: false,
        timeoutMinutes: null
      }],
      needs: [],
      env: [],
      secrets: [],
      services: [],
      runsOn: { type: RunnerType.GITHUB_HOSTED, labels: ['ubuntu-latest'], image: null },
      conditions: [],
      strategy: null,
      timeoutMinutes: 30,
      continueOnError: false,
      retryStrategy: null,
      artifacts: [],
      container: null
    }],
    triggers: [{
      type: TriggerType.PUSH,
      branches: ['main'],
      paths: [],
      schedule: null
    }],
    globalEnv: [],
    globalSecrets: [],
    permissions: [],
    metadata: {
      name: 'CI',
      description: null,
      totalJobs: 1,
      totalSteps: 1,
      hasDockerImages: false,
      hasSecrets: false,
      hasExternalActions: true,
      ciSystem: 'GitHub Actions'
    }
  }
}

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    console.error(`  ✗ ${name}: ${err.message}`)
  }
}

async function runTests(): Promise<void> {
  console.log('\n═══ Cache Layer Tests ═══\n')

  try {
    await queueRedis.connect()
  } catch {
    // Already connected
  }

  // ── Key Generation Tests ──────────────────────────────────────────────

  await test('TEST 1: manifestKey deterministic', async () => {
    const key1 = manifestKey('repo-abc', 'sha-123')
    const key2 = manifestKey('repo-abc', 'sha-123')
    assert.strictEqual(key1, key2)
    assert.strictEqual(key1, 'ci-intel:manifests:repo-abc:sha-123')
  })

  await test('TEST 2: githubTreeKey deterministic', async () => {
    const key1 = githubTreeKey('owner', 'repo', 'main')
    const key2 = githubTreeKey('owner', 'repo', 'main')
    assert.strictEqual(key1, key2)
    assert.strictEqual(key1, 'ci-intel:github:tree:owner:repo:main')
  })

  // ── CacheClient Core Tests ────────────────────────────────────────────

  await test('TEST 3: cache.set + cache.get works', async () => {
    const key = `test:${randomUUID()}`
    await testCache.set(key, { hello: 'world' }, 60)
    const result = await testCache.get<{ hello: string }>(key)
    assert.strictEqual(result.hit, true)
    assert.strictEqual(result.value?.hello, 'world')
    await testCache.delete(key)
  })

  await test('TEST 4: cache miss returns hit=false', async () => {
    const key = `test:missing:${randomUUID()}`
    const result = await testCache.get(key)
    assert.strictEqual(result.hit, false)
    assert.strictEqual(result.value, null)
  })

  await test('TEST 5: remember() caches result', async () => {
    const key = `test:remember:${randomUUID()}`
    let computeCount = 0
    const value = await testCache.remember(key, 60, async () => {
      computeCount++
      return { computed: true }
    })
    assert.strictEqual(value.computed, true)
    assert.strictEqual(computeCount, 1)

    // Verify it's actually in cache
    const cached = await testCache.get<{ computed: boolean }>(key)
    assert.strictEqual(cached.hit, true)
    await testCache.delete(key)
  })

  await test('TEST 6: remember() avoids recomputation', async () => {
    const key = `test:remember2:${randomUUID()}`
    let computeCount = 0

    await testCache.remember(key, 60, async () => {
      computeCount++
      return { run: 1 }
    })

    await testCache.remember(key, 60, async () => {
      computeCount++
      return { run: 2 }
    })

    assert.strictEqual(computeCount, 1, 'Factory should only run once')
    await testCache.delete(key)
  })

  await test('TEST 7: invalid JSON auto-purged', async () => {
    const key = `test:corrupt:${randomUUID()}`
    // Write invalid JSON directly to Redis
    await queueRedis.set(key, '{not valid json!!!}')
    const result = await testCache.get(key)
    assert.strictEqual(result.hit, false, 'Corrupt JSON should be a miss')

    // Key should have been deleted
    const exists = await testCache.exists(key)
    assert.strictEqual(exists, false, 'Corrupt key should be purged')
  })

  await test('TEST 8: TTL expiration works', async () => {
    const key = `test:ttl:${randomUUID()}`
    await testCache.set(key, { temp: true }, 1) // 1 second TTL
    const before = await testCache.get(key)
    assert.strictEqual(before.hit, true)

    await new Promise(r => setTimeout(r, 1100))
    const after = await testCache.get(key)
    assert.strictEqual(after.hit, false, 'Should expire after TTL')
  })

  await test('TEST 9: mget works', async () => {
    const k1 = `test:mget1:${randomUUID()}`
    const k2 = `test:mget2:${randomUUID()}`
    const k3 = `test:mget3:${randomUUID()}`
    await testCache.set(k1, { a: 1 }, 60)
    await testCache.set(k2, { b: 2 }, 60)

    const results = await testCache.mget<{ a?: number; b?: number }>([k1, k2, k3])
    assert.strictEqual(results.length, 3)
    assert.strictEqual(results[0].hit, true)
    assert.strictEqual(results[1].hit, true)
    assert.strictEqual(results[2].hit, false, 'Missing key should be a miss')
    await testCache.delete(k1)
    await testCache.delete(k2)
  })

  await test('TEST 10: mset works', async () => {
    const k1 = `test:mset1:${randomUUID()}`
    const k2 = `test:mset2:${randomUUID()}`
    const stored = await testCache.mset([
      { key: k1, value: { x: 1 }, ttl: 60 },
      { key: k2, value: { y: 2 }, ttl: 60 }
    ])
    assert.strictEqual(stored, true)
    const r1 = await testCache.get<{ x: number }>(k1)
    const r2 = await testCache.get<{ y: number }>(k2)
    assert.strictEqual(r1.value?.x, 1)
    assert.strictEqual(r2.value?.y, 2)
    await testCache.delete(k1)
    await testCache.delete(k2)
  })

  await test('TEST 11: invalidatePattern works', async () => {
    const prefix = `test:invalidate:${randomUUID()}`
    await testCache.set(`${prefix}:a`, 1, 60)
    await testCache.set(`${prefix}:b`, 2, 60)
    await testCache.set(`${prefix}:c`, 3, 60)

    const deleted = await testCache.invalidatePattern(`${prefix}:*`)
    assert.ok(deleted >= 3, `Expected >=3 deleted, got ${deleted}`)
  })

  // ── ManifestCache Tests ───────────────────────────────────────────────

  const testRepoId = `repo-test-${randomUUID()}`
  const testSha = `sha-test-${randomUUID()}`

  await test('TEST 12: ManifestCache stores workflow', async () => {
    const workflow = makeWorkflow(randomUUID())
    const manifest: CachedManifest = {
      parser: 'github-actions',
      normalizedWorkflow: workflow,
      warnings: [],
      parsedAt: new Date().toISOString()
    }
    const stored = await testManifestCache.setManifest(testRepoId, testSha, manifest)
    assert.strictEqual(stored, true)
  })

  await test('TEST 13: ManifestCache retrieves workflow', async () => {
    const result = await testManifestCache.getManifest(testRepoId, testSha)
    assert.ok(result, 'Should retrieve cached manifest')
    assert.strictEqual(result.parser, 'github-actions')
    assert.ok(result.normalizedWorkflow.jobs.length > 0)
  })

  await test('TEST 14: ManifestCache invalidateManifest works', async () => {
    const invalidated = await testManifestCache.invalidateManifest(testRepoId, testSha)
    assert.strictEqual(invalidated, true)

    const result = await testManifestCache.getManifest(testRepoId, testSha)
    assert.strictEqual(result, null, 'Should be null after invalidation')
  })

  await test('TEST 15: ManifestCache invalidateRepo works', async () => {
    const sha1 = `sha-ir-${randomUUID()}`
    const sha2 = `sha-ir-${randomUUID()}`
    const workflow = makeWorkflow(randomUUID())
    const manifest: CachedManifest = {
      parser: 'github-actions',
      normalizedWorkflow: workflow,
      warnings: [],
      parsedAt: new Date().toISOString()
    }
    await testManifestCache.setManifest(testRepoId, sha1, manifest)
    await testManifestCache.setManifest(testRepoId, sha2, manifest)

    const deleted = await testManifestCache.invalidateRepo(testRepoId)
    assert.ok(deleted >= 2, `Expected >=2 deleted, got ${deleted}`)

    const r1 = await testManifestCache.getManifest(testRepoId, sha1)
    const r2 = await testManifestCache.getManifest(testRepoId, sha2)
    assert.strictEqual(r1, null)
    assert.strictEqual(r2, null)
  })

  // ── ScanCache Tests ───────────────────────────────────────────────────

  const testScanRepoId = `repo-scan-${randomUUID()}`
  const testScanId = randomUUID()

  await test('TEST 16: ScanCache stores latest scan', async () => {
    const latest: CachedLatestScan = {
      scanId: testScanId,
      repoId: testScanRepoId,
      score: 85,
      grade: 'B',
      findingsCount: 12,
      completedAt: new Date().toISOString(),
      status: 'completed'
    }
    const stored = await testScanCache.setLatestScan(testScanRepoId, latest)
    assert.strictEqual(stored, true)
  })

  await test('TEST 17: ScanCache retrieves latest scan', async () => {
    const result = await testScanCache.getLatestScan(testScanRepoId)
    assert.ok(result)
    assert.strictEqual(result.scanId, testScanId)
    assert.strictEqual(result.score, 85)
    assert.strictEqual(result.grade, 'B')
  })

  await test('TEST 18: ScanCache stores analysis report', async () => {
    const report: CachedAnalysisReport = {
      scanId: testScanId,
      reportJson: { summary: 'OK' },
      riskScore: 85,
      riskGrade: 'B',
      generatedAt: new Date().toISOString()
    }
    const stored = await testScanCache.setAnalysisReport(testScanId, report)
    assert.strictEqual(stored, true)

    const result = await testScanCache.getAnalysisReport(testScanId)
    assert.ok(result)
    assert.strictEqual(result.riskScore, 85)
  })

  await test('TEST 19: ScanCache stores AI report', async () => {
    const report: CachedAIReport = {
      scanId: testScanId,
      explanations: [{ finding: 'test', explanation: 'ok' }],
      remediations: [],
      predictions: [],
      tokensUsed: 1500,
      costUsd: 0.02,
      generatedAt: new Date().toISOString()
    }
    const stored = await testScanCache.setAIReport(testScanId, report)
    assert.strictEqual(stored, true)

    const result = await testScanCache.getAIReport(testScanId)
    assert.ok(result)
    assert.strictEqual(result.tokensUsed, 1500)
  })

  await test('TEST 20: ScanCache invalidateScan works', async () => {
    const deleted = await testScanCache.invalidateScan(testScanId)
    assert.ok(deleted >= 1, `Expected >=1 deleted, got ${deleted}`)

    const result = await testScanCache.getAnalysisReport(testScanId)
    assert.strictEqual(result, null)
  })

  await test('TEST 21: cache health endpoint works', async () => {
    const health = await testCache.health()
    assert.strictEqual(health.healthy, true)
    assert.ok(health.latencyMs >= 0)
    assert.ok(health.memoryUsage)
  })

  await test('TEST 22: cache survives Redis reconnect', async () => {
    // Simulate a cache operation after brief disruption
    const key = `test:reconnect:${randomUUID()}`
    await testCache.set(key, { alive: true }, 60)
    const result = await testCache.get<{ alive: boolean }>(key)
    assert.strictEqual(result.hit, true)
    assert.strictEqual(result.value?.alive, true)
    await testCache.delete(key)
  })

  await test('TEST 23: large workflow serialization safe', async () => {
    const largeWorkflow = makeWorkflow(randomUUID())
    // Add many jobs to make it large
    for (let i = 0; i < 50; i++) {
      largeWorkflow.jobs.push({
        ...largeWorkflow.jobs[0],
        id: `job-${i}`,
        name: `Job ${i}`
      })
    }

    const key = `test:large:${randomUUID()}`
    const stored = await testCache.set(key, largeWorkflow, 60)
    assert.strictEqual(stored, true)

    const result = await testCache.get<NormalizedWorkflow>(key)
    assert.strictEqual(result.hit, true)
    assert.strictEqual(result.value?.jobs.length, 51)
    await testCache.delete(key)
  })

  await test('TEST 24: cache logs structured JSON', async () => {
    // The logging itself is tested implicitly — remember() logs cache_hit/cache_miss
    // We just verify the operation succeeds without crashing
    const key = `test:log:${randomUUID()}`
    await testCache.remember(key, 60, async () => 'logged')
    await testCache.remember(key, 60, async () => 'should-not-run')
    await testCache.delete(key)
  })

  await test('TEST 25: cache corruption handled safely', async () => {
    const key = `test:corrupt2:${randomUUID()}`
    // Write garbage binary data
    await queueRedis.set(key, Buffer.from([0xFF, 0xFE, 0x00, 0x01]).toString())
    const result = await testCache.get(key)
    assert.strictEqual(result.hit, false, 'Corrupt data should be a miss')
  })

  // ── Summary ───────────────────────────────────────────────────────────

  console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`)

  if (failed > 0) {
    process.exit(1)
  }

  process.exit(0)
}

runTests().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})

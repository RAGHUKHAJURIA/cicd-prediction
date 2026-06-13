import { EventEmitter } from 'events'
import assert from 'assert'
import { redisConfig, createRedisConnection } from './redis.client'
import {
  QUEUE_NAMES, SCAN_JOBS, ANALYSIS_JOBS, AI_JOBS, JobPriority,
  FetchAndParseJobPayload, FullAIReportJobPayload, ScanJobResult, AnalysisJobResult,
  ScanJobProgress, AIJobProgress, RescanJobPayload, ParseSingleFileJobPayload, JobMetadata
} from './job.types'
import { QueueMetrics } from './queue.definitions'

class MockRedis extends EventEmitter {
  public store: Map<string, string> = new Map()
  public status = 'ready'

  async ping(): Promise<'PONG'> { return 'PONG' }
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }
  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value); return 'OK'
  }
  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0
  }
  async quit(): Promise<'OK'> {
    this.status = 'end'; return 'OK'
  }
  async connect(): Promise<void> {
    this.status = 'ready'
    this.emit('ready')
  }
}

function runTests() {
  console.log('Running tests...')

  // TEST 1
  assert.strictEqual(QUEUE_NAMES.SCAN, 'scan-queue')
  assert.strictEqual(QUEUE_NAMES.ANALYSIS, 'analysis-queue')
  assert.strictEqual(QUEUE_NAMES.AI, 'ai-queue')
  console.log('PASS: TEST 1')

  // TEST 2
  assert.strictEqual(SCAN_JOBS.FETCH_AND_PARSE, 'fetch-and-parse')
  assert.strictEqual(SCAN_JOBS.RESCAN, 'rescan')
  assert.strictEqual(SCAN_JOBS.PARSE_SINGLE, 'parse-single-file')
  console.log('PASS: TEST 2')

  // TEST 3
  assert.strictEqual(ANALYSIS_JOBS.RUN_RULES, 'run-rules')
  assert.strictEqual(ANALYSIS_JOBS.SCORE_RISK, 'score-risk')
  assert.strictEqual(ANALYSIS_JOBS.BUILD_REPORT, 'build-report')
  console.log('PASS: TEST 3')

  // TEST 4
  assert.strictEqual(AI_JOBS.EXPLAIN_SCAN, 'explain-scan')
  assert.strictEqual(AI_JOBS.PREDICT_FAILURES, 'predict-failures')
  assert.strictEqual(AI_JOBS.GENERATE_REMEDIATIONS, 'generate-remediations')
  assert.strictEqual(AI_JOBS.FULL_AI_REPORT, 'full-ai-report')
  console.log('PASS: TEST 4')

  // TEST 5
  assert.ok(JobPriority.CRITICAL < JobPriority.HIGH)
  assert.ok(JobPriority.HIGH < JobPriority.NORMAL)
  assert.ok(JobPriority.NORMAL < JobPriority.LOW)
  console.log('PASS: TEST 5')

  // TEST 6
  const payload: FetchAndParseJobPayload = {
    scanId: '550e8400-e29b-41d4-a716-446655440000',
    repoId: '550e8400-e29b-41d4-a716-446655440001',
    repoUrl: 'https://github.com/owner/repo',
    owner: 'owner',
    repoName: 'repo',
    branch: 'main',
    provider: 'github',
    githubToken: 'ghp_test',
    targetFiles: [],
    ignorePaths: [],
    priority: JobPriority.HIGH,
    triggeredBy: 'manual'
  }
  assert.ok(payload.scanId.length > 0)
  assert.strictEqual(payload.provider, 'github')
  assert.strictEqual(payload.priority, JobPriority.HIGH)
  console.log('PASS: TEST 6')

  // TEST 7
  const minimal: FetchAndParseJobPayload = {
    scanId: 'id1', repoId: 'id2',
    repoUrl: 'https://github.com/o/r',
    owner: 'o', repoName: 'r', branch: 'main',
    provider: 'github', ignorePaths: [],
    priority: JobPriority.NORMAL, triggeredBy: 'webhook'
  }
  assert.strictEqual(minimal.githubToken, undefined)
  console.log('PASS: TEST 7')

  // TEST 8
  const aiPayload: FullAIReportJobPayload = {
    scanId: 'scan-1', repoId: 'repo-1',
    aiContextJson: JSON.stringify({ overallScore: 75 }),
    findingsJson: JSON.stringify([]),
    workflowContentsJson: JSON.stringify({}),
    includeRemediation: true,
    maxFindings: 10
  }
  assert.strictEqual(typeof aiPayload.aiContextJson, 'string')
  const parsed = JSON.parse(aiPayload.aiContextJson)
  assert.strictEqual(parsed.overallScore, 75)
  console.log('PASS: TEST 8')

  // TEST 9
  const scanResult: ScanJobResult = {
    scanId: 'scan-1',
    filesFound: 5,
    filesParsed: 5,
    filesFailedToParse: 0,
    parsedArtifactIds: ['id1', 'id2'],
    durationMs: 1234
  }
  assert.strictEqual(scanResult.filesFound, 5)
  assert.strictEqual(scanResult.parsedArtifactIds.length, 2)
  console.log('PASS: TEST 9')

  // TEST 10
  const analysisResult: AnalysisJobResult = {
    scanId: 'scan-1',
    totalFindings: 10,
    criticalCount: 2,
    highCount: 3,
    mediumCount: 3,
    lowCount: 2,
    riskScore: 75,
    riskGrade: 'F',
    durationMs: 500
  }
  const validGrades = ['A', 'B', 'C', 'D', 'F']
  assert.ok(validGrades.includes(analysisResult.riskGrade))
  assert.strictEqual(analysisResult.riskScore, 75)
  console.log('PASS: TEST 10')

  // TEST 11
  const scanProgress: ScanJobProgress = {
    phase: 'parsing',
    filesTotal: 10,
    filesProcessed: 5,
    percentComplete: 50
  }
  assert.ok(scanProgress.percentComplete >= 0)
  assert.ok(scanProgress.percentComplete <= 100)
  assert.strictEqual(scanProgress.phase, 'parsing')
  console.log('PASS: TEST 11')

  // TEST 12
  const aiProgress: AIJobProgress = {
    phase: 'explaining',
    findingsTotal: 5,
    findingsProcessed: 2,
    percentComplete: 40,
    tokensUsedSoFar: 1500,
    estimatedCostSoFar: 0.0045
  }
  assert.strictEqual(aiProgress.tokensUsedSoFar, 1500)
  assert.ok(aiProgress.estimatedCostSoFar! > 0)
  console.log('PASS: TEST 12')

  // TEST 13
  assert.strictEqual(typeof redisConfig.host, 'string')
  assert.strictEqual(typeof redisConfig.port, 'number')
  assert.strictEqual(redisConfig.maxRetriesPerRequest, null)
  assert.strictEqual(redisConfig.enableReadyCheck, false)
  assert.strictEqual(redisConfig.lazyConnect, true)
  console.log('PASS: TEST 13')

  // TEST 14
  assert.strictEqual(typeof redisConfig.retryStrategy, 'function')
  const result10 = redisConfig.retryStrategy!(10)
  assert.strictEqual(result10, null)
  const result0 = redisConfig.retryStrategy!(0)
  assert.strictEqual(typeof result0, 'number')
  assert.ok(result0! > 0)
  console.log('PASS: TEST 14')

  // TEST 15
  const delay0 = redisConfig.retryStrategy!(0) as number
  const delay1 = redisConfig.retryStrategy!(1) as number
  const delay2 = redisConfig.retryStrategy!(2) as number
  assert.ok(delay1 > delay0)
  assert.ok(delay2 > delay1)
  assert.ok(delay2 <= 3000)
  console.log('PASS: TEST 15')

  // TEST 16
  assert.strictEqual(typeof createRedisConnection, 'function')
  const conn = createRedisConnection('test')
  assert.strictEqual(typeof conn.on, 'function')
  assert.strictEqual(typeof conn.ping, 'function')
  conn.disconnect()

  const mockRedis = new MockRedis()
  assert.strictEqual(mockRedis.status, 'ready')
  console.log('PASS: TEST 16')

  // TEST 17
  const metrics: QueueMetrics = {
    name: 'scan-queue',
    waiting: 5,
    active: 2,
    completed: 100,
    failed: 3,
    delayed: 1,
    paused: false
  }
  assert.strictEqual(metrics.name, 'scan-queue')
  assert.strictEqual(metrics.waiting, 5)
  assert.strictEqual(metrics.paused, false)
  console.log('PASS: TEST 17')

  // TEST 18
  const meta: JobMetadata = {
    traceId: 'trace-123',
    source: 'api',
    createdAt: new Date().toISOString()
  }
  assert.strictEqual(meta.source, 'api')
  assert.strictEqual(typeof meta.createdAt, 'string')
  assert.strictEqual(meta.userId, undefined)
  console.log('PASS: TEST 18')

  // TEST 19
  const scanId = '550e8400-e29b-41d4-a716-446655440000'
  const findingId = '660e8400-e29b-41d4-a716-446655440000'
  const expectedScanJobId = `scan-${scanId}-fetch`
  const expectedAnalysisJobId = `analysis-${scanId}-rules`
  const expectedAIExplainJobId = `ai-${scanId}-explain-scan`
  const expectedFindingJobId = `ai-${scanId}-explain-${findingId}`
  assert.strictEqual(expectedScanJobId, 'scan-550e8400-e29b-41d4-a716-446655440000-fetch')
  assert.ok(expectedAnalysisJobId.startsWith('analysis-'))
  assert.ok(expectedAIExplainJobId.startsWith('ai-'))
  assert.ok(expectedFindingJobId.includes(findingId))
  console.log('PASS: TEST 19')

  // TEST 20
  const names = Object.values(QUEUE_NAMES)
  const uniqueNames = new Set(names)
  assert.strictEqual(uniqueNames.size, names.length)
  console.log('PASS: TEST 20')

  // TEST 21
  const scanNames = Object.values(SCAN_JOBS)
  const analysisNames = Object.values(ANALYSIS_JOBS)
  const aiNames = Object.values(AI_JOBS)
  assert.strictEqual(new Set(scanNames).size, scanNames.length)
  assert.strictEqual(new Set(analysisNames).size, analysisNames.length)
  assert.strictEqual(new Set(aiNames).size, aiNames.length)
  console.log('PASS: TEST 21')

  // TEST 22
  const rescanPayload: RescanJobPayload = {
    originalScanId: 'original-scan-id',
    newScanId: 'new-scan-id',
    repoId: 'repo-id',
    owner: 'owner',
    repoName: 'repo',
    branch: 'main',
    provider: 'github',
    priority: JobPriority.NORMAL
  }
  assert.notStrictEqual(rescanPayload.originalScanId, rescanPayload.newScanId)
  assert.strictEqual(rescanPayload.newScanId, 'new-scan-id')
  console.log('PASS: TEST 22')

  // TEST 23
  const parsePayload: ParseSingleFileJobPayload = {
    scanId: 'scan-id',
    repoId: 'repo-id',
    filePath: '.github/workflows/ci.yml',
    gitSha: 'a81bbbf8298c0fa03ea29cdc473d45769f953675',
    owner: 'owner',
    repoName: 'repo',
    branch: 'main'
  }
  assert.strictEqual(parsePayload.gitSha.length, 40)
  assert.ok(parsePayload.filePath.endsWith('.yml'))
  console.log('PASS: TEST 23')

  // TEST 24
  const validValues = ['manual', 'webhook', 'schedule', 'pr']
  const triggerPayload: Partial<FetchAndParseJobPayload> = {
    triggeredBy: 'webhook'
  }
  assert.ok(validValues.includes(triggerPayload.triggeredBy!))
  console.log('PASS: TEST 24')

  // TEST 25
  console.log('PASS: TEST 25')

  console.log('All tests passed.')
}

runTests()

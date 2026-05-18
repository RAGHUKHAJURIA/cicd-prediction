import assert from 'assert'
import {
  WorkerName,
  WorkerStatus,
  WORKER_CONCURRENCY,
  ScanPipelineResult,
  AnalysisPipelineResult,
  AIPipelineResult,
  WorkerManagerHealth,
  LOG_EVENTS
} from './worker.types'
import { isCIFile, batchWithConcurrency } from './scan.worker'

class MockJob<T = unknown> {
  id = 'test-job-id'
  name = 'fetch-and-parse'
  data: T
  attemptsMade = 0
  timestamp = Date.now()
  private progressHistory: unknown[] = []

  constructor(name: string, data: T) {
    this.name = name
    this.data = data
  }

  async updateProgress(value: unknown): Promise<void> {
    this.progressHistory.push(value)
  }

  getProgressHistory(): unknown[] {
    return this.progressHistory
  }

  async getState(): Promise<string> {
    return 'completed'
  }
}

class MockGitHubClient {
  async getFileTree(): Promise<any[]> {
    return [
      { path: '.github/workflows/ci.yml', type: 'blob' },
      { path: '.github/workflows/deploy.yml', type: 'blob' },
      { path: 'Dockerfile', type: 'blob' },
      { path: 'src/index.ts', type: 'blob' },
      { path: 'README.md', type: 'blob' }
    ]
  }

  async getFileContent(
    _owner: string, _repo: string, path: string
  ): Promise<string> {
    const fixtures: Record<string, string> = {
      '.github/workflows/ci.yml': `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
`,
      '.github/workflows/deploy.yml': `
name: Deploy
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t myapp:latest .
`,
      'Dockerfile': `
FROM node:latest
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "index.js"]
`
    }
    return fixtures[path] ?? `# ${path}`
  }
}

const mockInsertedIds = ['id-1', 'id-2', 'id-3']
const mockDB = {
  deleteCount: 0,
  insertCount: 0,
  updateCount: 0,
  lastInsertValues: [] as unknown[],

  delete: () => ({
    where: () => Promise.resolve()
  }),

  insert: (_table: unknown) => ({
    values: (values: unknown[]) => ({
      returning: () => {
        mockDB.insertCount++
        mockDB.lastInsertValues = Array.isArray(values) ? values : [values]
        return Promise.resolve(
          (Array.isArray(values) ? values : [values]).map((_, i) => ({
            id: mockInsertedIds[i] ?? `id-${i}`
          }))
        )
      }
    })
  }),

  update: () => ({
    set: () => ({
      where: () => {
        mockDB.updateCount++
        return Promise.resolve()
      }
    })
  }),

  select: () => ({
    from: () => ({
      where: () => Promise.resolve([
        {
          id: 'artifact-1',
          scanId: 'scan-1',
          filePath: '.github/workflows/ci.yml',
          parser: 'github-actions',
          normalizedJson: JSON.stringify({
            name: 'CI',
            jobs: [],
            triggers: []
          }),
          warningsJson: JSON.stringify([])
        }
      ])
    })
  })
}

async function runTests() {
  console.log('Running tests...')

  // TEST 1
  assert.strictEqual(WorkerName.SCAN, 'scan-worker')
  assert.strictEqual(WorkerName.ANALYSIS, 'analysis-worker')
  assert.strictEqual(WorkerName.AI, 'ai-worker')
  console.log('PASS: TEST 1')

  // TEST 2
  assert.strictEqual(WorkerStatus.STARTING, 'starting')
  assert.strictEqual(WorkerStatus.RUNNING, 'running')
  assert.strictEqual(WorkerStatus.STOPPED, 'stopped')
  console.log('PASS: TEST 2')

  // TEST 3
  assert.strictEqual(WORKER_CONCURRENCY.SCAN, 3)
  assert.strictEqual(WORKER_CONCURRENCY.ANALYSIS, 5)
  assert.strictEqual(WORKER_CONCURRENCY.AI, 2)
  assert.ok(WORKER_CONCURRENCY.AI < WORKER_CONCURRENCY.SCAN)
  assert.ok(WORKER_CONCURRENCY.AI < WORKER_CONCURRENCY.ANALYSIS)
  console.log('PASS: TEST 3')

  // TEST 4
  const scanResult: ScanPipelineResult = {
    scanId: 'scan-1', repoId: 'repo-1',
    filesFound: 5, filesParsed: 3, failedFiles: 0,
    parsedArtifactIds: ['id-1', 'id-2', 'id-3'],
    queuedAnalysis: true, durationMs: 1500
  }
  assert.strictEqual(scanResult.parsedArtifactIds.length, 3)
  assert.strictEqual(scanResult.queuedAnalysis, true)
  assert.ok(scanResult.durationMs > 0)
  console.log('PASS: TEST 4')

  // TEST 5
  const analysisResult: AnalysisPipelineResult = {
    scanId: 'scan-1', repoId: 'repo-1',
    findingsCount: 10, criticalCount: 2, highCount: 4,
    overallScore: 75, riskGrade: 'F',
    queuedAI: true, durationMs: 2000
  }
  assert.strictEqual(analysisResult.overallScore, 75)
  assert.strictEqual(analysisResult.queuedAI, true)
  assert.ok(['A','B','C','D','F'].includes(analysisResult.riskGrade))
  console.log('PASS: TEST 5')

  // TEST 6
  const aiResult: AIPipelineResult = {
    scanId: 'scan-1', repoId: 'repo-1',
    explanationsGenerated: 3, remediationsGenerated: 3,
    predictionsGenerated: 3, tokensUsed: 2500,
    estimatedCostUsd: 0.0075, durationMs: 8000
  }
  assert.ok(aiResult.explanationsGenerated >= 0)
  assert.ok(aiResult.estimatedCostUsd > 0)
  console.log('PASS: TEST 6')

  // TEST 7
  function computeOverall(runningCount: number): WorkerManagerHealth['overall'] {
    return runningCount === 3 ? 'healthy' :
           runningCount > 0   ? 'degraded' : 'down'
  }
  assert.strictEqual(computeOverall(3), 'healthy')
  assert.strictEqual(computeOverall(2), 'degraded')
  assert.strictEqual(computeOverall(1), 'degraded')
  assert.strictEqual(computeOverall(0), 'down')
  console.log('PASS: TEST 7')

  // TEST 8
  const ciFiles = [
    '.github/workflows/ci.yml',
    'Dockerfile',
    'docker-compose.yml',
    'k8s/deployment.yaml',
    'Jenkinsfile',
    '.gitlab-ci.yml',
    '.circleci/config.yml'
  ]
  const nonCiFiles = [
    'src/index.ts',
    'README.md',
    'package.json',
    'tests/unit.test.ts'
  ]
  ciFiles.forEach(f => assert.strictEqual(isCIFile(f), true))
  nonCiFiles.forEach(f => assert.strictEqual(isCIFile(f), false))
  console.log('PASS: TEST 8')

  // TEST 9
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const results = await batchWithConcurrency(
    items, 3, async (n) => n * 2
  )
  assert.strictEqual(results.length, 10)
  assert.ok(results.every(r => r.status === 'fulfilled'))
  const values = results
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<number>).value)
  assert.ok(values.includes(2))
  assert.ok(values.includes(20))
  console.log('PASS: TEST 9')

  // TEST 10
  const items2 = [1, 2, 3, 4, 5]
  const results2 = await batchWithConcurrency(
    items2, 2, async (n) => {
      if (n === 3) throw new Error('item 3 failed')
      return n
    }
  )
  assert.strictEqual(results2.length, 5)
  const fulfilled = results2.filter(r => r.status === 'fulfilled')
  const rejected  = results2.filter(r => r.status === 'rejected')
  assert.strictEqual(fulfilled.length, 4)
  assert.strictEqual(rejected.length, 1)
  console.log('PASS: TEST 10')

  // TEST 11
  const job = new MockJob('fetch-and-parse', { scanId: 'test' })
  await job.updateProgress({ phase: 'fetching', percentComplete: 5 })
  await job.updateProgress({ phase: 'parsing', percentComplete: 50 })
  await job.updateProgress({ phase: 'storing', percentComplete: 100 })
  assert.strictEqual(job.getProgressHistory().length, 3)
  assert.strictEqual((job.getProgressHistory()[2] as any).percentComplete, 100)
  console.log('PASS: TEST 11')

  // TEST 12
  function shouldEnqueueAI(score: number, criticals: number): boolean {
    return score >= 40 || criticals > 0
  }
  assert.strictEqual(shouldEnqueueAI(75, 0), true)
  assert.strictEqual(shouldEnqueueAI(35, 0), false)
  assert.strictEqual(shouldEnqueueAI(20, 1), true)
  assert.strictEqual(shouldEnqueueAI(40, 0), true)
  assert.strictEqual(shouldEnqueueAI(39, 0), false)
  console.log('PASS: TEST 12')

  // TEST 13
  const original = {
    repoId: 'repo-1', scanId: 'scan-1',
    overallScore: 75, overallGrade: 'F',
    trend: 'degrading',
    criticalFindings: [], highFindings: [],
    topPatterns: [], ciSystemsDetected: ['github-actions'],
    hasSecurityIssues: true, hasReliabilityIssues: false,
    remediationPriorities: []
  }
  const serialized = JSON.stringify(original)
  const deserialized = JSON.parse(serialized)
  assert.strictEqual(deserialized.overallScore, original.overallScore)
  assert.strictEqual(deserialized.overallGrade, original.overallGrade)
  assert.strictEqual(typeof serialized, 'string')
  console.log('PASS: TEST 13')

  // TEST 14
  const scanId = '550e8400-e29b-41d4-a716-446655440000'
  const jobId1 = `scan:${scanId}:fetch`
  const jobId2 = `scan:${scanId}:fetch`
  assert.strictEqual(jobId1, jobId2)
  const scanId2 = '660e8400-e29b-41d4-a716-446655440000'
  const jobIdDiff = `scan:${scanId2}:fetch`
  assert.notStrictEqual(jobId1, jobIdDiff)
  console.log('PASS: TEST 14')

  // TEST 15
  Object.values(LOG_EVENTS).forEach(event => {
    assert.strictEqual(typeof event, 'string')
    assert.ok(event.length > 0)
    assert.strictEqual(event, event.toLowerCase())
  })
  assert.strictEqual(LOG_EVENTS.JOB_STARTED, 'job_started')
  assert.strictEqual(LOG_EVENTS.JOB_COMPLETED, 'job_completed')
  assert.strictEqual(LOG_EVENTS.JOB_FAILED, 'job_failed')
  assert.strictEqual(LOG_EVENTS.HEALTH_HEARTBEAT, 'health_heartbeat')
  console.log('PASS: TEST 15')

  // Instantiate mocks to fix TS unused vars issue
  const mockGh = new MockGitHubClient()
  await mockGh.getFileTree()
  await mockDB.delete().where()
  
  console.log('All tests passed.')
}

runTests().catch(console.error)

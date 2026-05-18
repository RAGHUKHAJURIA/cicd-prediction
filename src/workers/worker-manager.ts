import { ScanWorker } from './scan.worker'
import { AnalysisWorker } from './analysis.worker'
import { AIWorker } from './ai.worker'
import { closeQueues } from '../queue/queue.definitions'
import { closeRedisConnections } from '../queue/redis.client'
import { WorkerStatus, LOG_EVENTS, WorkerManagerHealth } from './worker.types'

export class WorkerManager {
  private scanWorker:     ScanWorker
  private analysisWorker: AnalysisWorker
  private aiWorker:       AIWorker
  private startedAt:      number = 0
  private heartbeatTimer: NodeJS.Timeout | null = null

  constructor() {
    this.scanWorker     = new ScanWorker()
    this.analysisWorker = new AnalysisWorker()
    this.aiWorker       = new AIWorker()
  }

  async startAll(): Promise<void> {
    console.log(JSON.stringify({
      event: LOG_EVENTS.WORKER_STARTED,
      message: 'Starting all workers',
      timestamp: new Date().toISOString()
    }))

    this.startedAt = Date.now()

    this.scanWorker.start()
    this.analysisWorker.start()
    this.aiWorker.start()

    this.startHealthHeartbeat()
    this.registerProcessSignals()

    console.log(JSON.stringify({
      event: 'all_workers_started',
      workers: ['scan-worker', 'analysis-worker', 'ai-worker'],
      timestamp: new Date().toISOString()
    }))
  }

  async stopAll(): Promise<void> {
    console.log(JSON.stringify({
      event: LOG_EVENTS.SHUTDOWN_STARTED,
      timestamp: new Date().toISOString()
    }))

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }

    await Promise.allSettled([
      this.scanWorker.stop(),
      this.analysisWorker.stop(),
      this.aiWorker.stop()
    ])

    await closeQueues()
    await closeRedisConnections()

    console.log(JSON.stringify({
      event: LOG_EVENTS.SHUTDOWN_COMPLETED,
      timestamp: new Date().toISOString()
    }))
  }

  async getHealth(): Promise<WorkerManagerHealth> {
    const [scanHealth, analysisHealth, aiHealth] = await Promise.all([
      this.scanWorker.getHealth(),
      this.analysisWorker.getHealth(),
      this.aiWorker.getHealth()
    ])

    const workers = [scanHealth, analysisHealth, aiHealth]
    const runningCount = workers.filter(
      w => w.status === WorkerStatus.RUNNING
    ).length

    const overall: WorkerManagerHealth['overall'] =
      runningCount === 3 ? 'healthy' :
      runningCount > 0   ? 'degraded' : 'down'

    return {
      overall,
      workers,
      uptimeSeconds: this.startedAt
        ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      timestamp: new Date().toISOString()
    }
  }

  private startHealthHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      const health = await this.getHealth()
      console.log(JSON.stringify({
        event:  LOG_EVENTS.HEALTH_HEARTBEAT,
        ...health
      }))
    }, 30_000)

    this.heartbeatTimer.unref()
  }

  private registerProcessSignals(): void {
    process.on('SIGTERM', async () => {
      console.log(JSON.stringify({
        event: 'signal_received', signal: 'SIGTERM',
        timestamp: new Date().toISOString()
      }))
      await this.stopAll()
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      console.log(JSON.stringify({
        event: 'signal_received', signal: 'SIGINT',
        timestamp: new Date().toISOString()
      }))
      await this.stopAll()
      process.exit(0)
    })

    process.on('uncaughtException', async (err) => {
      console.error(JSON.stringify({
        event: 'uncaught_exception',
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      }))
      await this.stopAll()
      process.exit(1)
    })

    process.on('unhandledRejection', async (reason) => {
      console.error(JSON.stringify({
        event: 'unhandled_rejection',
        reason: String(reason),
        timestamp: new Date().toISOString()
      }))
      await this.stopAll()
      process.exit(1)
    })
  }
}

if (require.main === module) {
  const manager = new WorkerManager()
  manager.startAll().catch(err => {
    console.error(JSON.stringify({
      event: 'worker_manager_fatal',
      error: err.message,
      timestamp: new Date().toISOString()
    }))
    process.exit(1)
  })
}

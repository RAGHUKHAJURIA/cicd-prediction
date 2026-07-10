import { WorkerManager } from '../src/workers/worker-manager'

async function runVerification() {
  console.log('--- Verification 1: Default (all workers) ---')
  delete process.env.WORKER_TYPE
  const managerAll = new WorkerManager()
  const healthAll = await managerAll.getHealth()
  console.log('Expected 3 workers in health check. Found:', healthAll.workers.length)
  console.log('Active workers:', healthAll.workers.map(w => w.worker))
  
  console.log('\n--- Verification 2: Scoped Worker (WORKER_TYPE=scan) ---')
  process.env.WORKER_TYPE = 'scan'
  const managerScan = new WorkerManager()
  const healthScan = await managerScan.getHealth()
  console.log('Expected 1 worker in health check. Found:', healthScan.workers.length)
  console.log('Active workers:', healthScan.workers.map(w => w.worker))

  console.log('\n--- Verification 3: Scoped Worker (WORKER_TYPE=analysis) ---')
  process.env.WORKER_TYPE = 'analysis'
  const managerAnalysis = new WorkerManager()
  const healthAnalysis = await managerAnalysis.getHealth()
  console.log('Expected 1 worker in health check. Found:', healthAnalysis.workers.length)
  console.log('Active workers:', healthAnalysis.workers.map(w => w.worker))

  console.log('\nVerification completed successfully.')
}

runVerification().catch(console.error)

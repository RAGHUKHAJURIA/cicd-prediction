import { NormalizedWorkflow, WorkflowSource, StepType, ActionRefType, RunnerType, TriggerType } from './workflow.model';

const mock: NormalizedWorkflow = {
  id: 'test-001',
  source: WorkflowSource.GITHUB_ACTIONS,
  sourceFile: '.github/workflows/ci.yml',
  repoId: 'repo-123',
  parsedAt: new Date(),
  triggers: [{ type: TriggerType.PUSH, branches: ['main'], paths: [], schedule: null }],
  globalEnv: [],
  globalSecrets: [],
  permissions: [],
  metadata: {
    name: 'CI Pipeline',
    description: null,
    totalJobs: 1,
    totalSteps: 2,
    hasDockerImages: false,
    hasSecrets: false,
    hasExternalActions: true,
    ciSystem: 'github-actions'
  },
  jobs: [
    {
      id: 'build',
      name: 'Build',
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
      container: null,
      steps: [
        {
          id: 'step-1',
          name: 'Checkout',
          type: StepType.ACTION,
          run: null,
          uses: 'actions/checkout@v3',
          actionRef: {
            owner: 'actions',
            repo: 'checkout',
            ref: 'v3',
            refType: ActionRefType.TAG,
            isThirdParty: false,
            isPinned: false
          },
          with: {},
          env: [],
          conditions: [],
          continueOnError: false,
          timeoutMinutes: null
        }
      ]
    }
  ]
};

console.log('Mock object valid:', mock.metadata.ciSystem);
console.log('Job count:', mock.jobs.length);
console.log('Is action pinned:', mock.jobs[0].steps[0].actionRef?.isPinned);
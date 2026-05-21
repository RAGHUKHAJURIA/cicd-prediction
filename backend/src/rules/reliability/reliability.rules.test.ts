import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { NormalizedWorkflow, WorkflowSource, RunnerType, StepType } from '../../models/workflow.model';
import { RuleContext, RuleCategory, RuleSeverity, RuleResult } from '../types';
import { ruleRegistry } from '../rule-registry';
import { defaultRuleConfig } from '../rule-runner';

// Import all reliability rules to trigger self-registration
import { registerAllReliabilityRules } from './index';
registerAllReliabilityRules();

// Import security index to ensure all 11 are registered
import '../security';

function buildMockWorkflow(overrides: any = {}): NormalizedWorkflow {
  return {
    id: uuidv4(),
    source: WorkflowSource.GITHUB_ACTIONS,
    sourceFile: '.github/workflows/ci.yml',
    repoId: 'repo-1',
    parsedAt: new Date(),
    jobs: [],
    triggers: [],
    globalEnv: [],
    globalSecrets: [],
    permissions: [],
    metadata: {
      name: 'CI',
      description: null,
      totalJobs: 0,
      totalSteps: 0,
      hasDockerImages: false,
      hasSecrets: false,
      hasExternalActions: false,
      ciSystem: 'github-actions',
    },
    ...overrides,
  };
}

function buildMockContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    repoId: 'repo-1',
    scanId: 'scan-1',
    filePath: '.github/workflows/ci.yml',
    ciSystem: 'github-actions',
    config: defaultRuleConfig,
    allWorkflows: [],
    repoMetadata: { name: 'test', provider: 'github', defaultBranch: 'main', isMonorepo: false },
    ...overrides,
  };
}

const ruleEngine = {
  check: (ruleId: string, wf: NormalizedWorkflow): RuleResult[] => {
    const rule = ruleRegistry.getById(ruleId);
    if (!rule) throw new Error(`Rule ${ruleId} not found`);
    return rule.check(wf, buildMockContext({ allWorkflows: [wf] }));
  }
};

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  FAIL  ${name}\n        ${e.message}`);
    failed++;
  }
}

console.log('\nRunning Reliability Rules Tests...\n');

// TEST 1 — floating-docker-tag detects latest tag
test('TEST 1 — floating-docker-tag detects latest tag', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], 
      container: { image: 'node:latest', imageRef: { registry: null, image: 'node', tag: 'latest', digest: null, isFloating: true, isPinned: false }, env: [], ports: [], volumes: [] }
    }]
  });
  const findings = ruleEngine.check('reliability-floating-docker-tag', wf);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.HIGH);
  assert.strictEqual(findings[0].ruleId, 'reliability-floating-docker-tag');
});

// TEST 2 — floating-docker-tag detects missing tag
test('TEST 2 — floating-docker-tag detects missing tag', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], 
      container: { image: 'nginx', imageRef: { registry: null, image: 'nginx', tag: null, digest: null, isFloating: true, isPinned: false }, env: [], ports: [], volumes: [] }
    }]
  });
  const findings = ruleEngine.check('reliability-floating-docker-tag', wf);
  assert.strictEqual(findings.length, 1);
});

// TEST 3 — floating-docker-tag passes specific tag
test('TEST 3 — floating-docker-tag passes specific tag', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], 
      container: { image: 'node:18-alpine', imageRef: { registry: null, image: 'node', tag: '18-alpine', digest: null, isFloating: false, isPinned: true }, env: [], ports: [], volumes: [] }
    }]
  });
  // Note: the rule actually checks if it's pinned when isFloating is false. 
  // For the test, we set isPinned to true to avoid the MEDIUM severity unpinned finding.
  const findings = ruleEngine.check('reliability-floating-docker-tag', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 4 — floating-docker-tag checks service containers too
test('TEST 4 — floating-docker-tag checks service containers too', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [
        { name: 'postgres', container: { image: 'postgres:latest', imageRef: { registry: null, image: 'postgres', tag: 'latest', digest: null, isFloating: true, isPinned: false }, env: [], ports: [], volumes: [] } }
      ], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-floating-docker-tag', wf);
  assert.ok(findings.length >= 1);
});

// TEST 5 — missing-timeout flags job with null timeout
test('TEST 5 — missing-timeout flags job with null timeout', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'echo', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  // make step not echo-only by making it 'ls'
  wf.jobs[0].steps[0].run = 'ls';
  const findings = ruleEngine.check('reliability-missing-timeout', wf);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].ruleId, 'reliability-missing-timeout');
});

// TEST 6 — missing-timeout passes job with timeout set
test('TEST 6 — missing-timeout passes job with timeout set', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'ls', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: 30, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-missing-timeout', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 7 — missing-timeout flags dangerously high timeout
test('TEST 7 — missing-timeout flags dangerously high timeout', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'ls', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: 720, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-missing-timeout', wf);
  assert.ok(findings.length >= 1);
});

// TEST 8 — missing-retry flags deployment job without retry
test('TEST 8 — missing-retry flags deployment job without retry', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'deploy-production', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-missing-retry', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'reliability-missing-retry');
});

// TEST 9 — missing-retry passes non-deployment job
test('TEST 9 — missing-retry passes non-deployment job', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'run-unit-tests', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'echo', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-missing-retry', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 10 — missing-rollback flags deploy job with no rollback step
test('TEST 10 — missing-rollback flags deploy job with no rollback step', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'deploy', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'kubectl apply -f deployment.yaml', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-missing-rollback', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'reliability-missing-rollback');
});

// TEST 11 — missing-rollback passes when rollback step exists
test('TEST 11 — missing-rollback passes when rollback step exists', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'deploy', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'kubectl apply -f deployment.yaml', env: [], with: {} }, { id: 's2', name: 's2', type: StepType.RUN, run: 'kubectl rollout undo deployment/app', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  // Rule check looks at the whole workflow for rollbacks.
  // One finding might still be there for "no failure handling", but the "no rollback mechanism" finding should be 0.
  const findings = ruleEngine.check('reliability-missing-rollback', wf);
  const rollbackFindings = findings.filter(f => f.title.includes('has no rollback mechanism'));
  assert.strictEqual(rollbackFindings.length, 0);
});

// TEST 12 — flaky-install detects bare npm install
test('TEST 12 — flaky-install detects bare npm install', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'npm install', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-flaky-install', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'reliability-flaky-install');
});

// TEST 13 — flaky-install passes npm ci
test('TEST 13 — flaky-install passes npm ci', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'npm ci', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-flaky-install', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 14 — flaky-install passes npm install with package name
test('TEST 14 — flaky-install passes npm install with package name', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'npm install lodash', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-flaky-install', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 15 — flaky-install detects yarn install without frozen-lockfile
test('TEST 15 — flaky-install detects yarn install without frozen-lockfile', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'yarn install', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-flaky-install', wf);
  assert.ok(findings.length >= 1);
});

// TEST 16 — flaky-install passes yarn install --frozen-lockfile
test('TEST 16 — flaky-install passes yarn install --frozen-lockfile', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'yarn install --frozen-lockfile', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-flaky-install', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 17 — flaky-install detects pip install without versions
test('TEST 17 — flaky-install detects pip install without versions', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'pip install requests flask', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-flaky-install', wf);
  assert.ok(findings.length >= 1);
});

// TEST 18 — missing-healthcheck flags Dockerfile without healthcheck
test('TEST 18 — missing-healthcheck flags Dockerfile without healthcheck', () => {
  const wf = buildMockWorkflow({
    source: WorkflowSource.DOCKERFILE,
    metadata: { name: 'CI', description: null, totalJobs: 0, totalSteps: 0, hasDockerImages: false, hasSecrets: false, hasExternalActions: false, ciSystem: 'github-actions', hasHealthcheck: false }
  });
  const findings = ruleEngine.check('reliability-missing-healthcheck', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'reliability-missing-healthcheck');
});

// TEST 19 — missing-healthcheck flags services without wait
test('TEST 19 — missing-healthcheck flags services without wait', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'npm test', env: [], with: {} }], needs: [], env: [], secrets: [], services: [{ name: 'postgres', container: { image: 'postgres:latest', imageRef: { registry: null, image: 'postgres', tag: 'latest', digest: null, isFloating: true, isPinned: false }, env: [], ports: [], volumes: [] } }], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('reliability-missing-healthcheck', wf);
  assert.ok(findings.length >= 1);
});

// TEST 20 — all 11 rules are registered in ruleRegistry after import
test('TEST 20 — all 11 rules are registered in ruleRegistry after import', () => {
  const securityRules = ruleRegistry.getByCategory(RuleCategory.SECURITY);
  const reliabilityRules = ruleRegistry.getByCategory(RuleCategory.RELIABILITY);
  assert.strictEqual(securityRules.length, 5);
  assert.strictEqual(reliabilityRules.length, 6);
  assert.ok(ruleRegistry.count() >= 11);
});

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);

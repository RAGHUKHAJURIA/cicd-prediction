import assert from 'assert';
import { v4 as uuidv4 } from 'uuid';
import { NormalizedWorkflow, WorkflowSource, RunnerType, StepType, ActionRefType, TriggerType, PermissionAccess } from '../../models/workflow.model';
import { RuleContext, RuleSeverity, RuleResult } from '../types';
import { ruleRegistry } from '../rule-registry';
import { defaultRuleConfig } from '../rule-runner';

// Import all security rules to trigger self-registration
import { registerAllSecurityRules } from './index';
registerAllSecurityRules();

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

console.log('\nRunning Security Rules Tests...\n');

// TEST 1 — secret-exposure detects GitHub PAT in env value
test('TEST 1 — secret-exposure detects GitHub PAT in env value', () => {
  const wf = buildMockWorkflow({
    globalEnv: [{ key: 'TOKEN', value: 'ghp_abc123defgh456ijklmn789opqrst0123456', isDynamic: false, containsSecret: false }]
  });
  const findings = ruleEngine.check('security-secret-exposure', wf);
  assert.ok(findings.length >= 1, 'Should find at least 1 secret');
  assert.strictEqual(findings[0].severity, RuleSeverity.CRITICAL);
  assert.strictEqual(findings[0].evidence.includes('ghp_abc123defgh456ijklmn789opqrst0123456'), false);
  assert.strictEqual(findings[0].evidence.includes('ghp_****'), true);
});

// TEST 2 — secret-exposure detects AWS key in run command
test('TEST 2 — secret-exposure detects AWS key in run command', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'aws configure set aws_access_key_id AKIAIOSFODNN7EXAMPLE', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-secret-exposure', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'security-secret-exposure');
});

// TEST 3 — secret-exposure skips expression references
test('TEST 3 — secret-exposure skips expression references', () => {
  const wf = buildMockWorkflow({
    globalEnv: [{ key: 'TOKEN', value: '${{ secrets.MY_TOKEN }}', isDynamic: true, containsSecret: true }]
  });
  const findings = ruleEngine.check('security-secret-exposure', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 4 — secret-exposure detects private key header
test('TEST 4 — secret-exposure detects private key header', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'echo "-----BEGIN RSA PRIVATE KEY-----"', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-secret-exposure', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.CRITICAL);
});

// TEST 5 — unpinned-actions flags tag ref
test('TEST 5 — unpinned-actions flags tag ref', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.ACTION, uses: 'actions/checkout@v4', actionRef: { owner: 'actions', repo: 'checkout', ref: 'v4', refType: ActionRefType.TAG, isPinned: false, isThirdParty: false }, env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-unpinned-action', wf);
  assert.strictEqual(findings.length, 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.HIGH);
});

// TEST 6 — unpinned-actions flags third-party as CRITICAL
test('TEST 6 — unpinned-actions flags third-party as CRITICAL', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.ACTION, uses: 'some-company/some-action@main', actionRef: { owner: 'some-company', repo: 'some-action', ref: 'main', refType: ActionRefType.BRANCH, isPinned: false, isThirdParty: true }, env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-unpinned-action', wf);
  assert.strictEqual(findings[0].severity, RuleSeverity.CRITICAL);
});

// TEST 7 — unpinned-actions passes SHA-pinned action
test('TEST 7 — unpinned-actions passes SHA-pinned action', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.ACTION, uses: 'actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675', actionRef: { owner: 'actions', repo: 'checkout', ref: 'a81bbbf8298c0fa03ea29cdc473d45769f953675', refType: ActionRefType.SHA, isPinned: true, isThirdParty: false }, env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-unpinned-action', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 8 — unpinned-actions skips local actions
test('TEST 8 — unpinned-actions skips local actions', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.ACTION, uses: './local-action', actionRef: null, env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-unpinned-action', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 9 — privilege-escalation detects curl pipe bash
test('TEST 9 — privilege-escalation detects curl pipe bash', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'curl -sSL https://example.com/install.sh | bash', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-privilege-escalation', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.HIGH);
});

// TEST 10 — privilege-escalation detects chmod 777
test('TEST 10 — privilege-escalation detects chmod 777', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'chmod 777 /app', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-privilege-escalation', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.MEDIUM);
});

// TEST 11 — privilege-escalation detects sudo
test('TEST 11 — privilege-escalation detects sudo', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [{ id: 's1', name: 's1', type: StepType.RUN, run: 'sudo apt-get install -y curl', env: [], with: {} }], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-privilege-escalation', wf);
  assert.ok(findings.length >= 1);
});

// TEST 12 — untrusted-registry flags unknown registry
test('TEST 12 — untrusted-registry flags unknown registry', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], 
      container: { image: 'some-random-registry.example.com/img:1', imageRef: { registry: 'some-random-registry.example.com', image: 'img', tag: '1', digest: null, isFloating: false, isPinned: false }, env: [], ports: [], volumes: [] }
    }]
  });
  const findings = ruleEngine.check('security-untrusted-registry', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'security-untrusted-registry');
});

// TEST 13 — untrusted-registry passes ghcr.io
test('TEST 13 — untrusted-registry passes ghcr.io', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], 
      container: { image: 'ghcr.io/org/img@sha256:abc', imageRef: { registry: 'ghcr.io', image: 'org/img', tag: null, digest: 'sha256:abc', isFloating: false, isPinned: true }, env: [], ports: [], volumes: [] }
    }]
  });
  const findings = ruleEngine.check('security-untrusted-registry', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 14 — untrusted-registry passes null registry (Docker Hub)
test('TEST 14 — untrusted-registry passes null registry (Docker Hub)', () => {
  const wf = buildMockWorkflow({
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.GITHUB_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], 
      container: { image: 'node@sha256:abc', imageRef: { registry: null, image: 'node', tag: null, digest: 'sha256:abc', isFloating: false, isPinned: true }, env: [], ports: [], volumes: [] }
    }]
  });
  const findings = ruleEngine.check('security-untrusted-registry', wf);
  assert.strictEqual(findings.length, 0);
});

// TEST 15 — insecure-permissions flags no permissions block
test('TEST 15 — insecure-permissions flags no permissions block', () => {
  const wf = buildMockWorkflow({
    source: WorkflowSource.GITHUB_ACTIONS,
    permissions: []
  });
  const findings = ruleEngine.check('security-insecure-permissions', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.MEDIUM);
});

// TEST 16 — insecure-permissions flags write-all
test('TEST 16 — insecure-permissions flags write-all', () => {
  const wf = buildMockWorkflow({
    permissions: [{ scope: '*', access: PermissionAccess.WRITE }]
  });
  const findings = ruleEngine.check('security-insecure-permissions', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].severity, RuleSeverity.CRITICAL);
});

// TEST 17 — insecure-permissions flags self-hosted + pull_request
test('TEST 17 — insecure-permissions flags self-hosted + pull_request', () => {
  const wf = buildMockWorkflow({
    triggers: [{ type: TriggerType.PULL_REQUEST, schedule: null, conditions: null }],
    jobs: [{
      id: 'j1', name: 'j1', steps: [], needs: [], env: [], secrets: [], services: [], runsOn: { type: RunnerType.SELF_HOSTED, labels: [], image: null }, conditions: [], strategy: null, timeoutMinutes: null, continueOnError: false, retryStrategy: null, artifacts: [], container: null
    }]
  });
  const findings = ruleEngine.check('security-insecure-permissions', wf);
  assert.ok(findings.length >= 1);
  assert.strictEqual(findings[0].ruleId, 'security-insecure-permissions');
});

// TEST 18 — insecure-permissions skips GitLab workflows (no permissions concept)
test('TEST 18 — insecure-permissions skips GitLab workflows (no permissions concept)', () => {
  const wf = buildMockWorkflow({
    source: WorkflowSource.GITLAB_CI,
    permissions: []
  });
  const findings = ruleEngine.check('security-insecure-permissions', wf);
  assert.strictEqual(findings.length, 0);
});

console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);

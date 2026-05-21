import {
  BaseRule,
  RuleCategory,
  RuleSeverity,
  RuleConfidence,
  RuleContext,
  RuleResult,
} from '../types';
import type { NormalizedWorkflow } from '../../models/workflow.model';

const CACHEABLE_OPS = [
  {
    name: 'npm dependencies',
    detectPattern: /npm\s+(ci|install)/,
    cachePattern: /node_modules|\.npm|npm-cache/,
    cacheKey: '~/.npm',
    lockFile: 'package-lock.json',
    actionExample: 'actions/cache@v3 with path: ~/.npm'
  },
  {
    name: 'yarn dependencies',
    detectPattern: /yarn\s+(install|)/,
    cachePattern: /yarn|\.yarn/,
    cacheKey: '~/.yarn/cache',
    lockFile: 'yarn.lock',
    actionExample: 'actions/cache@v3 with path: ~/.yarn/cache'
  },
  {
    name: 'pip packages',
    detectPattern: /pip[3]?\s+install/,
    cachePattern: /\.cache\/pip|pip-cache/,
    cacheKey: '~/.cache/pip',
    lockFile: 'requirements*.txt',
    actionExample: 'actions/cache@v3 with path: ~/.cache/pip'
  },
  {
    name: 'Maven repository',
    detectPattern: /mvn\s+|maven/,
    cachePattern: /\.m2|maven/,
    cacheKey: '~/.m2/repository',
    lockFile: 'pom.xml',
    actionExample: 'actions/cache@v3 with path: ~/.m2'
  },
  {
    name: 'Gradle cache',
    detectPattern: /gradle\s+|gradlew/,
    cachePattern: /\.gradle|gradle-cache/,
    cacheKey: '~/.gradle/caches',
    lockFile: 'build.gradle',
    actionExample: 'actions/cache@v3 with path: ~/.gradle'
  },
  {
    name: 'Composer packages',
    detectPattern: /composer\s+install/,
    cachePattern: /composer|vendor/,
    cacheKey: '~/.composer/cache',
    lockFile: 'composer.lock',
    actionExample: 'actions/cache@v3 with path: ~/.composer'
  },
  {
    name: 'Go modules',
    detectPattern: /go\s+mod\s+download|go\s+get/,
    cachePattern: /gopath|go\/pkg/,
    cacheKey: '~/go/pkg/mod',
    lockFile: 'go.sum',
    actionExample: 'actions/cache@v3 with path: ~/go/pkg/mod'
  },
  {
    name: 'Ruby gems',
    detectPattern: /bundle\s+install|gem\s+install/,
    cachePattern: /bundler|gems/,
    cacheKey: 'vendor/bundle',
    lockFile: 'Gemfile.lock',
    actionExample: 'actions/cache@v3 with path: vendor/bundle'
  },
  {
    name: 'Docker layer cache',
    detectPattern: /docker\s+build/,
    cachePattern: /buildx|cache-from|cache-to/,
    cacheKey: 'type=gha',
    lockFile: 'Dockerfile',
    actionExample: 'docker/build-push-action with cache-from: type=gha'
  },
  {
    name: 'Rust/Cargo packages',
    detectPattern: /cargo\s+(build|test|install)/,
    cachePattern: /\.cargo|cargo-cache/,
    cacheKey: '~/.cargo',
    lockFile: 'Cargo.lock',
    actionExample: 'actions/cache@v3 with path: ~/.cargo'
  }
];

export class MissingCacheRule extends BaseRule {
  id = 'performance-missing-cache';
  name = 'Missing Cache for Expensive Operations';
  category = RuleCategory.PERFORMANCE;
  severity = RuleSeverity.LOW;
  description = 'Detects expensive operations (like dependency installations or Docker builds) that have no corresponding cache setup.';
  rationale = 'Caching dependencies between runs is the most effective way to reduce CI pipeline execution time.';

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const findings: RuleResult[] = [];

      for (const job of workflow.jobs) {
        for (const op of CACHEABLE_OPS) {
          let hasOp = false;
          let opEvidence = '';
          let opStepIndex = -1;

          for (let i = 0; i < job.steps.length; i++) {
            const step = job.steps[i];
            if (step.run && op.detectPattern.test(step.run)) {
              hasOp = true;
              opEvidence = step.run;
              opStepIndex = i;
              break;
            }
            if (step.uses && step.uses.toLowerCase().includes(op.name.split(' ')[0].toLowerCase())) {
              hasOp = true;
              opEvidence = step.uses;
              opStepIndex = i;
              break;
            }
          }

          if (hasOp) {
            let hasCache = false;
            
            // Check artifacts
            if (job.artifacts?.some(a => a.type === 'CACHE' && a.paths?.some(p => op.cachePattern.test(p)))) {
              hasCache = true;
            }

            for (let i = 0; i < job.steps.length; i++) {
              const step = job.steps[i];
              if (step.uses && /cache/i.test(step.uses)) {
                hasCache = true;
                break;
              }
              if (step.run && op.cachePattern.test(step.run)) {
                hasCache = true;
                break;
              }
              // Step before install mentions cache
              if (i === opStepIndex - 1 && step.name && /cache/i.test(step.name)) {
                hasCache = true;
                break;
              }
            }

            if (!hasCache) {
              findings.push(this.buildResult({
                title: `Job '${job.name}' runs ${op.name} without caching`,
                description: `Every run reinstalls ${op.name} from scratch. Adding a cache can reduce this job's duration by 60-90%.`,
                remediation: `Configure a cache step:\n${op.actionExample}`,
                evidence: opEvidence,
                confidence: RuleConfidence.CERTAIN,
                metadata: {
                  operation: op.name,
                  suggestedCacheKey: op.cacheKey,
                  estimatedTimeSavedMinutes: 2,
                  lockFile: op.lockFile
                }
              }, this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })));
            }
          }
        }

        // Special Case: Docker layer cache
        for (let i = 0; i < job.steps.length; i++) {
          const step = job.steps[i];
          if (step.uses && /docker\/build-push-action/i.test(step.uses)) {
            const hasCacheFrom = step.with && 'cache-from' in step.with;
            if (!hasCacheFrom) {
              findings.push(this.buildResult({
                title: `Docker build without layer caching`,
                severity: RuleSeverity.MEDIUM,
                description: `Building Docker images from scratch is expensive. Using layer caching can drastically reduce build times.`,
                remediation: `Add 'cache-from' to the docker/build-push-action step:\ncache-from: type=gha\ncache-to: type=gha,mode=max`,
                evidence: step.uses,
                confidence: RuleConfidence.CERTAIN,
                metadata: {
                  operation: 'Docker layer cache'
                }
              }, this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, stepId: step.id, field: `jobs.${job.id}.steps[${i}].with` })));
            }
          }
        }
      }

      return findings;
    });
  }
}

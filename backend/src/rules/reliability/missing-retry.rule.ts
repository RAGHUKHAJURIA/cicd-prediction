import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class MissingRetryRule extends BaseRule {
  id = 'reliability-missing-retry';
  name = 'No Retry Strategy on Flaky or Critical Job';
  category = RuleCategory.RELIABILITY;
  severity = RuleSeverity.LOW;
  description = 'Detects critical, deployment, or network-heavy jobs that lack a retry strategy.';
  rationale = 'Deployment jobs can fail due to transient infrastructure issues. Without retry, a single network hiccup fails the deployment.';
  references = ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      workflow.jobs.forEach(job => {
        if (job.retryStrategy === null) {
          // CHECK 1 — Deployment jobs with no retry
          if (/deploy|release|publish|rollout|apply|push/i.test(job.name)) {
            results.push(
              this.buildResult(
                {
                  title: `Deployment job '${job.name}' has no retry strategy`,
                  description: this.rationale,
                  remediation: `GitHub Actions: Add continue-on-error: false and use a retry action.\nGitLab CI: Add retry: { max: 2, when: [runner_system_failure] }`,
                  evidence: `No retry configuration on deployment job`,
                  confidence: RuleConfidence.POSSIBLE,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
              )
            );
          } 
          // CHECK 2 — Test jobs with no retry
          else if (/test|spec|lint|check|verify|validate/i.test(job.name) && job.steps.length > 5) {
            results.push(
              this.buildResult(
                {
                  title: `Test job '${job.name}' has no retry for flaky test resilience`,
                  description: `Complex test suites often have flaky tests. A retry strategy can reduce false negatives.`,
                  remediation: `Implement retries for the test job or use a test runner that supports retrying failed tests.`,
                  evidence: `Test job with ${job.steps.length} steps`,
                  confidence: RuleConfidence.POSSIBLE,
                  severity: RuleSeverity.LOW
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
              )
            );
          }
          // CHECK 3 — Jobs downloading from external URLs with no retry
          else {
            const downloadsExternal = job.steps.some(step => step.run && (/curl\s+/i.test(step.run) || /wget\s+/i.test(step.run) || /apt-get\s+install/i.test(step.run) || /pip\s+install/i.test(step.run) || /npm\s+(install|ci)/i.test(step.run) || /yarn\s+install/i.test(step.run)));
            
            if (downloadsExternal) {
              results.push(
                this.buildResult(
                  {
                    title: `Job '${job.name}' downloads external dependencies without retry`,
                    description: `Network operations can fail sporadically. Lack of retry makes the pipeline flaky.`,
                    remediation: `Add a retry step for downloading external dependencies.`,
                    evidence: `Steps contain download commands (curl, wget, apt-get, etc)`,
                    confidence: RuleConfidence.POSSIBLE,
                    severity: RuleSeverity.LOW
                  },
                  this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
                )
              );
            }
          }
        }
      });

      return results;
    });
  }
}

ruleRegistry.register(new MissingRetryRule());

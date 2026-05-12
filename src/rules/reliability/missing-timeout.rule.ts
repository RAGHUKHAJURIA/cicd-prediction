import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class MissingTimeoutRule extends BaseRule {
  id = 'reliability-missing-timeout';
  name = 'Missing Timeout on Job or Pipeline';
  category = RuleCategory.RELIABILITY;
  severity = RuleSeverity.MEDIUM;
  description = 'Detects jobs that do not have a timeout configured, or have dangerously high/low timeouts.';
  rationale = 'Missing timeouts can lead to hung pipelines, wasting compute resources and blocking other CI jobs.';
  references = ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      workflow.jobs.forEach(job => {
        const isNotify = /notify|notification/i.test(job.name);
        const isOnlyEchos = job.steps.every(step => step.run && /^echo\s+/.test(step.run));
        
        if (isNotify || (job.steps.length > 0 && isOnlyEchos)) return;

        // CHECK 1 — Job missing timeout
        if (job.timeoutMinutes === null) {
          results.push(
            this.buildResult(
              {
                title: `Job '${job.name}' has no timeout defined`,
                description: this.rationale,
                remediation: `Add timeout-minutes to prevent hung pipelines:\njobs:\n  ${job.id}:\n    timeout-minutes: 30`,
                evidence: `timeoutMinutes: null`,
                confidence: RuleConfidence.CERTAIN,
                severity: RuleSeverity.MEDIUM
              },
              this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.timeout-minutes` })
            )
          );
        } else {
          // CHECK 2 — Timeout is dangerously high
          if (job.timeoutMinutes > 360) {
            results.push(
              this.buildResult(
                {
                  title: `Job '${job.name}' has an unusually high timeout of ${job.timeoutMinutes} minutes`,
                  description: `Very high timeouts mask hung pipelines and waste compute resources. Most CI jobs should complete within 30-60 minutes.`,
                  remediation: `Reduce timeout to a more reasonable maximum limit (e.g., 60 minutes).`,
                  evidence: `${job.timeoutMinutes} minutes`,
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.LOW
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.timeout-minutes` })
              )
            );
          }

          // CHECK 3 — Timeout is too low for deployment jobs
          if (job.timeoutMinutes < 5 && /deploy|release|publish|push|upload/i.test(job.name)) {
            results.push(
              this.buildResult(
                {
                  title: `Deployment job '${job.name}' has very low timeout of ${job.timeoutMinutes} minutes`,
                  description: `Deployments can take longer than expected. A 1-5 minute timeout may cause valid deployments to be cancelled.`,
                  remediation: `Increase the timeout for deployment jobs to at least 15-30 minutes.`,
                  evidence: `${job.timeoutMinutes} minutes`,
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.timeout-minutes` })
              )
            );
          }
        }
      });

      return results;
    });
  }
}

ruleRegistry.register(new MissingTimeoutRule());

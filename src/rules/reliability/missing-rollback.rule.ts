import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class MissingRollbackRule extends BaseRule {
  id = 'reliability-missing-rollback';
  name = 'Deployment Without Rollback Mechanism';
  category = RuleCategory.RELIABILITY;
  severity = RuleSeverity.HIGH;
  description = 'Detects deployment jobs that lack an automated rollback or failure handling mechanism.';
  rationale = 'When a deployment fails, it may leave the environment in an inconsistent state. Automated rollbacks ensure stability.';
  references = ['https://docs.gitlab.com/ee/ci/environments/index.html#deployment-rollbacks'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      let hasStagingJob = false;
      let hasProdJob = false;

      workflow.jobs.forEach(job => {
        if (/staging|stage|preview|uat/i.test(job.name)) hasStagingJob = true;
        if (/prod|production/i.test(job.name)) hasProdJob = true;

        const isDeployment = /deploy|release|publish|rollout/i.test(job.name) || 
          job.steps.some(step => step.run && /kubectl apply|helm upgrade|helm install|terraform apply|aws deploy|gcloud deploy|heroku|docker push|flyctl deploy|railway up|vercel deploy/i.test(step.run));

        if (isDeployment) {
          // CHECK 1 — No rollback step defined
          const hasRollbackStep = workflow.jobs.some(j => j.steps.some(s => s.run && /rollback|helm rollback|kubectl rollout undo|terraform destroy|revert|undo/i.test(s.run)));
          
          if (!hasRollbackStep) {
            results.push(
              this.buildResult(
                {
                  title: `Deployment job '${job.name}' has no rollback mechanism`,
                  description: this.rationale,
                  remediation: `Add a rollback step triggered on failure:\n- name: Rollback on failure\n  if: failure()\n  run: kubectl rollout undo deployment/my-app`,
                  evidence: `No rollback step found`,
                  confidence: RuleConfidence.POSSIBLE,
                  severity: RuleSeverity.HIGH
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
              )
            );
          }

          // CHECK 2 — No post-failure handler
          const hasFailureHandler = job.conditions.some(c => /failure|on_failure/i.test(c.expression));
          
          if (!hasFailureHandler) {
            results.push(
              this.buildResult(
                {
                  title: `Deployment job '${job.name}' has no failure handling`,
                  description: `Without a failure handler, failures might not be properly reported or cleaned up.`,
                  remediation: `Add an if: failure() condition to handle failed deployments.`,
                  evidence: `No failure condition found`,
                  confidence: RuleConfidence.POSSIBLE,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
              )
            );
          }
        }
      });

      // CHECK 3 — Direct production deploy without staging
      if (hasProdJob && !hasStagingJob) {
        results.push(
          this.buildResult(
            {
              title: `Direct production deployment without staging environment`,
              description: `Deploying directly to production without a staging environment increases the risk of deploying broken code to users.`,
              remediation: `Add a staging deployment job that runs before the production deployment.`,
              evidence: `Production job exists, but no staging job found`,
              confidence: RuleConfidence.POSSIBLE,
              severity: RuleSeverity.MEDIUM
            },
            this.buildLocation(workflow, context, { field: `jobs` })
          )
        );
      }

      return results;
    });
  }
}

ruleRegistry.register(new MissingRollbackRule());

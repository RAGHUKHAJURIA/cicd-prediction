import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, WorkflowSource } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class MissingHealthcheckRule extends BaseRule {
  id = 'reliability-missing-healthcheck';
  name = 'Missing Health Check on Container or Service';
  category = RuleCategory.RELIABILITY;
  severity = RuleSeverity.LOW;
  description = 'Detects containers or services missing health checks or liveness/readiness probes.';
  rationale = 'Without health checks, orchestrators cannot detect when an application is running but unhealthy, delaying recovery.';
  references = ['https://docs.docker.com/engine/reference/builder/#healthcheck'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      // CHECK 1 — Dockerfile without HEALTHCHECK
      if (workflow.source === WorkflowSource.DOCKERFILE) {
        if (workflow.metadata && (workflow.metadata as unknown as Record<string, unknown>)['hasHealthcheck'] === false) {
          results.push(
            this.buildResult(
              {
                title: `Dockerfile has no HEALTHCHECK instruction`,
                description: this.rationale,
                remediation: `Add a HEALTHCHECK instruction:\nHEALTHCHECK --interval=30s --timeout=10s --retries=3 \\\n  CMD curl -f http://localhost:3000/health || exit 1`,
                evidence: `hasHealthcheck: false`,
                confidence: RuleConfidence.CERTAIN,
                severity: RuleSeverity.LOW
              },
              this.buildLocation(workflow, context, { field: `metadata.hasHealthcheck` })
            )
          );
        } else {
          // Fallback check if metadata flag isn't cleanly set
          let hasHealthcheck = false;
          workflow.jobs.forEach(job => {
            job.steps.forEach(step => {
              if (step.name && step.name.includes('HEALTHCHECK')) hasHealthcheck = true;
              if (step.run && step.run.includes('HEALTHCHECK')) hasHealthcheck = true;
            });
          });
          if (!hasHealthcheck && workflow.metadata && (workflow.metadata as unknown as Record<string, unknown>)['hasHealthcheck'] !== true) {
            results.push(
              this.buildResult(
                {
                  title: `Dockerfile has no HEALTHCHECK instruction`,
                  description: this.rationale,
                  remediation: `Add a HEALTHCHECK instruction.`,
                  evidence: `No HEALTHCHECK instruction found in AST`,
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.LOW
                },
                this.buildLocation(workflow, context, { field: `jobs` })
              )
            );
          }
        }
      }

      // CHECK 2 & 3 — Kubernetes probes
      if (workflow.source === WorkflowSource.KUBERNETES) {
        workflow.jobs.forEach(job => {
          let hasLiveness = false;
          let hasReadiness = false;
          job.steps.forEach(step => {
            if (step.name && step.name.toLowerCase().includes('liveness')) hasLiveness = true;
            if (step.name && step.name.toLowerCase().includes('readiness')) hasReadiness = true;
          });

          if (!hasLiveness && workflow.metadata && (workflow.metadata as unknown as Record<string, unknown>)['hasLivenessProbe'] !== true) {
            results.push(
              this.buildResult(
                {
                  title: `Kubernetes Deployment '${job.name}' has no liveness probe`,
                  description: this.rationale,
                  remediation: `Add a livenessProbe to the container spec.`,
                  evidence: `No livenessProbe found`,
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
              )
            );
          }

          if (!hasReadiness && workflow.metadata && (workflow.metadata as unknown as Record<string, unknown>)['hasReadinessProbe'] !== true) {
            results.push(
              this.buildResult(
                {
                  title: `Kubernetes Deployment '${job.name}' has no readiness probe`,
                  description: `Without readinessProbe, Kubernetes sends traffic to pods before they are ready, causing request failures during deployments and restarts.`,
                  remediation: `Add a readinessProbe to the container spec.`,
                  evidence: `No readinessProbe found`,
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
              )
            );
          }
        });
      }

      // CHECK 4 — Service containers in CI without health check wait
      workflow.jobs.forEach(job => {
        if (job.services.length > 0) {
          const hasWait = job.steps.some(step => step.run && /wait-for|healthcheck|until.*curl|until.*pg_isready|dockerize|wait-on/i.test(step.run));
          
          if (!hasWait) {
            results.push(
              this.buildResult(
                {
                  title: `Service containers used without health check wait`,
                  description: `Service containers (postgres, redis, etc.) take time to become ready. Without a wait step, subsequent steps may connect before the service is accepting connections.`,
                  remediation: `Add a wait step before using services:\n- name: Wait for postgres\n  run: until pg_isready -h localhost; do sleep 1; done`,
                  evidence: `Services defined but no wait pattern found in steps`,
                  confidence: RuleConfidence.POSSIBLE,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.services` })
              )
            );
          }
        }
      });

      return results;
    });
  }
}

ruleRegistry.register(new MissingHealthcheckRule());

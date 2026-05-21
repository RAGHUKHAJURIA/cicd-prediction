import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, WorkflowSource, PermissionAccess } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class PrivilegeEscalationRule extends BaseRule {
  id = 'security-privilege-escalation';
  name = 'Dangerous Permission or Privilege Configuration';
  category = RuleCategory.SECURITY;
  severity = RuleSeverity.CRITICAL;
  description = 'Detects overly permissive configurations, wildcard RBAC, privileged containers, and direct shell execution.';
  rationale = 'Dangerous permissions or privilege escalation can lead to container escape or broader infrastructure compromise.';
  references = ['https://docs.docker.com/engine/security/', 'https://kubernetes.io/docs/concepts/security/rbac-good-practices/'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      // CHECK 1 — Workflow-level write-all permissions
      const dangerousScopes = ['contents', 'actions', 'packages', 'deployments', 'security-events', 'secrets'];
      workflow.permissions.forEach((perm, idx) => {
        if ((perm.scope === '*' || dangerousScopes.includes(perm.scope)) && perm.access === PermissionAccess.WRITE) {
          results.push(
            this.buildResult(
              {
                title: `Workflow has write permission to '${perm.scope}'`,
                description: this.rationale,
                remediation: `Limit permissions to least privilege necessary.`,
                evidence: `${perm.scope}: write`,
                confidence: RuleConfidence.CERTAIN,
                severity: perm.scope === 'secrets' || perm.scope === '*' ? RuleSeverity.CRITICAL : RuleSeverity.HIGH
              },
              this.buildLocation(workflow, context, { field: `permissions[${idx}]` })
            )
          );
        }
      });

      // CHECK 2 — Kubernetes wildcard RBAC (from K8s manifests)
      if (workflow.source === WorkflowSource.KUBERNETES) {
        workflow.jobs.forEach((job) => {
          job.steps.forEach((step, stepIdx) => {
            if (step.run) {
              if (/verbs:\s*\[['"]?\*['"]?\]/.test(step.run) || /resources:\s*\[['"]?\*['"]?\]/.test(step.run)) {
                results.push(
                  this.buildResult(
                    {
                      title: `Kubernetes RBAC uses wildcard permissions`,
                      description: 'Wildcard RBAC grants excessive access to cluster resources.',
                      remediation: `Specify exact verbs and resources instead of '*'.`,
                      evidence: step.run.match(/verbs:\s*\[['"]?\*['"]?\]/)?.[0] || step.run.match(/resources:\s*\[['"]?\*['"]?\]/)?.[0] || '*',
                      confidence: RuleConfidence.CERTAIN,
                      severity: RuleSeverity.CRITICAL
                    },
                    this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, stepId: step.id, stepName: step.name, field: `jobs.${job.id}.steps[${stepIdx}].run` })
                  )
                );
              }
            }
          });
        });
      }

      workflow.jobs.forEach(job => {
        // CHECK 3 — Container privileged mode
        let privilegedContainer = false;
        job.steps.forEach(step => {
          Object.values(step.with || {}).forEach(val => {
            if (/privileged:\s*true/.test(val)) privilegedContainer = true;
          });
        });
        
        if (privilegedContainer) {
          results.push(
            this.buildResult(
              {
                title: `Container runs with privileged mode or dangerous capabilities`,
                description: 'Privileged containers have almost the same access to the host as processes running outside containers.',
                remediation: `Remove 'privileged: true' and grant only specific required capabilities.`,
                evidence: 'privileged: true',
                confidence: RuleConfidence.CERTAIN,
                severity: RuleSeverity.CRITICAL
              },
              this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })
            )
          );
        }

        job.steps.forEach((step, stepIdx) => {
          if (!step.run) return;

          if (/docker\s+run\s+.*--privileged/.test(step.run) ||
              /docker\s+run\s+.*--cap-add\s+SYS_ADMIN/.test(step.run) ||
              /docker\s+run\s+.*--cap-add\s+NET_ADMIN/.test(step.run)) {
            results.push(
              this.buildResult(
                {
                  title: `Container runs with privileged mode or dangerous capabilities`,
                  description: 'Running docker with --privileged or dangerous capabilities allows escaping the container.',
                  remediation: `Avoid running docker with --privileged or broad --cap-add.`,
                  evidence: step.run.match(/docker\s+run\s+.*--(privileged|cap-add\s+(SYS|NET)_ADMIN)/)?.[0] || '--privileged',
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.CRITICAL
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, stepId: step.id, stepName: step.name, field: `jobs.${job.id}.steps[${stepIdx}].run` })
              )
            );
          }

          // CHECK 4 — sudo usage in CI steps
          if (/\bsudo\b/.test(step.run)) {
            results.push(
              this.buildResult(
                {
                  title: `sudo usage detected in pipeline step`,
                  description: 'Sudo allows privilege escalation within the build runner.',
                  remediation: `Avoid using sudo if possible, or ensure it runs only explicitly verified commands.`,
                  evidence: 'sudo',
                  confidence: RuleConfidence.POSSIBLE,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, stepId: step.id, stepName: step.name, field: `jobs.${job.id}.steps[${stepIdx}].run` })
              )
            );
          }

          // CHECK 5 — chmod 777 usage
          if (/chmod\s+777/.test(step.run) || /chmod\s+-R\s+777/.test(step.run) || /chmod\s+a\+rwx/.test(step.run)) {
            results.push(
              this.buildResult(
                {
                  title: `Overly permissive file permissions set with chmod 777`,
                  description: 'chmod 777 allows any user to read, write, and execute files.',
                  remediation: `Use least privilege permissions (e.g., 644 or 755).`,
                  evidence: step.run.match(/chmod\s+(?:-R\s+)?(?:777|a\+rwx)/)?.[0] || 'chmod 777',
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.MEDIUM
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, stepId: step.id, stepName: step.name, field: `jobs.${job.id}.steps[${stepIdx}].run` })
              )
            );
          }

          // CHECK 6 — curl pipe bash / wget pipe sh
          if (/curl\s+.*\|\s*(bash|sh|zsh|fish)/.test(step.run) ||
              /wget\s+.*\|\s*(bash|sh|zsh|fish)/.test(step.run) ||
              /curl\s+.*>\s*.*\.(sh|bash)\s*&&\s*(bash|sh)/.test(step.run)) {
            results.push(
              this.buildResult(
                {
                  title: `Remote script execution without verification (curl | bash)`,
                  description: 'Executing remote scripts without checksum verification allows supply chain attacks. The remote server could serve different content to CI runners than to humans.',
                  remediation: `Download the script, verify its SHA checksum, and then execute it.`,
                  evidence: step.run.match(/(curl|wget)\s+.*\|\s*(bash|sh|zsh|fish)/)?.[0] || 'curl | bash',
                  confidence: RuleConfidence.CERTAIN,
                  severity: RuleSeverity.HIGH
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, stepId: step.id, stepName: step.name, field: `jobs.${job.id}.steps[${stepIdx}].run` })
              )
            );
          }
        });
      });

      return results;
    });
  }
}

ruleRegistry.register(new PrivilegeEscalationRule());

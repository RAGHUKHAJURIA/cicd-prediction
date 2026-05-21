import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, WorkflowSource, PermissionAccess, TriggerType, RunnerType } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class InsecurePermissionsRule extends BaseRule {
  id = 'security-insecure-permissions';
  name = 'Insecure Workflow or Job Permission Configuration';
  category = RuleCategory.SECURITY;
  severity = RuleSeverity.HIGH;
  description = 'Detects workflows with no explicit permissions, dangerous scopes, or risky trigger combinations.';
  rationale = 'Overly permissive CI configuration can allow attackers to steal secrets, modify the repository, or compromise self-hosted runners.';
  references = ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      // CHECK 1 — No explicit permissions defined (GitHub Actions)
      if (workflow.source === WorkflowSource.GITHUB_ACTIONS && workflow.permissions.length === 0) {
        results.push(
          this.buildResult(
            {
              title: `No explicit permissions defined — GitHub Actions defaults grant broad read/write access`,
              description: `Without explicit permissions, GitHub Actions grants write access to most scopes. Define minimum required permissions using the 'permissions' key.`,
              remediation: `Add permissions block:\npermissions:\n  contents: read\n  actions: read`,
              evidence: `Missing 'permissions' key`,
              confidence: RuleConfidence.CERTAIN,
              severity: RuleSeverity.MEDIUM
            },
            this.buildLocation(workflow, context, { field: 'permissions' })
          )
        );
      }

      // CHECK 2 & 3 — Dangerous scopes and write-all
      workflow.permissions.forEach((perm, idx) => {
        if (perm.scope === '*' || perm.scope === 'write-all') {
          results.push(
            this.buildResult(
              {
                title: `Workflow uses write-all permissions`,
                description: `write-all grants the maximum possible access token to the workflow.`,
                remediation: `Remove write-all and grant specific fine-grained permissions.`,
                evidence: `${perm.scope}: ${perm.access}`,
                confidence: RuleConfidence.CERTAIN,
                severity: RuleSeverity.CRITICAL
              },
              this.buildLocation(workflow, context, { field: `permissions[${idx}]` })
            )
          );
        } else if (perm.access === PermissionAccess.WRITE) {
          let sev: RuleSeverity | null = null;
          if (perm.scope === 'secrets' || perm.scope === 'actions') sev = RuleSeverity.CRITICAL;
          else if (['contents', 'packages', 'deployments', 'security-events'].includes(perm.scope)) sev = RuleSeverity.HIGH;

          if (sev) {
            results.push(
              this.buildResult(
                {
                  title: `Dangerous write permission granted to scope '${perm.scope}'`,
                  description: `Write access to ${perm.scope} allows potentially destructive or compromising actions.`,
                  remediation: `Reduce access to read if write is not strictly necessary.`,
                  evidence: `${perm.scope}: write`,
                  confidence: RuleConfidence.CERTAIN,
                  severity: sev
                },
                this.buildLocation(workflow, context, { field: `permissions[${idx}]` })
              )
            );
          }
        }
      });

      // CHECK 4 — Secrets accessible in PR from fork
      const hasPullRequestTrigger = workflow.triggers.some(t => t.type === TriggerType.PULL_REQUEST);
      if (workflow.source === WorkflowSource.GITHUB_ACTIONS && hasPullRequestTrigger && workflow.globalSecrets.length > 0) {
        results.push(
          this.buildResult(
            {
              title: `Secrets may be accessible in pull requests from forks`,
              description: `Workflows triggered by pull_request from forks run with read-only token but if secrets are referenced, a malicious PR could exfiltrate them via log output.`,
              remediation: `Use pull_request_target carefully, or use environment protection rules to require approval before secrets are available to fork PRs.`,
              evidence: `Triggers include pull_request and secrets are defined`,
              confidence: RuleConfidence.POSSIBLE,
              severity: RuleSeverity.HIGH
            },
            this.buildLocation(workflow, context, { field: 'triggers' })
          )
        );
      }

      workflow.jobs.forEach(job => {
        // CHECK 6 — Self-hosted runner used with public repo triggers
        if (job.runsOn.type === RunnerType.SELF_HOSTED && hasPullRequestTrigger) {
          results.push(
            this.buildResult(
              {
                title: `Self-hosted runner used with pull_request trigger`,
                description: `Self-hosted runners with pull_request trigger allow untrusted code from forks to execute on your infrastructure.`,
                remediation: `Require approval for external PRs or use ephemeral/hosted runners.`,
                evidence: `runsOn: self-hosted + trigger: pull_request`,
                confidence: RuleConfidence.CERTAIN,
                severity: RuleSeverity.HIGH
              },
              this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.runsOn` })
            )
          );
        }

        job.steps.forEach((step, stepIdx) => {
          // CHECK 5 — GITHUB_TOKEN used in script directly
          if (step.run && (/\$GITHUB_TOKEN/.test(step.run) || /\$\{GITHUB_TOKEN\}/.test(step.run) || /\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(step.run))) {
            results.push(
              this.buildResult(
                {
                  title: `GITHUB_TOKEN referenced directly in run command`,
                  description: `GITHUB_TOKEN in run commands may appear in logs if the command echoes its arguments or fails verbosely.`,
                  remediation: `Pass the token as an environment variable and reference the env var in the script.`,
                  evidence: step.run.match(/\$GITHUB_TOKEN|\$\{GITHUB_TOKEN\}|\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/)?.[0] || 'GITHUB_TOKEN',
                  confidence: RuleConfidence.LIKELY,
                  severity: RuleSeverity.MEDIUM
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

ruleRegistry.register(new InsecurePermissionsRule());

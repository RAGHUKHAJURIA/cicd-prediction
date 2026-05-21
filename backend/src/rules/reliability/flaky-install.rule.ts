import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, WorkflowSource } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class FlakyInstallRule extends BaseRule {
  id = 'reliability-flaky-install';
  name = 'Non-Deterministic Package Installation';
  category = RuleCategory.RELIABILITY;
  severity = RuleSeverity.MEDIUM;
  description = 'Detects package manager install commands that do not use lock files or version pinning.';
  rationale = 'Non-deterministic installations can lead to "works on my machine" issues and sudden CI failures when dependencies update.';
  references = ['https://docs.npmjs.com/cli/v9/commands/npm-ci'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      workflow.jobs.forEach(job => {
        job.steps.forEach((step, stepIdx) => {
          if (!step.run) return;

          const addFinding = (title: string, severity: RuleSeverity, evidence: string) => {
            results.push(
              this.buildResult(
                {
                  title,
                  description: this.rationale,
                  remediation: `Use deterministic installation commands (e.g., npm ci, yarn install --frozen-lockfile) or pin exact versions.`,
                  evidence,
                  confidence: RuleConfidence.CERTAIN,
                  severity
                },
                this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, stepId: step.id, stepName: step.name, field: `jobs.${job.id}.steps[${stepIdx}].run` })
              )
            );
          };

          // CHECK 1 — npm install instead of npm ci
          if (/\bnpm\s+install\b/.test(step.run) && !step.run.includes('npm install --') && !/npm\s+install\s+[a-zA-Z0-9@\-]/.test(step.run)) {
            addFinding(`Non-deterministic npm install — use npm ci instead`, RuleSeverity.MEDIUM, step.run.match(/\bnpm\s+install\b/)?.[0] || 'npm install');
          }

          // CHECK 2 — yarn install without frozen lockfile
          if (/\byarn\s+install\b/.test(step.run) && !step.run.includes('--frozen-lockfile') && !step.run.includes('--immutable')) {
            addFinding(`yarn install without --frozen-lockfile is non-deterministic`, RuleSeverity.MEDIUM, step.run.match(/\byarn\s+install\b/)?.[0] || 'yarn install');
          }

          // CHECK 3 — pip install without pinned versions
          if (/\bpip\s+install\b/.test(step.run) && !step.run.includes('==') && !step.run.includes('-r requirements')) {
            addFinding(`pip install without version pinning is non-deterministic`, RuleSeverity.MEDIUM, step.run.match(/\bpip\s+install\b/)?.[0] || 'pip install');
          }

          // CHECK 4 — pip install without --no-cache-dir (Dockerfile only)
          if (workflow.source === WorkflowSource.DOCKERFILE && /\bpip\s+install\b/.test(step.run) && !step.run.includes('--no-cache-dir')) {
            addFinding(`pip install in Dockerfile without --no-cache-dir increases image size`, RuleSeverity.LOW, step.run.match(/\bpip\s+install\b/)?.[0] || 'pip install');
          }

          // CHECK 5 — apt-get install without version pinning
          if (/\bapt-get\s+install\b/.test(step.run)) {
            if (!step.run.includes('=')) {
              addFinding(`apt-get install without version pinning`, RuleSeverity.MEDIUM, step.run.match(/\bapt-get\s+install\b/)?.[0] || 'apt-get install');
            }
            if (!step.run.includes('--no-install-recommends')) {
              addFinding(`apt-get install without --no-install-recommends`, RuleSeverity.LOW, step.run.match(/\bapt-get\s+install\b/)?.[0] || 'apt-get install');
            }
          }

          // CHECK 6 — go get without specific version
          if (/\bgo\s+get\b/.test(step.run) && !step.run.includes('@v')) {
            addFinding(`go get without version specification`, RuleSeverity.MEDIUM, step.run.match(/\bgo\s+get\b/)?.[0] || 'go get');
          }
        });
      });

      return results;
    });
  }
}

ruleRegistry.register(new FlakyInstallRule());

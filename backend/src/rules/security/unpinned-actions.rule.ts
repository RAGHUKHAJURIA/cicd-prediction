import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, StepType, ActionRefType } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class UnpinnedActionsRule extends BaseRule {
  id = 'security-unpinned-action';
  name = 'GitHub Action Not Pinned to SHA Digest';
  category = RuleCategory.SECURITY;
  severity = RuleSeverity.HIGH;
  description = 'Detects GitHub Actions that are not pinned to a specific commit SHA';
  rationale = 'Unpinned actions can be silently updated to include malicious code, compromising your entire CI pipeline.';
  references = ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      workflow.jobs.forEach(job => {
        job.steps.forEach((step, stepIndex) => {
          if (step.type === StepType.ACTION && step.actionRef !== null) {
            const actionRef = step.actionRef;
            
            if (actionRef.isPinned === false && actionRef.refType !== ActionRefType.SHA) {
              
              // Skip local and docker actions
              if (step.uses?.startsWith('./') || step.uses?.startsWith('docker://')) {
                return;
              }

              let severity = this.severity;
              if (actionRef.isThirdParty) {
                severity = RuleSeverity.CRITICAL;
              }

              results.push(
                this.buildResult(
                  {
                    title: `Action '${step.uses}' is not pinned to a SHA digest`,
                    description: this.rationale,
                    remediation: `Replace '${step.uses}' with a pinned SHA version.\nExample: uses: ${actionRef.owner}/${actionRef.repo}@{full-sha}\nFind the SHA for the latest release at:\nhttps://github.com/${actionRef.owner}/${actionRef.repo}/releases`,
                    evidence: step.uses ?? '',
                    confidence: RuleConfidence.CERTAIN,
                    severity,
                    metadata: {
                      owner: actionRef.owner,
                      repo: actionRef.repo,
                      currentRef: actionRef.ref,
                      refType: actionRef.refType,
                      isThirdParty: actionRef.isThirdParty,
                      suggestion: `Pin to a specific commit SHA instead of '${actionRef.ref}'`
                    }
                  },
                  this.buildLocation(workflow, context, {
                    jobId: job.id,
                    jobName: job.name,
                    stepId: step.id,
                    stepName: step.name,
                    field: `jobs.${job.id}.steps[${stepIndex}].uses`
                  })
                )
              );
            }
          }
        });
      });

      return results;
    });
  }
}

ruleRegistry.register(new UnpinnedActionsRule());

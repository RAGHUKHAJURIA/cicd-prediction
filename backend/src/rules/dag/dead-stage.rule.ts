/**
 * @file dead-stage.rule.ts
 * @description Finds jobs that are structural dead ends in the pipeline DAG.
 *
 * Two categories are detected:
 *  1. "Dead producers" — jobs that upload artifacts no downstream job ever downloads.
 *     The upload is wasted compute; the artifact expires without being used.
 *  2. "Orphaned terminals" — jobs with zero successors and no recognizable terminal
 *     purpose (deploy, notify, report, test). Typically forgotten cleanup jobs or
 *     copy-paste stages that were never wired into the rest of the pipeline.
 */

import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';
import { buildDAG, findDeadStages } from '../../engine/dag-builder';

export class DeadStageRule extends BaseRule {
  id = 'dag-dead-stage';
  name = 'Dead Stage / Orphaned Terminal Job';
  category = RuleCategory.DAG;
  severity = RuleSeverity.MEDIUM;
  description = 'Detects jobs that produce no outputs consumed downstream and orphaned terminal jobs with no recognizable purpose.';
  rationale =
    'Dead stages waste CI compute time, obscure pipeline intent, and can accumulate ' +
    'storage costs from unread artifact uploads. Orphaned terminals often indicate ' +
    'an incomplete refactoring where a stage was added but never connected.';
  references = [
    'https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/storing-workflow-data-as-artifacts',
  ];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];
      if (workflow.jobs.length < 2) return results;

      const dag = buildDAG(workflow);
      const { deadProducers, orphanedTerminals } = findDeadStages(dag);

      // ── Dead producers ───────────────────────────────────────────────────
      for (const { jobId, artifactName, reason } of deadProducers) {
        const job = dag.jobMap.get(jobId);
        if (!job) continue;

        results.push(
          this.buildResult(
            {
              title: `Job '${job.name}' uploads artifact '${artifactName}' that is never downloaded`,
              description:
                `The artifact '${artifactName}' produced by '${job.name}' is not consumed ` +
                `by any downstream job. This is wasted compute and storage.`,
              remediation:
                `Either add a downstream job that downloads '${artifactName}' ` +
                `(using actions/download-artifact or equivalent), ` +
                `or remove the upload step if the artifact is no longer needed.`,
              evidence: reason,
              confidence: RuleConfidence.LIKELY,
              severity: RuleSeverity.MEDIUM,
              metadata: { artifactName, producerJobId: jobId },
            },
            this.buildLocation(workflow, context, {
              jobId: job.id,
              jobName: job.name,
              field: `jobs.${job.id}.artifacts`,
            }),
          ),
        );
      }

      // ── Orphaned terminals ────────────────────────────────────────────────
      for (const jobId of orphanedTerminals) {
        const job = dag.jobMap.get(jobId);
        if (!job) continue;

        const predecessorNames = [...(dag.predecessors.get(jobId) ?? [])]
          .map((pid) => dag.jobMap.get(pid)?.name ?? pid)
          .join(', ');

        results.push(
          this.buildResult(
            {
              title: `Job '${job.name}' is a terminal stage with no recognizable purpose`,
              description:
                `Job '${job.name}' is at the end of the pipeline (no successors) ` +
                `but does not match any known terminal pattern (deploy, notify, report, test). ` +
                `It depends on [${predecessorNames}] but nothing depends on it.`,
              remediation:
                `Verify whether this job is intentional. If so, give it a descriptive name ` +
                `(e.g. 'notify-slack', 'generate-report'). If it is leftover from a refactoring, remove it.`,
              evidence: `Terminal job with predecessors: [${predecessorNames}]`,
              confidence: RuleConfidence.POSSIBLE,
              severity: RuleSeverity.LOW,
              metadata: {
                terminalJobId: jobId,
                predecessors: [...(dag.predecessors.get(jobId) ?? [])],
              },
            },
            this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` }),
          ),
        );
      }

      return results;
    });
  }
}

ruleRegistry.register(new DeadStageRule());

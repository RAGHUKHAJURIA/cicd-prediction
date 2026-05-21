/**
 * @file missing-dependency-output.rule.ts
 * @description Flags jobs that consume artifacts without declaring a `needs:` edge
 * to the producing job.
 *
 * Problem: On most CI systems, artifact download steps execute against the artifact
 * storage service. If the producer hasn't finished uploading yet (because there's
 * no dependency ordering enforced via `needs:`), the download step may:
 *  - Receive a stale artifact from a prior run
 *  - Receive an empty/non-existent artifact and silently continue
 *  - Race with the producer and receive a corrupt partial upload
 *
 * This rule catches all three by cross-referencing artifact upload/download pairs
 * against the declared `needs:` edges.
 */

import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';
import { buildDAG, findMissingOutputDependencies } from '../../engine/dag-builder';

export class MissingDependencyOutputRule extends BaseRule {
  id = 'dag-missing-dependency-output';
  name = 'Artifact Consumed Without Dependency Edge';
  category = RuleCategory.DAG;
  severity = RuleSeverity.HIGH;
  description = 'Detects jobs that download artifacts from an upstream job without declaring a `needs:` dependency on that producer.';
  rationale =
    'Without an explicit `needs:` edge, the CI scheduler has no ordering guarantee. ' +
    'The consumer job may start before the producer finishes uploading, causing it to ' +
    'receive a stale, empty, or corrupt artifact. This is a silent race condition ' +
    'that produces intermittent build failures extremely difficult to reproduce locally.';
  references = [
    'https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/storing-workflow-data-as-artifacts',
    'https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idneeds',
  ];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];
      if (workflow.jobs.length < 2) return results;

      const dag = buildDAG(workflow);
      const missingDeps = findMissingOutputDependencies(dag);

      for (const { consumerJobId, artifactName, producerJobId, missingEdge } of missingDeps) {
        if (!missingEdge) continue;

        const consumerJob = dag.jobMap.get(consumerJobId);
        const producerJob = producerJobId ? dag.jobMap.get(producerJobId) : null;

        if (!consumerJob) continue;

        const producerLabel = producerJob ? `'${producerJob.name}'` : `'${producerJobId}'`;
        const consumerLabel = `'${consumerJob.name}'`;

        results.push(
          this.buildResult(
            {
              title: `Job ${consumerLabel} downloads artifact '${artifactName}' without depending on its producer`,
              description:
                `Job ${consumerLabel} downloads the artifact '${artifactName}' which is uploaded ` +
                `by ${producerLabel}, but ${consumerLabel} does not declare ${producerLabel} in its ` +
                `'needs:' list. There is no ordering guarantee: the consumer may start before ` +
                `the producer has finished, causing a race condition.`,
              remediation:
                `Add ${producerJobId ? `'${producerJobId}'` : 'the producing job'} to the ` +
                `'needs:' field of job '${consumerJobId}':\n\n` +
                `jobs:\n  ${consumerJobId}:\n    needs: [${producerJobId ?? '<producer-job-id>'}]`,
              evidence: `'${artifactName}' produced by ${producerLabel}, consumed by ${consumerLabel} with no needs edge`,
              confidence: RuleConfidence.CERTAIN,
              severity: RuleSeverity.HIGH,
              metadata: {
                consumerJobId,
                producerJobId,
                artifactName,
              },
            },
            this.buildLocation(workflow, context, {
              jobId: consumerJob.id,
              jobName: consumerJob.name,
              field: `jobs.${consumerJobId}.needs`,
            }),
          ),
        );
      }

      return results;
    });
  }
}

ruleRegistry.register(new MissingDependencyOutputRule());

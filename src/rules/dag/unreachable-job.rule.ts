/**
 * @file unreachable-job.rule.ts
 * @description Flags jobs that have no execution path from any workflow entry point.
 *
 * Algorithm: BFS from all zero-in-degree nodes. Any node not visited is unreachable.
 */

import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';
import { buildDAG, analyzeReachability } from '../../engine/dag-builder';

export class UnreachableJobRule extends BaseRule {
  id = 'dag-unreachable-job';
  name = 'Unreachable Job';
  category = RuleCategory.DAG;
  severity = RuleSeverity.HIGH;
  description = 'Detects jobs that have no execution path from any workflow entry point, making them permanently skipped or blocked.';
  rationale = 'An unreachable job will never execute. Its steps, deployments, or test runs are silently skipped, giving a false sense of pipeline coverage.';
  references = ['https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idneeds'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];
      if (workflow.jobs.length < 2) return results;

      const dag = buildDAG(workflow);
      const { unreachable, entryPoints } = analyzeReachability(dag);
      if (unreachable.size === 0) return results;

      const entryList = [...entryPoints]
        .map((id) => dag.jobMap.get(id)?.name ?? id)
        .join(', ');

      for (const jobId of unreachable) {
        const job = dag.jobMap.get(jobId);
        if (!job) continue;

        const missingUpstreams = job.needs
          .map((dep) => dep.jobId)
          .filter((depId) => !dag.jobMap.has(depId));

        const reason =
          missingUpstreams.length > 0
            ? `References non-existent job(s): ${missingUpstreams.map((id) => `'${id}'`).join(', ')}`
            : `All predecessors are themselves unreachable (possible cycle or broken chain)`;

        results.push(
          this.buildResult(
            {
              title: `Job '${job.name}' is unreachable from any entry point`,
              description:
                `The job '${job.name}' (id: '${jobId}') has no execution path from ` +
                `the workflow entry point(s) [${entryList}]. It will never run.`,
              remediation:
                missingUpstreams.length > 0
                  ? `Fix the 'needs:' references: [${missingUpstreams.join(', ')}] do not exist in this workflow.`
                  : `Trace the dependency chain of '${job.name}' and ensure every upstream job is itself reachable.`,
              evidence: reason,
              confidence: RuleConfidence.CERTAIN,
              severity: RuleSeverity.HIGH,
              metadata: {
                unreachableJobId: jobId,
                missingUpstreams,
                needsDeclarations: job.needs.map((d) => d.jobId),
              },
            },
            this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.needs` }),
          ),
        );
      }

      return results;
    });
  }
}

ruleRegistry.register(new UnreachableJobRule());

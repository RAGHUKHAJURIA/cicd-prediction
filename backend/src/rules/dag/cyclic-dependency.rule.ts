/**
 * @file cyclic-dependency.rule.ts
 * @description Detects cycles in the workflow job dependency graph.
 *
 * A cycle (A needs B, B needs C, C needs A) produces a deadlock — no job can
 * start because each is waiting for another to finish first. CI systems handle
 * this differently: GitHub Actions rejects the workflow at load time; GitLab CI
 * and Jenkins may silently skip or fail.
 *
 * Algorithm: Kahn's topological sort O(J+E) for detection, then DFS for
 * cycle path reconstruction. Implemented in dag-builder.ts.
 */

import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';
import { buildDAG, detectCycles } from '../../engine/dag-builder';

export class CyclicDependencyRule extends BaseRule {
  id = 'dag-cyclic-dependency';
  name = 'Cyclic Job Dependency';
  category = RuleCategory.DAG;
  severity = RuleSeverity.CRITICAL;
  description = 'Detects circular dependency chains between jobs (A needs B, B needs A) that prevent any job from executing.';
  rationale =
    'A cycle in the job dependency graph is a hard deadlock. No job in the cycle can ' +
    'ever start because each is waiting for another to complete first. This is a ' +
    'structural pipeline failure that will either be rejected at load time or cause ' +
    'all jobs to silently hang.';
  references = [
    'https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idneeds',
  ];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      if (workflow.jobs.length < 2) return results; // No edges possible

      const dag = buildDAG(workflow);
      const { isDAG, cycles } = detectCycles(dag);

      if (isDAG) return results;

      for (const { cycle } of cycles) {
        const cyclePath = cycle.join(' → ');

        // Resolve human-readable job names for cleaner reporting
        const readablePath = cycle
          .map((id) => {
            const job = dag.jobMap.get(id);
            return job ? `'${job.name}'` : `'${id}'`;
          })
          .join(' → ');

        results.push(
          this.buildResult(
            {
              title: `Cyclic job dependency detected: ${cyclePath}`,
              description:
                `Jobs ${readablePath} form a dependency cycle. ` +
                `Each job is waiting for another to complete, creating a deadlock.`,
              remediation:
                `Remove or reverse one of the dependency edges in the cycle. ` +
                `Check the 'needs:' fields for each job in the cycle and ensure ` +
                `the dependency graph is acyclic (flows in one direction only).`,
              evidence: `Cycle: ${cyclePath}`,
              confidence: RuleConfidence.CERTAIN,
              severity: RuleSeverity.CRITICAL,
              metadata: {
                cycleLength: cycle.length - 1, // exclude the closing repeated node
                cycleNodes: cycle,
              },
            },
            this.buildLocation(workflow, context, { field: 'jobs' }),
          ),
        );
      }

      return results;
    });
  }
}

ruleRegistry.register(new CyclicDependencyRule());

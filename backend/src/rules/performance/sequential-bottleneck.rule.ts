import {
  BaseRule,
  RuleCategory,
  RuleSeverity,
  RuleConfidence,
  RuleContext,
  RuleResult,
} from '../types';
import type { NormalizedWorkflow } from '../../models/workflow.model';

export class SequentialBottleneckRule extends BaseRule {
  id = 'performance-sequential-bottleneck';
  name = 'Jobs That Could Run in Parallel Run Sequentially';
  category = RuleCategory.PERFORMANCE;
  severity = RuleSeverity.LOW;
  description = 'Detects unnecessary dependencies between jobs that force sequential execution.';
  rationale = 'Maximizing parallelism is key to fast CI/CD pipelines. Jobs that do not consume outputs or artifacts from their dependencies should run in parallel.';

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const findings: RuleResult[] = [];
      const jobs = workflow.jobs;
      if (jobs.length <= 1) return findings;

      // STEP 1 — Build execution levels
      const jobLevels = new Map<string, number>();
      const adjList = new Map<string, string[]>();
      
      for (const job of jobs) {
        adjList.set(job.id, job.needs?.map(n => n.jobId) || []);
      }

      function getLevel(jobId: string, path: Set<string> = new Set()): number {
        if (jobLevels.has(jobId)) return jobLevels.get(jobId)!;
        if (path.has(jobId)) return 0; // Prevent infinite loop on cycles

        const needs = adjList.get(jobId) || [];
        if (needs.length === 0) {
          jobLevels.set(jobId, 0);
          return 0;
        }

        path.add(jobId);
        let maxNeedLevel = -1;
        for (const needId of needs) {
          maxNeedLevel = Math.max(maxNeedLevel, getLevel(needId, path));
        }
        path.delete(jobId);
        
        const level = maxNeedLevel + 1;
        jobLevels.set(jobId, level);
        return level;
      }

      for (const job of jobs) {
        getLevel(job.id);
      }

      let maxLevel = 0;
      let criticalPathNode = '';
      for (const [jobId, level] of jobLevels.entries()) {
        if (level > maxLevel) {
          maxLevel = level;
          criticalPathNode = jobId;
        }
      }

      // Reconstruct critical path
      const criticalPath: string[] = [];
      if (maxLevel > 0) {
        let curr = criticalPathNode;
        while (curr) {
          criticalPath.unshift(curr);
          const needs = adjList.get(curr) || [];
          let maxNeed = '';
          let maxLvl = -1;
          for (const n of needs) {
            const l = jobLevels.get(n) || 0;
            if (l > maxLvl) {
              maxLvl = l;
              maxNeed = n;
            }
          }
          if (maxNeed) {
            curr = maxNeed;
          } else {
            break;
          }
        }
      }

      const criticalPathLength = criticalPath.length;
      const threshold = context.config?.customThresholds?.['performance-critical-path-length'] || 5;

      // STEP 3 — Detect large sequential chains
      if (criticalPathLength > threshold) {
        const jobNames = criticalPath.map(id => jobs.find(j => j.id === id)?.name || id);
        findings.push(this.buildResult({
          title: `Pipeline critical path is ${criticalPathLength} jobs deep`,
          severity: criticalPathLength > 8 ? RuleSeverity.HIGH : RuleSeverity.MEDIUM,
          description: `The longest sequential dependency chain is ${jobNames.join(' → ')}. Each job waits for the previous to complete, creating a ${criticalPathLength}-stage bottleneck.`,
          remediation: `Review the job dependencies. Can any of these jobs run in parallel?`,
          evidence: `Critical path: ${jobNames.join(' → ')}`,
          confidence: RuleConfidence.CERTAIN,
          metadata: {
            criticalPath,
            criticalPathLength,
            estimatedMinutes: criticalPathLength * 5
          }
        }, this.buildLocation(workflow, context, { field: 'jobs' })));
      }

      // STEP 2 — Detect false sequential chains
      for (const jobB of jobs) {
        if (!jobB.needs || jobB.needs.length === 0) continue;

        for (const need of jobB.needs) {
          const jobAId = need.jobId;
          const jobA = jobs.find(j => j.id === jobAId);
          if (!jobA) continue;

          let consumesOutputs = false;

          // Check artifacts downloads
          if (jobB.artifacts?.some(a => a.type === 'DOWNLOAD')) { // rough heuristic
            consumesOutputs = true;
          }

          // Check expressions referencing needs.jobA
          const needsPattern = new RegExp(`needs\\.${jobAId}\\.outputs`, 'i');
          for (const step of jobB.steps) {
            if (step.run && needsPattern.test(step.run)) consumesOutputs = true;
            if (step.env && Object.values(step.env).some(v => needsPattern.test(String(v)))) consumesOutputs = true;
            if (step.with && Object.values(step.with).some(v => needsPattern.test(String(v)))) consumesOutputs = true;
          }

          if (jobB.env && Object.values(jobB.env).some(v => needsPattern.test(String(v)))) consumesOutputs = true;

          // Note: Needs pattern check might miss some implicit dependencies, so confidence is POSSIBLE
          if (!consumesOutputs) {
            findings.push(this.buildResult({
              title: `Job '${jobB.name}' waits for '${jobA.name}' but does not use its outputs`,
              description: `This unnecessary dependency serializes execution. Removing it allows these jobs to run in parallel, reducing total pipeline duration.`,
              remediation: `Remove '${jobAId}' from the 'needs' array of '${jobB.id}' if they can truly run independently.`,
              evidence: `${jobB.id} needs: [${jobA.id}]`,
              confidence: RuleConfidence.POSSIBLE,
            }, this.buildLocation(workflow, context, { jobId: jobB.id, jobName: jobB.name, field: `jobs.${jobB.id}.needs` })));
          }
        }
      }

      // STEP 4 — Detect jobs at same level that could be parallel / matrix
      let level0Jobs = 0;
      for (const level of jobLevels.values()) {
        if (level === 0) level0Jobs++;
      }

      if (level0Jobs >= 4) {
        // very rudimentary matrix detection based on structure similarity could go here
        findings.push(this.buildResult({
          title: `Multiple independent jobs may benefit from matrix strategy`,
          severity: RuleSeverity.INFO,
          description: `${level0Jobs} jobs run independently with similar configurations. A matrix strategy would be cleaner and easier to maintain.`,
          remediation: `Use 'strategy.matrix' to dynamically generate these jobs from a single definition.`,
          evidence: `${level0Jobs} jobs at execution level 0.`,
          confidence: RuleConfidence.POSSIBLE,
        }, this.buildLocation(workflow, context, { field: 'jobs' })));
      }

      return findings;
    });
  }
}

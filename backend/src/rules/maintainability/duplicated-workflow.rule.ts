import {
  BaseRule,
  RuleCategory,
  RuleSeverity,
  RuleConfidence,
  RuleContext,
  RuleResult,
} from '../types';
import type { NormalizedWorkflow, Job as NormalizedJob } from '../../models/workflow.model';

export class DuplicatedWorkflowRule extends BaseRule {
  id = 'maintainability-duplicated-workflow';
  name = 'Duplicated Workflow Configuration';
  category = RuleCategory.MAINTAINABILITY;
  severity = RuleSeverity.LOW;
  description = 'Detects workflows and jobs with highly duplicated configurations.';
  rationale = 'Duplicated configuration is harder to maintain and prone to drift. Centralizing shared logic makes updates easier.';

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const findings: RuleResult[] = [];

      // Helpers
      const jobFingerprint = (job: NormalizedJob): string => {
        return job.steps.map(s => s.run || s.uses || '').join('::');
      };

      // DETECTION 1 — Nearly identical workflows (compare this to others)
      // Since this runs for each workflow, to avoid duplicate cross-pair reports,
      // we only report if workflow.id < other.id (lexicographical comparison)
      // Wait, allWorkflows contains all. We will just report for the current one.
      for (const otherWf of context.allWorkflows) {
        if (workflow.sourceFile >= otherWf.sourceFile) continue; // Only process each pair once

        const wfAFingerprints = new Set(workflow.jobs.map(j => jobFingerprint(j)));
        const wfBFingerprints = new Set(otherWf.jobs.map(j => jobFingerprint(j)));

        let matchCount = 0;
        for (const fp of wfAFingerprints) {
          if (wfBFingerprints.has(fp)) {
            matchCount++;
          }
        }

        const maxJobs = Math.max(workflow.jobs.length, otherWf.jobs.length);
        if (maxJobs > 0) {
          const similarity = matchCount / maxJobs;
          if (similarity >= 0.8) {
            findings.push(this.buildResult({
              title: `Workflows '${workflow.sourceFile}' and '${otherWf.sourceFile}' are ${Math.round(similarity * 100)}% identical`,
              description: `These two workflow files contain nearly identical job definitions. Consider extracting shared logic into a reusable workflow using workflow_call or GitLab CI includes.`,
              remediation: `Extract the shared jobs to a central template.`,
              evidence: `${workflow.sourceFile} vs ${otherWf.sourceFile}`,
              confidence: RuleConfidence.POSSIBLE,
              metadata: {
                similarity,
                fileA: workflow.sourceFile,
                fileB: otherWf.sourceFile,
                sharedJobCount: matchCount
              }
            }, this.buildLocation(workflow, context)));
          }
        }
      }

      // DETECTION 2 — Duplicated job definitions within same workflow
      for (let i = 0; i < workflow.jobs.length; i++) {
        for (let j = i + 1; j < workflow.jobs.length; j++) {
          const jobA = workflow.jobs[i];
          const jobB = workflow.jobs[j];
          
          if (jobA.name === jobB.name) continue;

          const fpA = jobA.steps.map(s => s.run || s.uses || '');
          const fpB = jobB.steps.map(s => s.run || s.uses || '');
          
          let matches = 0;
          const maxSteps = Math.max(fpA.length, fpB.length);
          for (let k = 0; k < Math.min(fpA.length, fpB.length); k++) {
            if (fpA[k] === fpB[k] && fpA[k] !== '') matches++;
          }

          if (maxSteps > 0 && (matches / maxSteps) >= 0.9) {
            const sim = matches / maxSteps;
            findings.push(this.buildResult({
              title: `Jobs '${jobA.name}' and '${jobB.name}' are ${Math.round(sim * 100)}% identical`,
              description: `These two jobs do almost exactly the same thing. Consider merging them using a matrix strategy or extracting to a reusable workflow.`,
              remediation: `Use strategy.matrix or create a composite action.`,
              evidence: `Job A: ${jobA.name}, Job B: ${jobB.name}`,
              confidence: RuleConfidence.POSSIBLE,
            }, this.buildLocation(workflow, context, { jobId: jobA.id, jobName: jobA.name, field: `jobs.${jobA.id}` })));
          }
        }
      }

      // DETECTION 3 — Duplicated env vars across jobs
      const envCounts = new Map<string, { count: number, value: string, jobs: string[] }>();
      for (const job of workflow.jobs) {
        if (!job.env) continue;
        for (const [k, v] of Object.entries(job.env)) {
          const key = `${k}=${v}`;
          if (!envCounts.has(key)) {
            envCounts.set(key, { count: 0, value: String(v), jobs: [] });
          }
          const rec = envCounts.get(key)!;
          rec.count++;
          rec.jobs.push(job.name);
        }
      }

      for (const [k, rec] of envCounts.entries()) {
        if (rec.count >= 3) {
          const keyName = k.split('=')[0];
          findings.push(this.buildResult({
            title: `Env var '${keyName}' is duplicated across ${rec.count} jobs`,
            description: `Define shared env vars at the workflow level under 'env:' to avoid repetition and reduce update surface.`,
            remediation: `Move ${keyName} to the global env block.`,
            evidence: `${keyName}: ${rec.value} (in jobs: ${rec.jobs.join(', ')})`,
            confidence: RuleConfidence.CERTAIN,
          }, this.buildLocation(workflow, context, { field: 'jobs' })));
        }
      }

      // DETECTION 4 — Same step duplicated across jobs
      const stepCounts = new Map<string, { count: number, jobs: Set<string>, stepName: string }>();
      for (const job of workflow.jobs) {
        for (const step of job.steps) {
          const identifier = step.uses || step.run || '';
          if (!identifier) continue;
          
          if (!stepCounts.has(identifier)) {
            stepCounts.set(identifier, { count: 0, jobs: new Set(), stepName: step.name || identifier });
          }
          const rec = stepCounts.get(identifier)!;
          rec.count++;
          rec.jobs.add(job.name);
        }
      }

      for (const [identifier, rec] of stepCounts.entries()) {
        if (rec.jobs.size >= 3) {
          findings.push(this.buildResult({
            title: `Step '${rec.stepName}' is duplicated in ${rec.jobs.size} jobs`,
            description: `Extract this repeated step into a composite action or reusable workflow to maintain it in one place.`,
            remediation: `Create a composite action for this step.`,
            evidence: `Duplicated step identifier: ${identifier}`,
            confidence: RuleConfidence.CERTAIN,
          }, this.buildLocation(workflow, context, { field: 'jobs' })));
        }
      }

      return findings;
    });
  }
}

import {
  BaseRule,
  RuleCategory,
  RuleSeverity,
  RuleConfidence,
  RuleContext,
  RuleResult,
} from '../types';
import type { NormalizedWorkflow } from '../../models/workflow.model';

export class MonolithicPipelineRule extends BaseRule {
  id = 'maintainability-monolithic-pipeline';
  name = 'Monolithic Pipeline with Too Many Jobs or Steps';
  category = RuleCategory.MAINTAINABILITY;
  severity = RuleSeverity.LOW;
  description = 'Detects pipelines that are too large, lacking separation of concerns, or missing vital stages.';
  rationale = 'Large pipelines are hard to debug, parallelize, and maintain. Missing stages like testing or security scanning present major risks.';

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const findings: RuleResult[] = [];
      const jobs = workflow.jobs;
      
      const jobThreshold = context.config?.customThresholds?.['maintainability-job-count'] || 20;
      const stepThreshold = context.config?.customThresholds?.['maintainability-step-count'] || 50;

      // CHECK 1 — Too many jobs in single workflow
      if (jobs.length > jobThreshold) {
        const severity = jobs.length > jobThreshold * 2 ? RuleSeverity.MEDIUM : RuleSeverity.LOW;
        findings.push(this.buildResult({
          title: `Pipeline has ${jobs.length} jobs — consider splitting into separate workflows`,
          severity,
          description: `Large monolithic pipelines are hard to maintain, debug, and reason about. Jobs from different concerns (build, test, security, deploy) should live in separate workflow files triggered by different events.`,
          remediation: `Split this workflow into focused workflows:\nci.yml — build and test on every push\nsecurity.yml — security scanning on schedule\ndeploy.yml — deployment on release tags\nUse workflow_call to share jobs between files.`,
          evidence: `${jobs.length} jobs in ${workflow.sourceFile}`,
          confidence: RuleConfidence.CERTAIN,
          metadata: {
            jobCount: jobs.length,
            threshold: jobThreshold,
            jobNames: jobs.map(j => j.name)
          }
        }, this.buildLocation(workflow, context, { field: 'jobs' })));
      }

      // CHECK 2 — Too many steps in single job
      for (const job of jobs) {
        if (job.steps.length > stepThreshold) {
          findings.push(this.buildResult({
            title: `Job '${job.name}' has ${job.steps.length} steps — consider splitting into smaller jobs`,
            description: `Jobs with many steps are hard to debug because a failure deep in the job requires running everything before it again. Splitting into smaller jobs enables better parallelism and faster re-runs on failure.`,
            remediation: `Split job into multiple jobs connected with 'needs'.`,
            evidence: `${job.steps.length} steps in job '${job.name}'`,
            confidence: RuleConfidence.CERTAIN,
          }, this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}.steps` })));
        }
      }

      // CHECK 3 — All jobs in single stage
      const allLevel0 = jobs.every(j => !j.needs || j.needs.length === 0);
      if (allLevel0 && jobs.length > 3) {
        findings.push(this.buildResult({
          title: `All ${jobs.length} jobs run independently with no dependency ordering`,
          severity: RuleSeverity.INFO,
          description: `None of the jobs depend on each other. This may be intentional, but consider whether some jobs (like deploy) should depend on others (like test) completing successfully first.`,
          remediation: `Use 'needs' to declare dependencies between jobs.`,
          evidence: `All jobs have empty 'needs' arrays.`,
          confidence: RuleConfidence.POSSIBLE,
        }, this.buildLocation(workflow, context, { field: 'jobs' })));
      }

      // CHECK 4 — Pipeline has no test stage
      const testPattern = /test|spec|lint|check|verify|validate|jest|mocha|pytest|rspec/i;
      const hasTestJob = jobs.some(j => testPattern.test(j.name) || testPattern.test(j.id));
      if (jobs.length >= 3 && !hasTestJob) {
        findings.push(this.buildResult({
          title: `Pipeline has no identifiable test stage`,
          severity: RuleSeverity.MEDIUM,
          description: `No jobs in this pipeline appear to run tests. Every pipeline should include automated testing before deployment to catch regressions.`,
          remediation: `Add jobs to run unit/integration tests.`,
          evidence: `Job names: ${jobs.map(j => j.name).join(', ')}`,
          confidence: RuleConfidence.POSSIBLE,
        }, this.buildLocation(workflow, context, { field: 'jobs' })));
      }

      // CHECK 5 — Pipeline deploys but has no security scanning
      const deployPattern = /deploy|release|publish/i;
      const securityPattern = /security|scan|sast|dast|trivy|snyk|sonar|codeql|dependabot|audit|owasp/i;
      
      const hasDeployJob = jobs.some(j => deployPattern.test(j.name) || deployPattern.test(j.id));
      const hasSecurityJob = jobs.some(j => securityPattern.test(j.name) || securityPattern.test(j.id) || j.steps.some(s => securityPattern.test(s.uses || '') || securityPattern.test(s.run || '')));

      if (hasDeployJob && !hasSecurityJob) {
        findings.push(this.buildResult({
          title: `Pipeline deploys without security scanning`,
          severity: RuleSeverity.MEDIUM,
          description: `This pipeline deploys to an environment but has no security scanning stage. Consider adding SAST, dependency scanning, or container image scanning before deployment.`,
          remediation: `Add a security scanning job (e.g., CodeQL, Trivy) that must pass before deployment.`,
          evidence: `Deploy job present but no security tools detected.`,
          confidence: RuleConfidence.POSSIBLE,
        }, this.buildLocation(workflow, context, { field: 'jobs' })));
      }

      // CHECK 6 — No artifact passing between jobs
      if (jobs.length >= 5 && jobs.some(j => j.needs && j.needs.length > 0)) {
        const hasArtifacts = jobs.some(j => j.artifacts && j.artifacts.length > 0);
        if (!hasArtifacts) {
          findings.push(this.buildResult({
            title: `Multi-job pipeline with no artifact sharing`,
            severity: RuleSeverity.INFO,
            description: `Jobs depend on each other but share no artifacts. This may mean each job is rebuilding from scratch rather than consuming outputs from previous stages.`,
            remediation: `Use upload-artifact and download-artifact to share build outputs.`,
            evidence: `No CACHE, UPLOAD, or DOWNLOAD artifacts detected across ${jobs.length} jobs.`,
            confidence: RuleConfidence.POSSIBLE,
          }, this.buildLocation(workflow, context, { field: 'jobs' })));
        }
      }

      return findings;
    });
  }
}

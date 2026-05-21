import {
  BaseRule,
  RuleCategory,
  RuleSeverity,
  RuleConfidence,
  RuleContext,
  RuleResult,
} from '../types';
import type { NormalizedWorkflow } from '../../models/workflow.model';

export class RedundantInstallRule extends BaseRule {
  id = 'performance-redundant-install';
  name = 'Redundant Package Installation Across Jobs';
  category = RuleCategory.PERFORMANCE;
  severity = RuleSeverity.MEDIUM;
  description = 'Detects when multiple jobs install the same dependencies without sharing a cache.';
  rationale = 'Downloading and installing dependencies from scratch in every job multiplies build time and consumes unnecessary network bandwidth.';
  
  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const findings: RuleResult[] = [];
      const installMap = new Map<string, Array<{ jobId: string, jobName: string, stepId: string, stepName: string, command: string }>>();
      
      const INSTALL_PATTERNS = [
        { type: 'npm', pattern: /npm\s+(ci|install)/ },
        { type: 'yarn', pattern: /yarn\s+(install|)/ },
        { type: 'pip', pattern: /pip[3]?\s+install/ },
        { type: 'poetry', pattern: /poetry\s+install/ },
        { type: 'bundler', pattern: /bundle\s+install/ },
        { type: 'composer', pattern: /composer\s+install/ },
        { type: 'go', pattern: /go\s+mod\s+download/ },
        { type: 'maven', pattern: /mvn\s+install/ },
        { type: 'gradle', pattern: /gradle\s+build/ },
        { type: 'apt', pattern: /apt-get\s+install/ }
      ];

      // Scan all jobs for install commands and cache artifacts
      const jobsWithCache = new Set<string>();

      for (const job of workflow.jobs) {
        let hasCache = false;

        // Check artifacts explicitly typed as CACHE
        if (job.artifacts?.some(a => a.type === 'CACHE')) {
          hasCache = true;
        }

        for (const step of job.steps) {
          // Check step for cache
          if (step.uses && (/actions\/cache/i.test(step.uses) || /cache/i.test(step.uses))) {
            hasCache = true;
          }
          if (step.run && /cache/i.test(step.run)) {
            hasCache = true;
          }

          if (step.run) {
            for (const p of INSTALL_PATTERNS) {
              if (p.pattern.test(step.run)) {
                if (!installMap.has(p.type)) {
                  installMap.set(p.type, []);
                }
                installMap.get(p.type)!.push({
                  jobId: job.id,
                  jobName: job.name,
                  stepId: step.id,
                  stepName: step.name || step.id,
                  command: step.run
                });
              }
            }
          }
        }

        if (hasCache) {
          jobsWithCache.add(job.id);
        }
      }

      // Check for same type without cache
      for (const [type, installs] of installMap.entries()) {
        if (installs.length >= 2) {
          const uncachedInstalls = installs.filter(i => !jobsWithCache.has(i.jobId));
          if (uncachedInstalls.length >= 2) {
            const count = uncachedInstalls.length;
            const jobNames = uncachedInstalls.map(i => i.jobName);
            
            let remediation = "Configure a cache for these dependencies to share between jobs.";
            if (type === 'npm') {
              remediation = `Share node_modules cache between jobs:
 - name: Cache node_modules
   uses: actions/cache@v3
   with:
     path: ~/.npm
     key: \${{ runner.os }}-node-\${{ hashFiles('**/package-lock.json') }}
 Then in dependent jobs, restore the cache before running tests.`;
            } else if (type === 'pip') {
              remediation = `Cache pip packages:
 - uses: actions/cache@v3
   with:
     path: ~/.cache/pip
     key: \${{ runner.os }}-pip-\${{ hashFiles('**/requirements*.txt') }}`;
            } else if (type === 'maven') {
              remediation = `Cache Maven repository:
 - uses: actions/cache@v3
   with:
     path: ~/.m2
     key: \${{ runner.os }}-m2-\${{ hashFiles('**/pom.xml') }}`;
            }

            findings.push(this.buildResult({
              title: `${type} install runs in ${count} jobs without cache sharing`,
              description: `Jobs ${jobNames.join(', ')} all run ${type} installs independently. Without a shared cache, dependencies are downloaded and installed fresh on every job, multiplying build time by ${count}x.`,
              remediation,
              evidence: uncachedInstalls.map(i => `Job: ${i.jobName}, Command: ${i.command}`).join('\n'),
              confidence: RuleConfidence.CERTAIN,
              metadata: {
                installType: type,
                affectedJobs: uncachedInstalls.map(i => i.jobId),
                estimatedWastedMinutes: count * 2
              }
            }, this.buildLocation(workflow, context, { field: 'jobs' })));
          }
        }
      }

      // Detect install in parent and child job
      for (const job of workflow.jobs) {
        if (!job.needs || job.needs.length === 0) continue;
        
        for (const need of job.needs) {
          const parentJob = workflow.jobs.find(j => j.id === need.jobId);
          if (!parentJob) continue;

          for (const [type, installs] of installMap.entries()) {
            const childHasType = installs.find(i => i.jobId === job.id);
            const parentHasType = installs.find(i => i.jobId === parentJob.id);

            if (childHasType && parentHasType) {
              // Both run same install type. Does parent pass node_modules/dist to child?
              let sharesArtifacts = false;
              if (parentJob.artifacts?.some(a => a.type === 'UPLOAD')) {
                // Approximate check: if parent uploads artifacts, it might be passing them
                sharesArtifacts = true; 
              }
              if (job.artifacts?.some(a => a.type === 'DOWNLOAD')) {
                sharesArtifacts = true;
              }

              if (!sharesArtifacts && !jobsWithCache.has(job.id)) {
                findings.push(this.buildResult({
                  title: `Job '${job.name}' reinstalls dependencies already installed by parent job '${parentJob.name}'`,
                  severity: RuleSeverity.MEDIUM,
                  description: `Child job '${job.name}' depends on '${parentJob.name}' but runs its own ${type} installation. Consider passing the installed dependencies as an artifact or sharing a workspace to save time.`,
                  remediation: `Use artifacts to pass dependencies from ${parentJob.name} to ${job.name}, or use a shared cache.`,
                  evidence: `Parent: ${parentHasType.command}\nChild: ${childHasType.command}`,
                  confidence: RuleConfidence.LIKELY,
                  metadata: {
                    installType: type,
                    parentJob: parentJob.id,
                    childJob: job.id
                  }
                }, this.buildLocation(workflow, context, { jobId: job.id, jobName: job.name, field: `jobs.${job.id}` })));
              }
            }
          }
        }
      }

      return findings;
    });
  }
}

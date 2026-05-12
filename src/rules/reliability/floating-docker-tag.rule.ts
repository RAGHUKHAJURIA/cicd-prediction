import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, DockerImageRef } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

export class FloatingDockerTagRule extends BaseRule {
  id = 'reliability-floating-docker-tag';
  name = 'Floating Docker Image Tag';
  category = RuleCategory.RELIABILITY;
  severity = RuleSeverity.HIGH;
  description = 'Detects Docker images using floating tags like :latest or no tag';
  rationale = 'Floating tags can silently pull breaking changes into your pipeline, causing unpredictable failures.';
  references = ['https://docs.docker.com/develop/dev-best-practices/'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      const checkImageRef = (imageRef: DockerImageRef, field: string, jobId: string | null = null, jobName: string | null = null, stepId: string | null = null, stepName: string | null = null) => {
        if (imageRef.isFloating) {
          let sev = RuleSeverity.HIGH; // 'latest' or no tag

          if (imageRef.tag && imageRef.tag !== 'latest' && !imageRef.isPinned) {
            sev = RuleSeverity.MEDIUM; // specific tag but not pinned
          }

          results.push(
            this.buildResult(
              {
                title: `Job '${jobName || jobId || 'build'}' uses floating Docker image '${imageRef.image}:${imageRef.tag || 'latest'}'`,
                description: this.rationale,
                remediation: `Pin the image to a specific digest:\nnode:18-alpine@sha256:{digest}\nFind the digest: docker pull node:18-alpine && docker inspect node:18-alpine`,
                evidence: `${imageRef.registry ? imageRef.registry + '/' : ''}${imageRef.image}${imageRef.tag ? ':' + imageRef.tag : ''}`,
                confidence: RuleConfidence.CERTAIN,
                severity: sev
              },
              this.buildLocation(workflow, context, { jobId, jobName, stepId, stepName, field })
            )
          );
        } else if (!imageRef.isPinned) {
          // not floating but not pinned -> specific tag only -> covered by MEDIUM above if isFloating was correctly set, 
          // but if isFloating=false means it has a tag, we should still flag it if not pinned according to instructions.
          // The prompt says "imageRef.isPinned === false but has a specific tag -> MEDIUM".
          // In the parser, isFloating=false means it has a specific tag (not latest). 
          // So if it's not pinned, we flag it as MEDIUM.
          results.push(
            this.buildResult(
              {
                title: `Job '${jobName || jobId || 'build'}' uses unpinned Docker image '${imageRef.image}:${imageRef.tag}'`,
                description: this.rationale,
                remediation: `Pin the image to a specific digest for reliability.`,
                evidence: `${imageRef.registry ? imageRef.registry + '/' : ''}${imageRef.image}:${imageRef.tag}`,
                confidence: RuleConfidence.CERTAIN,
                severity: RuleSeverity.MEDIUM
              },
              this.buildLocation(workflow, context, { jobId, jobName, stepId, stepName, field })
            )
          );
        }
      };

      workflow.jobs.forEach(job => {
        if (job.container) {
          checkImageRef(job.container.imageRef, `jobs.${job.id}.container.image`, job.id, job.name);
        }

        job.services.forEach((service, idx) => {
          checkImageRef(service.container.imageRef, `jobs.${job.id}.services[${idx}].image`, job.id, job.name);
        });
      });

      return results;
    });
  }
}

ruleRegistry.register(new FloatingDockerTagRule());

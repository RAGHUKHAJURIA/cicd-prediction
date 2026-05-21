import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, DockerImageRef } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

const TRUSTED_REGISTRIES = [
  null, // Docker Hub
  'docker.io',
  'ghcr.io',
  'gcr.io',
  'us.gcr.io',
  'eu.gcr.io',
  'asia.gcr.io',
  'us-docker.pkg.dev',
  'europe-docker.pkg.dev',
  'asia-docker.pkg.dev',
  'public.ecr.aws',
  'mcr.microsoft.com',
  'registry.access.redhat.com',
  'registry.redhat.io',
  'quay.io',
  'index.docker.io'
];

const POPULAR_IMAGES = ['node', 'python', 'alpine', 'ubuntu', 'nginx', 'postgres', 'redis', 'mysql', 'mongo', 'golang', 'java', 'openjdk'];

export class UntrustedRegistryRule extends BaseRule {
  id = 'security-untrusted-registry';
  name = 'Docker Image from Untrusted or Unknown Registry';
  category = RuleCategory.SECURITY;
  severity = RuleSeverity.HIGH;
  description = 'Detects Docker images originating from unknown or untrusted registries, or possible typosquatting.';
  rationale = 'Using images from untrusted sources increases the risk of supply chain attacks, malware, or backdoors.';
  references = ['https://docs.docker.com/engine/security/'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      const checkImageRef = (imageRef: DockerImageRef, field: string, jobId: string | null = null, jobName: string | null = null, stepId: string | null = null, stepName: string | null = null) => {
        const fullImageString = `${imageRef.registry ? imageRef.registry + '/' : ''}${imageRef.image}${imageRef.tag ? ':' + imageRef.tag : ''}${imageRef.digest ? '@' + imageRef.digest : ''}`;

        let isTrusted = TRUSTED_REGISTRIES.includes(imageRef.registry);
        let conf = RuleConfidence.LIKELY;

        if (imageRef.registry === null && imageRef.image.includes('/')) {
          const parts = imageRef.image.split('/');
          if (parts.length === 2) {
            isTrusted = true; // Docker hub org image
          } else {
            isTrusted = false;
            conf = RuleConfidence.POSSIBLE;
          }
        }

        if (!isTrusted) {
          results.push(
            this.buildResult(
              {
                title: `Image uses an untrusted or unknown registry`,
                description: this.rationale,
                remediation: `Use an officially supported registry or mirror.`,
                evidence: fullImageString,
                confidence: conf,
                severity: RuleSeverity.HIGH
              },
              this.buildLocation(workflow, context, { jobId, jobName, stepId, stepName, field })
            )
          );
        }

        // CHECK 1 — No digest pinning on production images
        if (isTrusted && !imageRef.isPinned) {
          results.push(
            this.buildResult(
              {
                title: `Image not pinned to digest`,
                description: 'Unpinned images from trusted registries are still susceptible to supply chain attacks if the tag is overwritten.',
                remediation: `Pin the image to a digest (e.g., @sha256:...).`,
                evidence: fullImageString,
                confidence: RuleConfidence.CERTAIN,
                severity: RuleSeverity.LOW
              },
              this.buildLocation(workflow, context, { jobId, jobName, stepId, stepName, field })
            )
          );
        }

        // CHECK 2 — Suspicious image names (typosquatting)
        const parts = imageRef.image.split('/');
        const namePart = parts[parts.length - 1].split(':')[0]; // remove tag if present in image part
        
        for (const popular of POPULAR_IMAGES) {
          if (namePart !== popular && namePart.includes(popular) && Math.abs(namePart.length - popular.length) <= 3) {
            results.push(
              this.buildResult(
                {
                  title: `Image name may be a typosquatted version of '${popular}'`,
                  description: 'Attackers create images with names similar to popular ones to trick users into downloading malware.',
                  remediation: `Verify the image name is exactly correct.`,
                  evidence: imageRef.image,
                  confidence: RuleConfidence.POSSIBLE,
                  severity: RuleSeverity.HIGH
                },
                this.buildLocation(workflow, context, { jobId, jobName, stepId, stepName, field })
              )
            );
          }
        }
      };

      workflow.jobs.forEach((job) => {
        if (job.container) {
          checkImageRef(job.container.imageRef, `jobs.${job.id}.container.image`, job.id, job.name);
        }

        job.services.forEach((service, idx) => {
          checkImageRef(service.container.imageRef, `jobs.${job.id}.services[${idx}].image`, job.id, job.name);
        });

        job.steps.forEach((step, idx) => {
          if (step.uses?.startsWith('docker://')) {
            // Best effort parsing for docker:// URLs
            const imageStr = step.uses.replace('docker://', '');
            const hasDigest = imageStr.includes('@');
            const digestSplit = imageStr.split('@');
            const hasTag = digestSplit[0].includes(':');
            const tagSplit = digestSplit[0].split(':');
            
            const imagePart = tagSplit[0];
            const tag = hasTag ? tagSplit[1] : null;
            const digest = hasDigest ? digestSplit[1] : null;
            
            let registry = null;
            let image = imagePart;
            if (imagePart.includes('/') && (imagePart.includes('.') || imagePart.includes('localhost'))) {
              const slashIdx = imagePart.indexOf('/');
              registry = imagePart.substring(0, slashIdx);
              image = imagePart.substring(slashIdx + 1);
            }

            const ref: DockerImageRef = {
              registry,
              image,
              tag,
              digest,
              isFloating: !tag || tag === 'latest',
              isPinned: !!digest
            };

            checkImageRef(ref, `jobs.${job.id}.steps[${idx}].uses`, job.id, job.name, step.id, step.name);
          }
        });
      });

      return results;
    });
  }
}

ruleRegistry.register(new UntrustedRegistryRule());

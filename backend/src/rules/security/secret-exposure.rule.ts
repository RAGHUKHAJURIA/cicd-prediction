import { BaseRule, RuleCategory, RuleSeverity, RuleConfidence, RuleResult, RuleContext } from '../types';
import { NormalizedWorkflow, SecretSource, EnvVar } from '../../models/workflow.model';
import { ruleRegistry } from '../rule-registry';

interface SecretMatch {
  pattern: string;
  match: string;
  confidence: 'high' | 'medium';
}

export function detectSecretPatterns(value: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  if (!value || typeof value !== 'string') return matches;

  const patterns = [
    { name: 'GitHub PAT', regex: /ghp_[a-zA-Z0-9]{36}/g, conf: 'high' as const },
    { name: 'GitHub App token', regex: /ghs_[a-zA-Z0-9]{36}/g, conf: 'high' as const },
    { name: 'GitHub OAuth', regex: /gho_[a-zA-Z0-9]{36}/g, conf: 'high' as const },
    { name: 'GitHub fine-grained', regex: /github_pat_[a-zA-Z0-9_]{82}/g, conf: 'high' as const },
    { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g, conf: 'high' as const },
    { name: 'AWS Secret Key', regex: /(?:aws_secret|secret_key|secret_access_key)[^a-zA-Z0-9]+([0-9a-zA-Z/+]{40})/gi, conf: 'high' as const, group: 1 },
    { name: 'Slack token', regex: /xox[baprs]-[0-9a-zA-Z-]{10,}/g, conf: 'high' as const },
    { name: 'Stripe key', regex: /sk_live_[0-9a-zA-Z]{24,}/g, conf: 'high' as const },
    { name: 'Stripe publishable', regex: /pk_live_[0-9a-zA-Z]{24,}/g, conf: 'high' as const },
    { name: 'SendGrid', regex: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, conf: 'high' as const },
    { name: 'Twilio SID', regex: /AC[a-zA-Z0-9]{32}/g, conf: 'high' as const },
    { name: 'JWT token', regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, conf: 'high' as const },
    { name: 'Private key header', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g, conf: 'high' as const },
    { name: 'Generic API key', regex: /[aA][pP][iI][_-]?[kK][eE][yY]['":\s=]+([a-zA-Z0-9_\-]{20,})/g, conf: 'high' as const, group: 1 },
    { name: 'Generic secret', regex: /[sS][eE][cC][rR][eE][tT]['":\s=]+([a-zA-Z0-9_\-]{20,})/g, conf: 'high' as const, group: 1 },
    { name: 'Generic password', regex: /[pP][aA][sS][sS][wW][oO][rR][dD]['":\s=]+([a-zA-Z0-9_\-!@#$%]{8,})/g, conf: 'high' as const, group: 1 },
    { name: 'Generic token', regex: /[tT][oO][kK][eE][nN]['":\s=]+([a-zA-Z0-9_\-]{20,})/g, conf: 'high' as const, group: 1 }
  ];

  for (const { name, regex, conf, group } of patterns) {
    let match;
    while ((match = regex.exec(value)) !== null) {
      matches.push({
        pattern: name,
        match: group !== undefined && match[group] ? match[group] : match[0],
        confidence: conf
      });
    }
  }

  // Medium confidence: Hex string 32+ or Base64 40+ if there's a secret key indication in the string
  // It's hard to reliably check key names without the key, so we check if the string contains key-like hints
  if (/(?:secret|token|key|password|cred|auth)['":\s=]+([a-fA-F0-9]{32,})/i.test(value)) {
    const m = /(?:secret|token|key|password|cred|auth)['":\s=]+([a-fA-F0-9]{32,})/ig;
    let match;
    while ((match = m.exec(value)) !== null) {
      matches.push({ pattern: 'Hex string (32+)', match: match[1], confidence: 'medium' });
    }
  }
  
  if (/(?:secret|token|key|password|cred|auth)['":\s=]+(?:[A-Za-z0-9+/]{40,}=*)/i.test(value)) {
    const m = /(?:secret|token|key|password|cred|auth)['":\s=]+([A-Za-z0-9+/]{40,}=*)/ig;
    let match;
    while ((match = m.exec(value)) !== null) {
      matches.push({ pattern: 'Base64 string (40+)', match: match[1], confidence: 'medium' });
    }
  }

  return matches;
}

function redact(secret: string): string {
  if (!secret) return '****';
  if (secret.length <= 4) return '****';
  return secret.substring(0, 4) + '****...****';
}

export class SecretExposureRule extends BaseRule {
  id = 'security-secret-exposure';
  name = 'Hardcoded Secret or Credential Exposure';
  category = RuleCategory.SECURITY;
  severity = RuleSeverity.CRITICAL;
  description = 'Detects hardcoded secrets or credentials in workflow files';
  rationale = 'Hardcoded secrets appear in version control history even after removal, and can be extracted from CI logs.';
  references = ['https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning'];

  check(workflow: NormalizedWorkflow, context: RuleContext): RuleResult[] {
    return this.safeCheck(workflow, context, () => {
      const results: RuleResult[] = [];

      const addFinding = (match: SecretMatch | { pattern: string, match: string }, field: string, jobId: string | null = null, jobName: string | null = null, stepId: string | null = null, stepName: string | null = null, conf: RuleConfidence = RuleConfidence.LIKELY) => {
        results.push(
          this.buildResult(
            {
              title: `Potential hardcoded ${match.pattern} detected`,
              description: this.rationale,
              remediation: `Move this value to encrypted secrets storage. Use \${{ secrets.MY_SECRET }} in GitHub Actions or masked variables in GitLab CI.`,
              evidence: redact(match.match),
              confidence: conf,
              metadata: { pattern: match.pattern }
            },
            this.buildLocation(workflow, context, { jobId, jobName, stepId, stepName, field })
          )
        );
      };

      const checkEnv = (envs: EnvVar[], fieldPrefix: string, jobId: string | null = null, jobName: string | null = null, stepId: string | null = null, stepName: string | null = null) => {
        envs.forEach((env, idx) => {
          if (!env.value || env.isDynamic) return;

          // 1. Check regex patterns
          const matches = detectSecretPatterns(env.value);
          for (const m of matches) {
            addFinding(m, `${fieldPrefix}[${idx}].value`, jobId, jobName, stepId, stepName, m.confidence === 'high' ? RuleConfidence.LIKELY : RuleConfidence.POSSIBLE);
          }

          // 2. Check heuristic
          if (env.containsSecret && matches.length === 0) {
            // Medium confidence checks
            if (/^[a-fA-F0-9]{32,}$/.test(env.value)) {
              addFinding({ pattern: 'Hex string (32+)', match: env.value }, `${fieldPrefix}[${idx}].value`, jobId, jobName, stepId, stepName, RuleConfidence.POSSIBLE);
            } else if (/^[A-Za-z0-9+/]{40,}=*$/.test(env.value)) {
              addFinding({ pattern: 'Base64 string (40+)', match: env.value }, `${fieldPrefix}[${idx}].value`, jobId, jobName, stepId, stepName, RuleConfidence.POSSIBLE);
            } else if (env.value.length >= 8 && !env.value.includes('${{')) {
              addFinding({ pattern: 'Credential value', match: env.value }, `${fieldPrefix}[${idx}].value`, jobId, jobName, stepId, stepName, RuleConfidence.POSSIBLE);
            }
          }
        });
      };

      // 1. globalEnv values
      checkEnv(workflow.globalEnv, 'globalEnv');

      // 8. SecretRef.value where source === HARDCODED
      workflow.globalSecrets.forEach((sec, idx) => {
        if (sec.source === SecretSource.HARDCODED && sec.value) {
          addFinding({ pattern: 'Hardcoded Secret', match: sec.value }, `globalSecrets[${idx}].value`);
        }
      });

      workflow.jobs.forEach(job => {
        // 2. Job env values
        checkEnv(job.env, `jobs.${job.id}.env`, job.id, job.name);

        job.secrets.forEach((sec, idx) => {
          if (sec.source === SecretSource.HARDCODED && sec.value) {
            addFinding({ pattern: 'Hardcoded Secret', match: sec.value }, `jobs.${job.id}.secrets[${idx}].value`, job.id, job.name);
          }
        });

        // 6. Container env values
        if (job.container) {
          checkEnv(job.container.env, `jobs.${job.id}.container.env`, job.id, job.name);
        }

        // 7. Service env values
        job.services.forEach((service, sIdx) => {
          checkEnv(service.container.env, `jobs.${job.id}.services[${sIdx}].container.env`, job.id, job.name);
        });

        job.steps.forEach((step, stepIdx) => {
          // 3. Step env values
          checkEnv(step.env, `jobs.${job.id}.steps[${stepIdx}].env`, job.id, job.name, step.id, step.name);

          // 4. Step run commands
          if (step.run) {
            const matches = detectSecretPatterns(step.run);
            matches.forEach(m => addFinding(m, `jobs.${job.id}.steps[${stepIdx}].run`, job.id, job.name, step.id, step.name, m.confidence === 'high' ? RuleConfidence.LIKELY : RuleConfidence.POSSIBLE));
          }

          // 5. Step "with" inputs
          Object.entries(step.with || {}).forEach(([key, val]) => {
            const matches = detectSecretPatterns(val);
            matches.forEach(m => addFinding(m, `jobs.${job.id}.steps[${stepIdx}].with.${key}`, job.id, job.name, step.id, step.name, m.confidence === 'high' ? RuleConfidence.LIKELY : RuleConfidence.POSSIBLE));
            
            // Heuristic
            if (matches.length === 0 && /(?:secret|token|key|password|cred)/i.test(key) && val.length >= 8 && !val.includes('${{')) {
               addFinding({ pattern: 'Credential value', match: val }, `jobs.${job.id}.steps[${stepIdx}].with.${key}`, job.id, job.name, step.id, step.name, RuleConfidence.POSSIBLE);
            }
          });
        });
      });

      return results;
    });
  }
}

ruleRegistry.register(new SecretExposureRule());

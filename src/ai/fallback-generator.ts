import { AIFinding } from '../engine/report-builder';
import { patchBuilder } from './patch-builder';
import { RemediationResult, ValidationStatus } from './remediation-generator';

export class FallbackGenerator {
  generateFallback(
    ruleId: string,
    finding: AIFinding,
    _rejectionReason: string
  ): RemediationResult {
    const fallbackMap: Record<string, { instruction: string, effort: string, references: string[] }> = {
      'security-unpinned-action': {
        instruction: "Pin this GitHub Action to a specific commit SHA.\n\n1. Go to https://github.com/{owner}/{repo}/commits/{tag}\n2. Copy the full SHA of the latest commit on that tag\n3. Replace: uses: {owner}/{repo}@{tag}\n   With:    uses: {owner}/{repo}@{sha}  # {tag}\n\nExample:\n  uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675  # v4",
        effort: 'minutes',
        references: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions']
      },
      'reliability-floating-docker-tag': {
        instruction: "Replace the floating image tag with a specific version:\n\nInstead of: image: {image}:latest\nUse:        image: {image}:SPECIFIC_VERSION\n\nTo find the latest stable version:\n  docker pull {image}:latest\n  docker inspect {image}:latest --format='{{index .RepoDigests 0}}'\n\nFor maximum stability, pin to digest:\n  image: {image}@sha256:DIGEST_HERE",
        effort: 'minutes',
        references: ['https://docs.docker.com/develop/dev-best-practices/']
      },
      'reliability-missing-timeout': {
        instruction: "Add timeout-minutes to prevent hung pipelines:\n\njobs:\n  your-job:\n    timeout-minutes: 30  # Adjust as needed\n    runs-on: ubuntu-latest\n    steps:\n      ...\n\nRecommended timeouts:\n  - Unit tests: 15-30 minutes\n  - Integration tests: 30-60 minutes\n  - Build jobs: 30-45 minutes\n  - Deployment jobs: 30-60 minutes",
        effort: 'minutes',
        references: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes']
      },
      'security-secret-exposure': {
        instruction: "URGENT: Remove the hardcoded secret immediately.\n\n1. Remove the secret from the file\n2. Rotate/revoke the exposed credential immediately\n3. The secret is in git history — treat it as compromised\n4. Use git filter-branch or BFG Repo Cleaner to remove from history\n5. Store in GitHub Secrets: Settings → Secrets → Actions\n6. Reference in workflow: ${{ secrets.YOUR_SECRET_NAME }}",
        effort: 'hours',
        references: ['https://docs.github.com/en/actions/security-guides/encrypted-secrets']
      },
      'reliability-flaky-install': {
        instruction: "Replace non-deterministic install with locked install:\n\nnpm: Replace 'npm install' with 'npm ci'\n  - npm ci requires package-lock.json\n  - Installs exact locked versions\n  - Fails if lock file is out of sync (good!)\n\nyarn: Replace 'yarn install' with 'yarn install --frozen-lockfile'\npip: Use 'pip install -r requirements.txt' with pinned versions in requirements.txt",
        effort: 'minutes',
        references: ['https://docs.npmjs.com/cli/v8/commands/npm-ci']
      },
      'performance-missing-cache': {
        instruction: "Add dependency caching to speed up builds:\n\nFor npm (add before npm ci step):\n  - uses: actions/cache@v3\n    with:\n      path: ~/.npm\n      key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}\n      restore-keys: |\n        ${{ runner.os }}-node-\n\nFor pip:\n  - uses: actions/cache@v3\n    with:\n      path: ~/.cache/pip\n      key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements*.txt') }}",
        effort: 'minutes',
        references: ['https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows']
      }
    };

    const fallbackData = fallbackMap[ruleId] || {
      instruction: `Manual remediation required.\n\nFinding: ${finding.title}\nFile: ${finding.filePath}\nEvidence: ${finding.evidence}\n\nReview the finding details and apply the appropriate fix based on your specific configuration.`,
      effort: 'hours',
      references: []
    };

    let instruction = fallbackData.instruction;
    if (ruleId === 'security-unpinned-action') {
      const match = finding.evidence.match(/^([^@]+)@(.*)$/);
      if (match) {
        const [_, ownerRepo, tag] = match;
        const parts = ownerRepo.split('/');
        instruction = instruction.replace(/{owner}/g, parts[0] || 'owner')
          .replace(/{repo}/g, parts[1] || 'repo')
          .replace(/{tag}/g, tag);
      }
    } else if (ruleId === 'reliability-floating-docker-tag') {
      const img = finding.evidence.replace(/:latest$/, '');
      instruction = instruction.replace(/{image}/g, img);
    }

    return {
      findingRuleId: ruleId,
      findingFilePath: finding.filePath,
      severity: finding.severity,
      patch: patchBuilder.buildPatch(ruleId, finding.evidence, finding.filePath),
      aiPatch: null,
      diff: null,
      validationStatus: ValidationStatus.FALLBACK,
      finalRecommendation: instruction,
      remediationSource: 'none'
    };
  }

  generateBulkFallbacks(
    rejectedRemediations: Array<{
      finding: AIFinding,
      rejectionReason: string
    }>
  ): RemediationResult[] {
    return rejectedRemediations.map(r => this.generateFallback(r.finding.ruleId, r.finding, r.rejectionReason));
  }

  getDocumentationLink(ruleId: string): string {
    const mapVal = this.getMapVal(ruleId);
    return mapVal.references.length > 0 ? mapVal.references[0] : '';
  }

  private getMapVal(ruleId: string) {
    const map: Record<string, any> = {
      'security-unpinned-action': { references: ['https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions'] },
      'reliability-floating-docker-tag': { references: ['https://docs.docker.com/develop/dev-best-practices/'] },
      'reliability-missing-timeout': { references: ['https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes'] },
      'security-secret-exposure': { references: ['https://docs.github.com/en/actions/security-guides/encrypted-secrets'] },
      'reliability-flaky-install': { references: ['https://docs.npmjs.com/cli/v8/commands/npm-ci'] },
      'performance-missing-cache': { references: ['https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows'] }
    };
    return map[ruleId] || { references: [] };
  }
}

export const fallbackGenerator = new FallbackGenerator();

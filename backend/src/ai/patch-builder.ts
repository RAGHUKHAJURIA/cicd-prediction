import { AIFinding } from '../engine/report-builder';
import { NormalizedWorkflow } from '../models/workflow.model';

export interface PatchResult {
  ruleId: string;
  filePath: string;
  patchType: PatchType;
  before: string;
  after: string;
  explanation: string;
  isFullFile: boolean;
  confidence: 'certain' | 'likely' | 'manual-review-required';
}

export interface DiffOutput {
  ruleId: string;
  filePath: string;
  unified: string;
  before: string;
  after: string;
  linesChanged: number;
  explanation: string;
}

export enum PatchType {
  YAML_SNIPPET     = 'yaml_snippet',
  DOCKERFILE_LINE  = 'dockerfile_line',
  FULL_FILE        = 'full_file',
  APPEND_BLOCK     = 'append_block',
  REPLACE_VALUE    = 'replace_value'
}

export class PatchBuilder {

  buildPatch(
    ruleId: string,
    evidence: string,
    filePath: string,
    context?: Record<string, unknown>
  ): PatchResult | null {
    switch (ruleId) {
      case 'reliability-floating-docker-tag':
        return this.buildFloatingTagPatch(evidence, filePath);
      case 'reliability-missing-timeout':
        return this.buildMissingTimeoutPatch(evidence, filePath, context);
      case 'reliability-missing-retry':
        return this.buildMissingRetryPatch(evidence, filePath, context);
      case 'reliability-flaky-install':
        return this.buildFlakyInstallPatch(evidence, filePath);
      case 'reliability-missing-healthcheck':
        return this.buildHealthcheckPatch(evidence, filePath);
      case 'security-unpinned-action':
        return this.buildUnpinnedActionPatch(evidence, filePath);
      case 'security-insecure-permissions':
        return this.buildPermissionsPatch(evidence, filePath);
      case 'performance-missing-cache':
        return this.buildMissingCachePatch(evidence, filePath, context);
      default:
        return null;
    }
  }

  private buildFloatingTagPatch(evidence: string, filePath: string): PatchResult {
    return {
      ruleId: 'reliability-floating-docker-tag',
      filePath,
      patchType: PatchType.REPLACE_VALUE,
      before: `image: ${evidence}`,
      after: `# Pin to specific version and digest for reproducibility\nimage: node:20-alpine  # Replace :latest with specific version\n# To pin to digest: docker pull node:20-alpine && docker inspect --format='{{index .RepoDigests 0}}' node:20-alpine`,
      explanation: "Replaced floating 'latest' tag with specific version to ensure reproducible builds",
      isFullFile: false,
      confidence: 'manual-review-required'
    };
  }

  private buildMissingTimeoutPatch(evidence: string, filePath: string, context?: Record<string, unknown>): PatchResult {
    const jobName = (context?.jobName as string) || evidence;
    let timeout = 30;
    if (jobName.match(/deploy|release|publish/i)) timeout = 60;
    else if (jobName.match(/build|compile/i)) timeout = 45;

    let after = `  ${evidence}:\n    timeout-minutes: ${timeout}`;
    if (filePath.includes('.gitlab-ci')) {
      after = `${evidence}:\n  timeout: ${timeout} minutes`;
    }

    return {
      ruleId: 'reliability-missing-timeout',
      filePath,
      patchType: PatchType.APPEND_BLOCK,
      before: filePath.includes('.gitlab-ci') ? `${evidence}:` : `  ${evidence}:`,
      after,
      explanation: `Added timeout of ${timeout} minutes to prevent hung jobs`,
      isFullFile: false,
      confidence: 'certain'
    };
  }

  private buildFlakyInstallPatch(evidence: string, filePath: string): PatchResult {
    let after = evidence;
    let explanation = '';
    if (evidence.includes('npm install')) {
      after = evidence.replace('npm install', 'npm ci');
      explanation = "npm ci installs exact locked versions, npm install may modify package-lock.json and install different versions";
    } else if (evidence.includes('yarn install')) {
      after = evidence.replace('yarn install', 'yarn install --frozen-lockfile');
      explanation = "Added --frozen-lockfile to ensure reproducible yarn installs";
    } else if (evidence.includes('pip install')) {
      after = evidence.replace('pip install -r requirements.txt', 'pip install -r requirements.txt --no-cache-dir');
      explanation = "Added --no-cache-dir to prevent caching issues with pip";
    }

    return {
      ruleId: 'reliability-flaky-install',
      filePath,
      patchType: PatchType.REPLACE_VALUE,
      before: evidence,
      after: after,
      explanation,
      isFullFile: false,
      confidence: 'certain'
    };
  }

  private buildUnpinnedActionPatch(evidence: string, filePath: string): PatchResult {
    const match = evidence.match(/^([^@]+)@(.*)$/);
    const ownerRepo = match ? match[1] : evidence;
    const ref = match ? match[2] : 'unknown';

    return {
      ruleId: 'security-unpinned-action',
      filePath,
      patchType: PatchType.REPLACE_VALUE,
      before: `uses: ${evidence}`,
      after: `uses: ${ownerRepo}@{REPLACE_WITH_SHA}  # was: ${ref}\n# Find SHA: https://github.com/${ownerRepo}/commits/${ref}`,
      explanation: "Action pinned to SHA digest instead of mutable tag. Find the SHA for your target version at the URL in the comment.",
      isFullFile: false,
      confidence: 'manual-review-required'
    };
  }

  private buildMissingRetryPatch(evidence: string, filePath: string, _context?: Record<string, unknown>): PatchResult {
    let before = '';
    let after = '';
    
    if (filePath.includes('.github/workflows')) {
      before = `  ${evidence}:\n    runs-on: ubuntu-latest`;
      after = `  ${evidence}:\n    runs-on: ubuntu-latest\n    # Retry on transient failures\n    strategy:\n      max-parallel: 1\n    # For step-level retry, use nick-fields/retry action:\n    steps:\n      - uses: nick-fields/retry@v2\n        with:\n          timeout_minutes: 10\n          max_attempts: 3\n          command: YOUR_COMMAND_HERE`;
    } else {
      before = `${evidence}:`;
      after = `${evidence}:\n  retry:\n    max: 2\n    when:\n      - runner_system_failure\n      - stuck_or_timeout_failure`;
    }

    return {
      ruleId: 'reliability-missing-retry',
      filePath,
      patchType: PatchType.APPEND_BLOCK,
      before,
      after,
      explanation: "Added retry mechanism for transient failures",
      isFullFile: false,
      confidence: 'manual-review-required'
    };
  }

  private buildPermissionsPatch(evidence: string, filePath: string): PatchResult {
    return {
      ruleId: 'security-insecure-permissions',
      filePath,
      patchType: PatchType.APPEND_BLOCK,
      before: evidence,
      after: `${evidence}\npermissions:\n  contents: read\n  actions: read\n  # Add only the permissions your workflow actually needs`,
      explanation: "Added explicitly restricted permissions block",
      isFullFile: false,
      confidence: 'manual-review-required'
    };
  }

  private buildMissingCachePatch(evidence: string, filePath: string, _context?: Record<string, unknown>): PatchResult {
    let after = evidence;
    if (evidence.includes('npm')) {
      after = `- name: Cache npm dependencies\n  uses: actions/cache@v3\n  with:\n    path: ~/.npm\n    key: \${{ runner.os }}-node-\${{ hashFiles('**/package-lock.json') }}\n    restore-keys: |\n      \${{ runner.os }}-node-\n- name: Install dependencies\n  run: npm ci`;
    }

    return {
      ruleId: 'performance-missing-cache',
      filePath,
      patchType: PatchType.APPEND_BLOCK,
      before: evidence,
      after,
      explanation: "Added caching step to improve build performance",
      isFullFile: false,
      confidence: 'certain'
    };
  }

  private buildHealthcheckPatch(evidence: string, filePath: string): PatchResult {
    return {
      ruleId: 'reliability-missing-healthcheck',
      filePath,
      patchType: PatchType.APPEND_BLOCK,
      before: evidence,
      after: `HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\\n  CMD curl -f http://localhost:3000/health || exit 1\n\n# Then your existing CMD:\n${evidence}`,
      explanation: "Added healthcheck instruction",
      isFullFile: false,
      confidence: 'manual-review-required'
    };
  }

  buildDiff(patch: PatchResult): DiffOutput {
    const beforeLines = patch.before.split('\n');
    const afterLines = patch.after.split('\n');
    let unified = `--- a/${patch.filePath}\n+++ b/${patch.filePath}\n@@ -1,${beforeLines.length} +1,${afterLines.length} @@\n`;
    
    for (const line of beforeLines) {
      unified += `-${line}\n`;
    }
    for (const line of afterLines) {
      unified += `+${line}\n`;
    }

    return {
      ruleId: patch.ruleId,
      filePath: patch.filePath,
      unified,
      before: patch.before,
      after: patch.after,
      linesChanged: beforeLines.length + afterLines.length,
      explanation: patch.explanation
    };
  }

  buildMultiplePatches(findings: AIFinding[], _workflows: NormalizedWorkflow[]): PatchResult[] {
    const results: PatchResult[] = [];
    const seen = new Set<string>();

    for (const finding of findings) {
      const key = `${finding.ruleId}:${finding.filePath}`;
      if (seen.has(key)) continue;

      const patch = this.buildPatch(finding.ruleId, finding.evidence, finding.filePath);
      if (patch) {
        results.push(patch);
        seen.add(key);
      }
    }

    const confidenceOrder: Record<string, number> = {
      'certain': 1,
      'likely': 2,
      'manual-review-required': 3
    };

    results.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);
    return results;
  }
}

export const patchBuilder = new PatchBuilder();

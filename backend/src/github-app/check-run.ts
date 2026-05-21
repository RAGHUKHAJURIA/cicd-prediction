import { GitHubAppAuth } from './app-config';
import { GateConfig } from '../integrations/gates/deployment-gate';

export class CheckRunManager {
  constructor(private auth: GitHubAppAuth) {}

  async createCheckRun(
    owner: string,
    repo: string,
    headSha: string,
    installationId: number
  ): Promise<number> {
    const octokit = await this.auth.getInstallationOctokit(installationId);
    
    const { data } = await octokit.rest.checks.create({
      owner,
      repo,
      name: 'CI/CD Reliability Analysis',
      head_sha: headSha,
      status: 'in_progress',
    });

    return data.id;
  }

  async updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    scan: any,
    installationId: number,
    gateConfig: GateConfig,
    dashboardUrl: string
  ): Promise<void> {
    const octokit = await this.auth.getInstallationOctokit(installationId);
    
    let conclusion: 'success' | 'failure' | 'neutral' = 'neutral';
    let title = `⚠️ Grade ${scan.riskGrade} — review recommended`;
    let summary = 'Review findings before merging.';

    const isBlocked = gateConfig.enabled && gateConfig.blockOnGrades.includes(scan.riskGrade as any);
    
    if (isBlocked || (gateConfig.enabled && gateConfig.blockOnCritical && scan.criticalCount > 0) || (gateConfig.enabled && scan.riskScore > gateConfig.maxScore)) {
      conclusion = 'failure';
      title = `⛔ Pipeline blocked — risk grade ${scan.riskGrade}`;
      summary = 'Critical reliability issues must be resolved before this PR can be merged.';
    } else if (scan.riskGrade === 'A' || scan.riskGrade === 'B') {
      conclusion = 'success';
      title = '✅ Pipeline reliability check passed';
      summary = 'No critical or high issues found.';
    }

    const text = `
## CI/CD Reliability Analysis Result

**Risk Grade**: ${scan.riskGrade} | **Score**: ${scan.riskScore}/100

| Severity | Count |
|----------|-------|
| 🔴 Critical | ${scan.criticalCount} |
| 🟠 High | ${scan.highCount} |
| 🟡 Medium | ${scan.mediumCount} |
| 🔵 Low | ${scan.lowCount} |

[View full report](${dashboardUrl}/repos/${scan.repoId}/scans/${scan.id})
    `;

    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion,
      output: {
        title,
        summary,
        text,
      }
    });
  }

  async failCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    error: string,
    installationId: number
  ): Promise<void> {
    const octokit = await this.auth.getInstallationOctokit(installationId);
    
    await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: 'completed',
      conclusion: 'failure',
      output: {
        title: '❌ Analysis Failed',
        summary: 'An error occurred during analysis.',
        text: `Error details: \`${error}\``
      }
    });
  }
}

import { githubAppAuth } from './app-auth';
import { formatCheckRunSummary } from './comment-formatter';

export interface TopFinding {
  ruleId: string;
  title: string;
  severity: string;
  filePath: string;
}

class CheckRunManager {
  async create(params: {
    installationId: number;
    owner: string;
    repo: string;
    headSha: string;
    name?: string;
  }): Promise<number> {
    const octokit = await githubAppAuth.getInstallationOctokit(params.installationId);
    
    const { data } = await octokit.rest.checks.create({
      owner: params.owner,
      repo: params.repo,
      name: params.name ?? 'CI/CD Reliability Analysis',
      head_sha: params.headSha,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    });
    
    return data.id;
  }

  async complete(params: {
    installationId: number;
    owner: string;
    repo: string;
    checkRunId: number;
    grade: string;
    score: number;
    criticalCount: number;
    highCount: number;
    topFindings: TopFinding[];
    blockOnGrade: string | null;
    dashboardUrl: string;
    scanId: string;
    repoId: string;
  }): Promise<void> {
    const octokit = await githubAppAuth.getInstallationOctokit(params.installationId);

    const gradeValue: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
    const scanGrade = params.grade.toUpperCase();
    const limitGrade = params.blockOnGrade ? params.blockOnGrade.toUpperCase() : null;

    const shouldBlock = limitGrade !== null &&
      (gradeValue[scanGrade] ?? 0) <= (gradeValue[limitGrade] ?? 0);

    const conclusion = shouldBlock
      ? 'failure'
      : (scanGrade === 'A' || scanGrade === 'B' ? 'success' : 'neutral');

    const totalFindings = params.criticalCount + params.highCount; // or total findings count
    const title = shouldBlock
      ? `⛔ Pipeline blocked — Grade ${params.grade}, Score ${params.score}/100`
      : (scanGrade === 'A' || scanGrade === 'B')
        ? `✅ Grade ${params.grade} — ${totalFindings} major findings`
        : `⚠️ Grade ${params.grade} — review recommended`;

    const { summary, text } = formatCheckRunSummary({
      grade: params.grade,
      score: params.score,
      criticalCount: params.criticalCount,
      highCount: params.highCount,
      topFindings: params.topFindings,
      dashboardUrl: params.dashboardUrl,
      scanId: params.scanId,
      repoId: params.repoId
    });

    await octokit.rest.checks.update({
      owner: params.owner,
      repo: params.repo,
      check_run_id: params.checkRunId,
      status: 'completed',
      completed_at: new Date().toISOString(),
      conclusion,
      output: {
        title,
        summary,
        text
      }
    });
  }

  async fail(params: {
    installationId: number;
    owner: string;
    repo: string;
    checkRunId: number;
    error: string;
  }): Promise<void> {
    const octokit = await githubAppAuth.getInstallationOctokit(params.installationId);
    
    await octokit.rest.checks.update({
      owner: params.owner,
      repo: params.repo,
      check_run_id: params.checkRunId,
      status: 'completed',
      completed_at: new Date().toISOString(),
      conclusion: 'cancelled',
      output: {
        title: 'CI/CD Reliability Analysis — scan failed',
        summary: params.error,
        text: `The automated scan encountered an unexpected error:\n\n\`\`\`\n${params.error}\n\`\`\``
      }
    });
  }
}

export const checkRunManager = new CheckRunManager();
export default checkRunManager;

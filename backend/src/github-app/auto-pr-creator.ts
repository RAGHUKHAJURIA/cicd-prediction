import { githubAppAuth } from './app-auth';
import { containsPlaceholder } from '../ai/file-output-guard';
import { patchCommitter } from './patch-committer';
import { formatPRBody, formatNoFixesPRBody } from './comment-formatter';

export interface FileRemediationResult {
  filePath: string;
  originalContent: string;
  fixedContent: string;
  hasAutoFixes: boolean;
  validationPassed: boolean;
  appliedPatchRuleIds: string[];
}

export interface ManualFixInstruction {
  ruleId: string;
  filePath: string;
  guidance: string;
  referenceUrl?: string;
  currentCode?: string;
}

class AutoPRCreator {
  async createFixPR(params: {
    installationId: number;
    owner: string;
    repo: string;
    baseBranch: string;
    scanId: string;
    repoId: string;
    fileRemediations: FileRemediationResult[];
    manualFixes: ManualFixInstruction[];
  }): Promise<{
    prUrl: string;
    prNumber: number;
    headBranch: string;
    filesChanged: number;
    skippedFiles: string[];
  } | null> {
    const octokit = await githubAppAuth.getInstallationOctokit(params.installationId);

    // STEP 1 — Filter to files with safe auto-fixes:
    const safeFiles = params.fileRemediations.filter(f =>
      f.hasAutoFixes &&
      f.validationPassed &&
      f.fixedContent !== f.originalContent
    );

    if (safeFiles.length === 0 && params.manualFixes.length === 0) {
      return null; // nothing to do
    }

    // STEP 2 — Create patch branch:
    let branchName = `cicd-reliability/fixes-${params.scanId.slice(0, 8)}`;
    
    // Get baseBranch HEAD SHA:
    const { data: baseRef } = await octokit.rest.git.getRef({
      owner: params.owner,
      repo: params.repo,
      ref: `heads/${params.baseBranch}`
    });

    // Create branch:
    try {
      await octokit.rest.git.createRef({
        owner: params.owner,
        repo: params.repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha
      });
    } catch (err: any) {
      if (err.status === 422) {
        // Branch already exists, add timestamp suffix
        branchName = `cicd-reliability/fixes-${params.scanId.slice(0, 8)}-${Date.now()}`;
        // retry createRef with new name
        await octokit.rest.git.createRef({
          owner: params.owner,
          repo: params.repo,
          ref: `refs/heads/${branchName}`,
          sha: baseRef.object.sha
        });
      } else {
        throw err;
      }
    }

    // STEP 3 — Commit each safe fixed file:
    const skippedFiles: string[] = [];
    const committedFiles: string[] = [];

    for (const fileResult of safeFiles) {
      // MANDATORY: final placeholder check before any commit
      if (containsPlaceholder(fileResult.fixedContent)) {
        console.error(
          `[auto-pr-creator] CRITICAL: placeholder found in ` +
          `fixedContent for ${fileResult.filePath} — skipping. ` +
          `This should have been caught by an earlier guard.`
        );
        skippedFiles.push(fileResult.filePath);
        continue;
      }

      // Get current file SHA for update:
      let currentFileSha: string | undefined;
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner: params.owner,
          repo: params.repo,
          path: fileResult.filePath,
          ref: branchName
        });
        currentFileSha = (data as { sha: string }).sha;
      } catch (err) {
        // File might be new or not found
      }

      // Commit the file:
      try {
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: params.owner,
          repo: params.repo,
          path: fileResult.filePath,
          message: `fix(${fileResult.filePath}): apply CI/CD reliability fixes [${fileResult.appliedPatchRuleIds.join(', ')}]`,
          content: Buffer.from(fileResult.fixedContent).toString('base64'),
          branch: branchName,
          ...(currentFileSha ? { sha: currentFileSha } : {}),
          committer: {
            name: 'CI/CD Reliability Bot',
            email: 'bot@cicd-reliability.io'
          }
        });
        committedFiles.push(fileResult.filePath);
      } catch (err: any) {
        console.error(
          `[auto-pr-creator] Failed to commit ${fileResult.filePath}:`,
          err.message
        );
        skippedFiles.push(fileResult.filePath);
      }
    }

    // STEP 4 — Commit patch documentation:
    const appliedFixes = safeFiles
      .filter(f => committedFiles.includes(f.filePath))
      .map(f => ({
        ruleId: f.appliedPatchRuleIds.join(', '),
        filePath: f.filePath
      }));

    try {
      await patchCommitter.commitPatchDoc({
        installationId: params.installationId,
        owner: params.owner,
        repo: params.repo,
        branch: branchName,
        scanId: params.scanId,
        manualFixes: params.manualFixes,
        appliedFixes
      });
    } catch (err: any) {
      console.error('[auto-pr-creator] Failed to commit patch documentation:', err.message);
    }

    // STEP 5 — Open the PR:
    const prBody = committedFiles.length > 0
      ? formatPRBody({
          scanId: params.scanId,
          grade: 'B', // default placeholder/fallback grade or get from scan report
          score: 80, // placeholder or get from scan
          appliedFixes,
          manualFixes: params.manualFixes,
          patchBranch: branchName,
          baseBranch: params.baseBranch,
          dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3001',
          repoId: params.repoId
        })
      : formatNoFixesPRBody({
          scanId: params.scanId,
          grade: 'C',
          findings: params.manualFixes.map(f => ({ ruleId: f.ruleId, title: f.guidance, severity: 'medium' })),
          dashboardUrl: process.env.DASHBOARD_URL ?? 'http://localhost:3001',
          repoId: params.repoId
        });

    const title = committedFiles.length > 0
      ? `fix: CI/CD reliability improvements (${committedFiles.length} file${committedFiles.length > 1 ? 's' : ''} fixed)`
      : `docs: CI/CD reliability findings — manual review needed`;

    const { data: pr } = await octokit.rest.pulls.create({
      owner: params.owner,
      repo: params.repo,
      title,
      body: prBody,
      head: branchName,
      base: params.baseBranch,
      maintainer_can_modify: true
    });

    // Try to add labels (ignore if labels don't exist):
    try {
      await octokit.rest.issues.addLabels({
        owner: params.owner,
        repo: params.repo,
        issue_number: pr.number,
        labels: ['ci/cd', 'reliability', 'automated']
      });
    } catch (err: any) {
      // Ignore
    }

    // STEP 6 — Return:
    return {
      prUrl: pr.html_url,
      prNumber: pr.number,
      headBranch: branchName,
      filesChanged: committedFiles.length,
      skippedFiles
    };
  }
}

export const autoPRCreator = new AutoPRCreator();
export default autoPRCreator;

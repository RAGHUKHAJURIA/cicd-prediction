import { githubAppAuth } from './app-auth';

class PRCommenter {
  async postOrUpdate(params: {
    installationId: number;
    owner: string;
    repo: string;
    prNumber: number;
    repoId: string;
    commentBody: string;
  }): Promise<number> {
    const octokit = await githubAppAuth.getInstallationOctokit(params.installationId);

    // List all PR comments (up to 100)
    const { data: comments } = await octokit.rest.issues.listComments({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.prNumber,
      per_page: 100
    });

    const marker = `<!-- cicd-reliability-scan-${params.repoId} -->`;
    const existing = comments.find(c => c.body?.includes(marker));

    if (existing) {
      await octokit.rest.issues.updateComment({
        owner: params.owner,
        repo: params.repo,
        comment_id: existing.id,
        body: params.commentBody
      });
      return existing.id;
    } else {
      const { data } = await octokit.rest.issues.createComment({
        owner: params.owner,
        repo: params.repo,
        issue_number: params.prNumber,
        body: params.commentBody
      });
      return data.id;
    }
  }

  async deleteOurComments(params: {
    installationId: number;
    owner: string;
    repo: string;
    prNumber: number;
    repoId: string;
  }): Promise<void> {
    const octokit = await githubAppAuth.getInstallationOctokit(params.installationId);

    const { data: comments } = await octokit.rest.issues.listComments({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.prNumber,
      per_page: 100
    });

    const marker = `<!-- cicd-reliability-scan-${params.repoId} -->`;
    const ourComments = comments.filter(c => c.body?.includes(marker));

    for (const comment of ourComments) {
      try {
        await octokit.rest.issues.deleteComment({
          owner: params.owner,
          repo: params.repo,
          comment_id: comment.id
        });
      } catch (err: any) {
        console.error(`[PRCommenter] Failed to delete comment ${comment.id}:`, err.message);
      }
    }
  }
}

export const prCommenter = new PRCommenter();
export default prCommenter;

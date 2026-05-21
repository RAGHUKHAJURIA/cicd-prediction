import { GitHubAppAuth } from './app-config';

export class PRCommenter {
  constructor(private auth: GitHubAppAuth) {}

  async postOrUpdateComment(
    owner: string,
    repo: string,
    prNumber: number,
    installationId: number,
    commentBody: string
  ): Promise<void> {
    const octokit = await this.auth.getInstallationOctokit(installationId);

    // List existing comments
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    // Find the one we created previously
    const existingComment = comments.find(comment => 
      comment.body?.includes('<!-- cicd-reliability-report -->')
    );

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });
    }
  }

  async deleteComment(
    owner: string,
    repo: string,
    commentId: number,
    installationId: number
  ): Promise<void> {
    const octokit = await this.auth.getInstallationOctokit(installationId);
    await octokit.rest.issues.deleteComment({
      owner,
      repo,
      comment_id: commentId,
    });
  }
}

import { Octokit } from "@octokit/rest";
import { db } from "../db/client";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { decryptToken } from "../lib/tokenCrypto";
import { AppError } from "../middleware/error-handler";
import { logger } from "../utils/logger";
import { guardFileContent, containsPlaceholder, findPlaceholderMatches } from "../ai/file-output-guard";
import { patchApplier } from "../ai/patch-applier";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
  language: string | null;
  stargazers_count: number;
  html_url: string;
  clone_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commit: { sha: string };
}

export interface PatchInput {
  ruleId: string;
  filePath: string;
  before: string;
  after: string;
  language: string;
  instructions: string;
}

export interface PushPatchResult {
  commitUrl: string;
  commitSha: string;
  patchFilePath: string;
}

export interface CreatePRResult {
  prUrl: string;
  prNumber: number;
  prTitle: string;
  headBranch: string;
}

export interface ValidateRepoResult {
  accessible: boolean;
  owner: string;
  repo: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class GitHubUserService {
  /**
   * Get an authenticated Octokit instance for a user.
   */
  private async getOctokit(userId: string): Promise<Octokit> {
    const [user] = await db
      .select({ githubAccessToken: users.githubAccessToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(404, "User not found", "NOT_FOUND");
    }

    if (!user.githubAccessToken) {
      throw new AppError(
        403,
        "No GitHub account connected. Please sign in with GitHub.",
        "NO_GITHUB_TOKEN"
      );
    }

    let token: string;
    try {
      token = decryptToken(user.githubAccessToken);
    } catch {
      throw new AppError(
        403,
        "GitHub token could not be decrypted. Please sign in with GitHub again.",
        "TOKEN_DECRYPT_FAILED"
      );
    }

    return new Octokit({ auth: token });
  }

  /**
   * Wraps GitHub API errors into AppError with specific codes.
   */
  private handleGitHubError(err: unknown, context: string): never {
    if (err instanceof AppError) throw err;

    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status: number }).status
        : 0;
    const message =
      err instanceof Error ? err.message : "Unknown GitHub API error";

    // Check rate limit
    if (
      status === 403 &&
      message.toLowerCase().includes("rate limit")
    ) {
      throw new AppError(
        429,
        "GitHub rate limit reached. Try again in 1 hour.",
        "GITHUB_RATE_LIMITED"
      );
    }

    switch (status) {
      case 401:
        throw new AppError(
          401,
          "GitHub token expired. Please sign in with GitHub again.",
          "GITHUB_TOKEN_EXPIRED"
        );
      case 403:
        throw new AppError(
          403,
          "GitHub access denied.",
          "GITHUB_FORBIDDEN"
        );
      case 404:
        throw new AppError(
          404,
          "Repository not found or you do not have access.",
          "REPO_NOT_FOUND"
        );
      case 422: {
        let ghMessage = message;
        if (
          err &&
          typeof err === "object" &&
          "response" in err
        ) {
          const response = (err as { response?: { data?: { message?: string } } }).response;
          if (response?.data?.message) {
            ghMessage = response.data.message;
          }
        }
        throw new AppError(
          422,
          ghMessage,
          "GITHUB_UNPROCESSABLE"
        );
      }
      default:
        logger.error(
          { event: "github_api_error", context, status, message },
          `GitHub API error in ${context}`
        );
        throw new AppError(
          502,
          `GitHub API error: ${message}`,
          "GITHUB_API_ERROR"
        );
    }
  }

  // ── Repo listing ──────────────────────────────────────────────────────────

  async listUserRepos(
    userId: string,
    options?: {
      page?: number;
      perPage?: number;
      sort?: "updated" | "created" | "pushed" | "full_name";
      type?: "all" | "owner" | "public" | "private" | "member";
      search?: string;
    }
  ): Promise<{
    repos: GitHubRepo[];
    totalCount: number;
    hasMore: boolean;
    currentPage: number;
  }> {
    const octokit = await this.getOctokit(userId);
    const page = options?.page ?? 1;
    const perPage = options?.perPage ?? 30;

    try {
      const response = await octokit.rest.repos.listForAuthenticatedUser({
        sort: options?.sort ?? "updated",
        per_page: perPage,
        page,
        type: (options?.type ?? "all") as "all" | "owner" | "public" | "private" | "member",
      });

      let repos = response.data.map((r) => this.mapRepo(r));

      // Client-side search filter
      const search = options?.search?.toLowerCase();
      if (search) {
        repos = repos.filter(
          (r) =>
            r.full_name.toLowerCase().includes(search) ||
            (r.description ?? "").toLowerCase().includes(search)
        );
      }

      // Check pagination from Link header
      const linkHeader = response.headers.link ?? "";
      const hasMore = linkHeader.includes('rel="next"');

      return {
        repos,
        totalCount: repos.length,
        hasMore,
        currentPage: page,
      };
    } catch (err) {
      this.handleGitHubError(err, "listUserRepos");
    }
  }

  // ── Single repo ───────────────────────────────────────────────────────────

  async getRepo(
    userId: string,
    owner: string,
    repo: string
  ): Promise<GitHubRepo> {
    const octokit = await this.getOctokit(userId);
    try {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return this.mapRepo(data);
    } catch (err) {
      this.handleGitHubError(err, "getRepo");
    }
  }

  // ── Branches ──────────────────────────────────────────────────────────────

  async getBranches(
    userId: string,
    owner: string,
    repo: string
  ): Promise<GitHubBranch[]> {
    const octokit = await this.getOctokit(userId);
    try {
      const { data } = await octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });
      return data.map((b) => ({
        name: b.name,
        protected: b.protected,
        commit: { sha: b.commit.sha },
      }));
    } catch (err) {
      this.handleGitHubError(err, "getBranches");
    }
  }

  // ── Push patch file ───────────────────────────────────────────────────────

  async pushPatchFile(
    userId: string,
    owner: string,
    repo: string,
    branch: string,
    scanId: string,
    patches: PatchInput[]
  ): Promise<PushPatchResult> {
    const octokit = await this.getOctokit(userId);
    const patchPath = ".github/cicd-reliability/patches.md";
    if (!patchPath.endsWith('.md')) {
      throw new Error(
        'pushPatchFile must only write to .md documentation files. ' +
        `Got: ${patchPath}`
      );
    }
    const content = this.buildPatchMarkdown(scanId, patches);

    try {
      // Check if file already exists to get its SHA
      let existingFileSha: string | undefined;
      try {
        const existing = await octokit.rest.repos.getContent({
          owner,
          repo,
          path: patchPath,
          ref: branch,
        });
        if (!Array.isArray(existing.data) && "sha" in existing.data) {
          existingFileSha = existing.data.sha;
        }
      } catch {
        existingFileSha = undefined; // file doesn't exist yet
      }

      const result = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: patchPath,
        message: `ci: add reliability patches from scan ${scanId.slice(0, 8)}`,
        content: Buffer.from(content).toString("base64"),
        branch,
        ...(existingFileSha ? { sha: existingFileSha } : {}),
        committer: {
          name: "CI/CD Reliability Bot",
          email: "bot@cicd-reliability.io",
        },
      });

      return {
        commitUrl: result.data.commit.html_url ?? "",
        commitSha: result.data.commit.sha ?? "",
        patchFilePath: patchPath,
      };
    } catch (err) {
      // 422 file conflict — retry with fresh SHA
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 422
      ) {
        try {
          const fresh = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: patchPath,
            ref: branch,
          });
          const freshSha =
            !Array.isArray(fresh.data) && "sha" in fresh.data
              ? fresh.data.sha
              : undefined;

          const result = await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: patchPath,
            message: `ci: add reliability patches from scan ${scanId.slice(0, 8)}`,
            content: Buffer.from(content).toString("base64"),
            branch,
            ...(freshSha ? { sha: freshSha } : {}),
            committer: {
              name: "CI/CD Reliability Bot",
              email: "bot@cicd-reliability.io",
            },
          });

          return {
            commitUrl: result.data.commit.html_url ?? "",
            commitSha: result.data.commit.sha ?? "",
            patchFilePath: patchPath,
          };
        } catch (retryErr) {
          this.handleGitHubError(retryErr, "pushPatchFile-retry");
        }
      }
      this.handleGitHubError(err, "pushPatchFile");
    }
  }

  // ── Create pull request ───────────────────────────────────────────────────

  async createPullRequest(
    userId: string,
    owner: string,
    repo: string,
    baseBranch: string,
    scanId: string,
    patches: PatchInput[]
  ): Promise<CreatePRResult> {
    const octokit = await this.getOctokit(userId);
    let patchBranch = `cicd-reliability/fixes-${scanId.slice(0, 8)}`;

    try {
      // Get authenticated user login
      const authenticatedUser = await octokit.rest.users.getAuthenticated();
      const userLogin = authenticatedUser.data.login;

      // Check if user has write access to the repository
      let hasWriteAccess = false;
      try {
        const { data: permissionData } = await octokit.rest.repos.getCollaboratorPermissionLevel({
          owner,
          repo,
          username: userLogin,
        });
        hasWriteAccess = ["admin", "write"].includes(permissionData.permission);
      } catch (e) {
        hasWriteAccess = false;
      }

      let targetOwner = owner;
      let targetRepo = repo;
      let headBranchParam = patchBranch;

      if (!hasWriteAccess) {
        logger.info(
          { event: "creating_fork", owner, repo, userLogin },
          "Forking repository for contributor PR"
        );
        const { data: fork } = await octokit.rest.repos.createFork({ owner, repo });
        targetOwner = fork.owner.login;
        targetRepo = fork.name;
        headBranchParam = `${targetOwner}:${patchBranch}`;

        // Wait for fork to be created and fully accessible on GitHub
        let forkAccessible = false;
        for (let attempt = 1; attempt <= 10; attempt++) {
          try {
            await octokit.rest.repos.get({ owner: targetOwner, repo: targetRepo });
            forkAccessible = true;
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        if (!forkAccessible) {
          throw new AppError(
            504,
            "Timeout waiting for repository fork to be created on GitHub.",
            "GITHUB_FORK_TIMEOUT"
          );
        }
      }

      // STEP 1 — Get the base branch SHA
      const { data: baseRef } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`,
      });
      const baseSha = baseRef.object.sha;

      // STEP 2 — Create new branch (on target repo, which is the fork if not hasWriteAccess)
      try {
        await octokit.rest.git.createRef({
          owner: targetOwner,
          repo: targetRepo,
          ref: `refs/heads/${patchBranch}`,
          sha: baseSha,
        });
      } catch (branchErr) {
        // If branch already exists (422), append timestamp
        if (
          branchErr &&
          typeof branchErr === "object" &&
          "status" in branchErr &&
          (branchErr as { status: number }).status === 422
        ) {
          patchBranch = `cicd-reliability/fixes-${scanId.slice(0, 8)}-${Date.now()}`;
          headBranchParam = !hasWriteAccess ? `${targetOwner}:${patchBranch}` : patchBranch;
          await octokit.rest.git.createRef({
            owner: targetOwner,
            repo: targetRepo,
            ref: `refs/heads/${patchBranch}`,
            sha: baseSha,
          });
        } else {
          throw branchErr;
        }
      }

      // Fetch and apply patches to actual workflow/Dockerfile/etc. files
      // Group patches by filePath
      const patchesByFile = new Map<string, PatchInput[]>();
      for (const p of patches) {
        if (!p.filePath.endsWith('.md')) {
          if (!patchesByFile.has(p.filePath)) {
            patchesByFile.set(p.filePath, []);
          }
          patchesByFile.get(p.filePath)!.push(p);
        }
      }

      const fileChanges: { path: string; newContent: string; originalContent: string; sha?: string }[] = [];

      for (const [filePath, filePatches] of patchesByFile.entries()) {
        try {
          // Fetch original content from GitHub
          const existing = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: baseBranch,
          });

          if (!Array.isArray(existing.data) && "content" in existing.data && existing.data.content) {
            const originalContent = Buffer.from(existing.data.content, "base64").toString("utf8");
            
            // Map PatchInput to PatchResult for patchApplier
            const patchResults = filePatches.map(p => ({
              ruleId: p.ruleId,
              filePath: p.filePath,
              before: p.before,
              after: p.after,
              explanation: p.instructions || '',
              confidence: 'certain' as const, // Treat as certain to apply
              patchType: 'replace_value' as any,
              isFullFile: false
            }));

            // Apply patches
            const applied = patchApplier.applyPatches(originalContent, patchResults);
            
            fileChanges.push({
              path: filePath,
              newContent: applied.content,
              originalContent: originalContent,
              sha: existing.data.sha
            });
          }
        } catch (err) {
          logger.warn({ err, filePath }, "Failed to fetch original file content for patching");
        }
      }

      // Filter fileChanges with guardFileContent
      const safeFileChanges: typeof fileChanges = [];
      for (const fc of fileChanges) {
        const guarded = guardFileContent(
          fc.newContent,
          fc.originalContent,
          { filePath: fc.path, source: 'create-pr' }
        );

        if (!guarded.safe) {
          console.warn(
            `[create-pr] Skipping file ${fc.path}: ${guarded.rejectedReason}`
          );
          continue;
        }

        safeFileChanges.push({
          ...fc,
          newContent: guarded.content
        });
      }

      // Add final assertion checks
      for (const fc of safeFileChanges) {
        if (containsPlaceholder(fc.newContent)) {
          throw new Error(
            `REFUSING TO COMMIT: ${fc.path} contains placeholder tokens: ` +
            findPlaceholderMatches(fc.newContent).join(', ')
          );
        }
      }

      // Commit the safe files to the new branch
      for (const fc of safeFileChanges) {
        // We commit to targetOwner/targetRepo (which could be the fork)
        // Get the latest SHA of the file on the patch branch if it exists, or use the base branch SHA
        let currentSha = fc.sha;
        try {
          const branchFile = await octokit.rest.repos.getContent({
            owner: targetOwner,
            repo: targetRepo,
            path: fc.path,
            ref: patchBranch,
          });
          if (!Array.isArray(branchFile.data) && "sha" in branchFile.data) {
            currentSha = branchFile.data.sha;
          }
        } catch {}

        await octokit.rest.repos.createOrUpdateFileContents({
          owner: targetOwner,
          repo: targetRepo,
          path: fc.path,
          message: `fix: apply reliability patches to ${fc.path}`,
          content: Buffer.from(fc.newContent).toString("base64"),
          branch: patchBranch,
          ...(currentSha ? { sha: currentSha } : {}),
          committer: {
            name: "CI/CD Reliability Bot",
            email: "bot@cicd-reliability.io",
          },
        });
      }

      // Commit patches.md as well
      await this.pushPatchFile(
        userId,
        targetOwner,
        targetRepo,
        patchBranch,
        scanId,
        patches
      );

      // Build PR body and title
      const allFixesRejected = fileChanges.length > 0 && safeFileChanges.length === 0;
      let prBody = this.buildPRBody(scanId, patches);
      if (allFixesRejected) {
        prBody = `## CI/CD Reliability Fixes (Manual Review Required)\n\n` +
          `**No automatic fixes could be safely applied.** All findings require manual review.\n\n` +
          `Please see the detailed instructions below or refer to the patches.md file.\n\n` +
          prBody;
      }
      
      const prTitle = allFixesRejected
        ? `fix: CI/CD reliability improvements (manual review required)`
        : `fix: CI/CD reliability improvements (${patches.length} fixes)`;

      let pr: { html_url: string; number: number; title: string };
      try {
        const { data } = await octokit.rest.pulls.create({
          owner,
          repo,
          title: prTitle,
          body: prBody,
          head: headBranchParam,
          base: baseBranch,
          maintainer_can_modify: true,
        });
        pr = data;
      } catch (prErr) {
        // If PR already exists for this branch, try to find it
        if (
          prErr &&
          typeof prErr === "object" &&
          "status" in prErr &&
          (prErr as { status: number }).status === 422
        ) {
          const { data: existingPRs } = await octokit.rest.pulls.list({
            owner,
            repo,
            head: headBranchParam,
            state: "open",
          });
          if (existingPRs.length > 0) {
            const existingPR = existingPRs[0]!;
            return {
              prUrl: existingPR.html_url,
              prNumber: existingPR.number,
              prTitle: existingPR.title,
              headBranch: patchBranch,
            };
          }
        }
        throw prErr;
      }

      // STEP 5 — Add labels (ignore errors — labels may not exist)
      try {
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: pr.number,
          labels: ["ci/cd", "reliability", "automated"],
        });
      } catch {
        // labels may not exist — ignore
      }

      return {
        prUrl: pr.html_url,
        prNumber: pr.number,
        prTitle: pr.title,
        headBranch: patchBranch,
      };
    } catch (err) {
      this.handleGitHubError(err, "createPullRequest");
    }
  }

  // ── Validate repo access ──────────────────────────────────────────────────

  async validateRepoAccess(
    userId: string,
    repoUrl: string
  ): Promise<ValidateRepoResult> {
    const { owner, repo } = this.parseGitHubUrl(repoUrl);

    try {
      const repoData = await this.getRepo(userId, owner, repo);
      return {
        accessible: true,
        owner,
        repo,
        private: repoData.private,
        defaultBranch: repoData.default_branch,
        description: repoData.description,
      };
    } catch {
      return {
        accessible: false,
        owner,
        repo,
        private: false,
        defaultBranch: "main",
        description: null,
      };
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private parseGitHubUrl(url: string): { owner: string; repo: string } {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname
        .replace(/^\//, "")
        .replace(/\.git$/, "")
        .split("/");
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw new Error("Invalid URL");
      }
      return { owner: parts[0], repo: parts[1] };
    } catch {
      throw new AppError(
        422,
        "Invalid GitHub URL format",
        "INVALID_GITHUB_URL"
      );
    }
  }

  private mapRepo(data: Record<string, unknown>): GitHubRepo {
    const d = data as {
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      description: string | null;
      default_branch: string;
      updated_at: string;
      language: string | null;
      stargazers_count: number;
      html_url: string;
      clone_url: string;
      owner: { login: string; avatar_url: string };
    };
    return {
      id: d.id,
      name: d.name,
      full_name: d.full_name,
      private: d.private,
      description: d.description,
      default_branch: d.default_branch,
      updated_at: d.updated_at,
      language: d.language,
      stargazers_count: d.stargazers_count,
      html_url: d.html_url,
      clone_url: d.clone_url,
      owner: {
        login: d.owner.login,
        avatar_url: d.owner.avatar_url,
      },
    };
  }

  private buildPatchMarkdown(scanId: string, patches: PatchInput[]): string {
    const uniqueFiles = new Set(patches.map((p) => p.filePath)).size;
    const date = new Date().toISOString();

    let md = `# CI/CD Reliability Patches\n\n`;
    md += `> Generated by CI/CD Reliability Intelligence Platform\n`;
    md += `> Scan ID: \`${scanId}\`\n`;
    md += `> Generated: ${date}\n\n`;
    md += `## Summary\n\n`;
    md += `**${patches.length}** fixes identified across **${uniqueFiles}** files.\n\n`;
    md += `---\n\n`;

    patches.forEach((patch, i) => {
      md += `## Fix ${i + 1}: ${patch.ruleId}\n\n`;
      md += `**File:** \`${patch.filePath}\`\n\n`;
      md += `### Before\n\n`;
      md += `\`\`\`${patch.language}\n${patch.before}\n\`\`\`\n\n`;
      md += `### After (Apply this fix)\n\n`;
      md += `\`\`\`${patch.language}\n${patch.after}\n\`\`\`\n\n`;
      if (patch.instructions) {
        md += `### How to apply\n\n`;
        md += `${patch.instructions}\n\n`;
      }
      md += `---\n\n`;
    });

    return md;
  }

  private buildPRBody(scanId: string, patches: PatchInput[]): string {
    const date = new Date().toISOString();

    let body = `## CI/CD Reliability Fixes\n\n`;
    body += `This PR was automatically generated by the **CI/CD Reliability Intelligence Platform**.\n\n`;
    body += `### What this fixes\n\n`;
    body += `| # | Rule | File |\n`;
    body += `|---|------|------|\n`;

    patches.forEach((patch, i) => {
      body += `| ${i + 1} | \`${patch.ruleId}\` | \`${patch.filePath}\` |\n`;
    });

    body += `\n### How to review\n\n`;
    body += `1. Review each change in the Files tab\n`;
    body += `2. The patch file at \`.github/cicd-reliability/patches.md\` explains each fix in detail\n`;
    body += `3. Merge when satisfied\n\n`;
    body += `### Scan details\n\n`;
    body += `- **Scan ID:** \`${scanId}\`\n`;
    body += `- **Generated:** ${date}\n\n`;
    body += `---\n`;
    body += `*Generated by [CI/CD Reliability Platform]*\n`;

    return body;
  }
}

export const githubUserService = new GitHubUserService();

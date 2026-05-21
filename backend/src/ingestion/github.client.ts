import { Octokit } from "@octokit/rest";
import * as dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// ============================================================================
// SECTION 1 — ENV VALIDATION
// ============================================================================

const envSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN must be set"),
  GITHUB_API_BASE_URL: z.string().url().default("https://api.github.com"),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error("Startup Error: Invalid GitHub Client environment variables.");
  for (const err of parsedEnv.error.errors) {
    console.error(`- ${err.path.join(".")}: ${err.message}`);
  }
  process.exit(1);
}

const env = parsedEnv.data;

// ============================================================================
// SECTION 2 — TYPES
// ============================================================================

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

export interface GitHubRepositoryMetadata {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  fork: boolean;
  language: string | null;
  cloneUrl: string;
  sshUrl: string;
  htmlUrl: string;
}

export interface GitHubContentFile {
  path: string;
  sha: string;
  size: number;
  downloadUrl: string | null;
  type: "file" | "dir";
  htmlUrl: string | null;
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubRateLimit {
  limit: number;
  remaining: number;
  reset: number;
}

// ============================================================================
// SECTION 5 — ERROR HANDLING
// ============================================================================

export class GitHubApiError extends Error {
  constructor(
    public override message: string,
    public statusCode?: number,
    public requestId?: string
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubRateLimitError extends GitHubApiError {
  constructor(message: string, requestId?: string) {
    super(message, 429, requestId);
    this.name = "GitHubRateLimitError";
  }
}

export class GitHubRepositoryNotFoundError extends GitHubApiError {
  constructor(message: string, requestId?: string) {
    super(message, 404, requestId);
    this.name = "GitHubRepositoryNotFoundError";
  }
}

export class GitHubAuthenticationError extends GitHubApiError {
  constructor(message: string, requestId?: string) {
    super(message, 401, requestId);
    this.name = "GitHubAuthenticationError";
  }
}

// ============================================================================
// SECTION 3 — URL PARSER
// ============================================================================

export function parseGitHubRepoUrl(repoUrl: string): GitHubRepoRef {
  let urlStr = repoUrl.trim();
  
  // Normalize git@github.com:owner/repo.git
  if (urlStr.startsWith("git@github.com:")) {
    urlStr = urlStr.replace("git@github.com:", "https://github.com/");
  }

  // Ensure valid URL parsing by prepending protocol if missing
  if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
    urlStr = "https://" + urlStr;
  }

  try {
    const url = new URL(urlStr);
    
    // Check hostname
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      throw new Error(`Hostname must be github.com, got ${url.hostname}`);
    }

    let pathname = url.pathname;
    
    // Normalize .git suffix
    if (pathname.endsWith(".git")) {
      pathname = pathname.slice(0, -4);
    }
    
    // Trim slashes
    pathname = pathname.replace(/^\/+|\/+$/g, "");
    
    const parts = pathname.split("/");
    if (parts.length < 2) {
      throw new Error(`Path does not contain owner/repo: ${pathname}`);
    }

    return {
      owner: parts[0]!,
      repo: parts[1]!,
    };
  } catch (err: any) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl} (${err.message})`);
  }
}

// ============================================================================
// SECTION 4, 6 & 7 — GITHUB CLIENT CLASS, RATE LIMIT SAFETY, LOGGING
// ============================================================================

export class GitHubClient {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: env.GITHUB_TOKEN,
      baseUrl: env.GITHUB_API_BASE_URL,
      userAgent: "cicd-reliability-platform",
    });
  }

  private log(message: string) {
    console.log(`[GitHubClient] ${message}`);
  }

  private mapGitHubError(err: any): never {
    const status = err.status || err.response?.status;
    const reqId = err.response?.headers?.["x-github-request-id"];
    const msg = err.message || "Unknown GitHub API Error";

    if (status === 401) {
      throw new GitHubAuthenticationError(msg, reqId);
    } else if (status === 403) {
      if (msg.toLowerCase().includes("rate limit")) {
        throw new GitHubRateLimitError(msg, reqId);
      }
      throw new GitHubApiError(`Forbidden: ${msg}`, 403, reqId);
    } else if (status === 404) {
      throw new GitHubRepositoryNotFoundError(`Repository not found or access denied: ${msg}`, reqId);
    } else if (status === 429) {
      throw new GitHubRateLimitError(msg, reqId);
    }

    throw new GitHubApiError(msg, status, reqId);
  }

  private async preflightRateLimitCheck() {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      const rate = response.data.resources.core;
      if (rate.remaining < 10) {
        throw new GitHubRateLimitError(
          `Rate limit exhausted. Remaining: ${rate.remaining}, Reset: ${rate.reset}`
        );
      }
    } catch (err) {
      if (err instanceof GitHubRateLimitError) throw err;
      this.mapGitHubError(err);
    }
  }

  public async getRepositoryMetadata(ref: GitHubRepoRef): Promise<GitHubRepositoryMetadata> {
    this.log(`Fetching repo metadata for ${ref.owner}/${ref.repo}...`);
    await this.preflightRateLimitCheck();

    try {
      const response = await this.octokit.rest.repos.get({
        owner: ref.owner,
        repo: ref.repo,
      });

      const d = response.data;
      return {
        id: d.id,
        fullName: d.full_name,
        defaultBranch: d.default_branch,
        private: d.private,
        archived: d.archived,
        fork: d.fork,
        language: d.language || null,
        cloneUrl: d.clone_url,
        sshUrl: d.ssh_url,
        htmlUrl: d.html_url,
      };
    } catch (err) {
      this.mapGitHubError(err);
    }
  }

  public async getDefaultBranch(ref: GitHubRepoRef): Promise<string> {
    const meta = await this.getRepositoryMetadata(ref);
    return meta.defaultBranch;
  }

  public async getRepositoryTree(ref: GitHubRepoRef, recursive = true): Promise<GitHubTreeItem[]> {
    this.log(`Fetching recursive tree for ${ref.owner}/${ref.repo}...`);
    await this.preflightRateLimitCheck();

    try {
      const defaultBranch = await this.getDefaultBranch(ref);

      // Fetch branch to get tree SHA
      const branchResponse = await this.octokit.rest.repos.getBranch({
        owner: ref.owner,
        repo: ref.repo,
        branch: defaultBranch,
      });
      const treeSha = branchResponse.data.commit.commit.tree.sha;

      const treeParams: any = {
        owner: ref.owner,
        repo: ref.repo,
        tree_sha: treeSha,
      };
      if (recursive) {
        treeParams.recursive = "1";
      }
      
      const treeResponse = await this.octokit.rest.git.getTree(treeParams);

      const items = (treeResponse.data.tree as GitHubTreeItem[]) || [];
      this.log(`Tree contains ${items.length} items`);

      if (treeResponse.data.truncated) {
        this.log(`Warning: Tree truncated! Repo is too large for a single recursive API call.`);
        // Could fallback to paginated Contents API logic here if truly necessary
        // but GitHub's recursive tree API truncation is extremely rare unless tree is 100,000+ files
      }

      return items;
    } catch (err) {
      this.mapGitHubError(err);
    }
  }

  public async getFileContent(ref: GitHubRepoRef, path: string): Promise<string> {
    this.log(`Fetching file content: ${path}`);
    await this.preflightRateLimitCheck();

    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: ref.owner,
        repo: ref.repo,
        path,
      });

      const data = response.data as any;
      if (Array.isArray(data)) {
        throw new GitHubApiError(`Requested path is a directory, not a file: ${path}`);
      }

      if (data.type !== "file") {
        throw new GitHubApiError(`Requested path is not a file: ${path}`);
      }

      if (!data.content) {
        // Can happen for files > 1MB via contents API without raw media type
        throw new GitHubApiError(`File content too large or unavailable via Contents API: ${path}`);
      }

      return Buffer.from(data.content, "base64").toString("utf8");
    } catch (err) {
      this.mapGitHubError(err);
    }
  }

  public async getRateLimit(): Promise<GitHubRateLimit> {
    try {
      const response = await this.octokit.rest.rateLimit.get();
      const core = response.data.resources.core;
      this.log(`Rate limit remaining: ${core.remaining}`);
      return {
        limit: core.limit,
        remaining: core.remaining,
        reset: core.reset,
      };
    } catch (err) {
      this.mapGitHubError(err);
    }
  }

  public async validateRepositoryAccess(ref: GitHubRepoRef): Promise<boolean> {
    try {
      const meta = await this.getRepositoryMetadata(ref);
      if (meta.archived) {
        this.log(`Repository is archived: ${ref.owner}/${ref.repo}`);
        // Often we still want to scan archived repos, but if requirements dictate:
        // return false; 
        // We will return true to allow scanning archived config, unless user specifically blocks it
      }
      return true;
    } catch (err) {
      if (err instanceof GitHubRepositoryNotFoundError || err instanceof GitHubAuthenticationError) {
        return false;
      }
      throw err;
    }
  }
}

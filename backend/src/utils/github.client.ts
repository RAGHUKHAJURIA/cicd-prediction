import { AppError } from "../middleware/error-handler";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
}

export interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

interface GitHubRateLimit {
  resources: {
    core: { remaining: number; reset: number };
  };
}

interface GitHubContentResponse {
  content: string;
  encoding: string;
  sha: string;
  size: number;
  download_url: string | null;
}

interface GitHubBlobResponse {
  content: string;
  encoding: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class GitHubClient {
  private readonly baseUrl = "https://api.github.com";

  constructor(private readonly token?: string) {}

  private async request<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      headers,
    });

    if (res.status === 404) {
      throw new AppError(404, "Repository not found or not accessible", "REPO_NOT_FOUND");
    }
    if (res.status === 403) {
      throw new AppError(403, "Insufficient permissions to access repository", "FORBIDDEN");
    }
    if (res.status === 429) {
      throw new AppError(503, "GitHub API rate limit exceeded", "RATE_LIMITED");
    }
    if (!res.ok) {
      throw new AppError(502, `GitHub API error: ${res.status} ${res.statusText}`, "GITHUB_API_ERROR");
    }

    return res.json() as Promise<T>;
  }

  async getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
  }

  async getFileTree(
    owner: string,
    repo: string,
    branch: string
  ): Promise<GitHubTreeItem[]> {
    const data = await this.request<GitHubTreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    return data.tree;
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    branch: string,
    sha?: string
  ): Promise<string> {
    if (sha) {
      try {
        const blob = await this.request<GitHubBlobResponse>(
          `/repos/${owner}/${repo}/git/blobs/${sha}`
        );
        return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf-8");
      } catch (err) {
        console.warn(`Failed to fetch blob direct by sha ${sha} for ${path}, falling back to contents API:`, err);
      }
    }

    const data = await this.request<GitHubContentResponse>(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`
    );

    if (data.encoding === "base64") {
      return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
    }

    // File too large for contents API — use blob endpoint
    const blob = await this.request<GitHubBlobResponse>(
      `/repos/${owner}/${repo}/git/blobs/${data.sha}`
    );
    return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf-8");
  }

  async checkRateLimit(): Promise<{ remaining: number; reset: Date }> {
    const data = await this.request<GitHubRateLimit>("/rate_limit");
    return {
      remaining: data.resources.core.remaining,
      reset: new Date(data.resources.core.reset * 1000),
    };
  }
}

// ─── GitLab client (minimal) ──────────────────────────────────────────────────

export class GitLabClient {
  private readonly baseUrl = "https://gitlab.com/api/v4";

  constructor(private readonly token: string) {}

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "PRIVATE-TOKEN": this.token },
    });

    if (res.status === 404) {
      throw new AppError(404, "Repository not found or not accessible", "REPO_NOT_FOUND");
    }
    if (res.status === 403) {
      throw new AppError(403, "Insufficient permissions to access repository", "FORBIDDEN");
    }
    if (!res.ok) {
      throw new AppError(502, `GitLab API error: ${res.status}`, "GITLAB_API_ERROR");
    }

    return res.json() as Promise<T>;
  }

  async getRepo(encodedPath: string): Promise<{ id: number; name: string; default_branch: string }> {
    return this.request(`/projects/${encodedPath}`);
  }

  async getFileTree(encodedPath: string): Promise<Array<{ id: string; name: string; type: string; path: string }>> {
    return this.request(`/projects/${encodedPath}/repository/tree?recursive=true&per_page=100`);
  }

  async getFileContent(encodedPath: string, filePath: string, branch: string): Promise<string> {
    const encoded = encodeURIComponent(filePath);
    const res = await fetch(
      `${this.baseUrl}/projects/${encodedPath}/repository/files/${encoded}/raw?ref=${branch}`,
      { headers: { "PRIVATE-TOKEN": this.token } }
    );
    if (!res.ok) throw new AppError(502, "Failed to fetch file from GitLab", "GITLAB_API_ERROR");
    return res.text();
  }
}

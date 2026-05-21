import { simpleGit, SimpleGit } from "simple-git";
import * as path from "path";
import * as fs from "fs";
import { GitHubClient, GitHubTreeItem, parseGitHubRepoUrl } from "./github.client";

// ============================================================================
// SECTION 1 — TYPES
// ============================================================================

export enum CIFileType {
  GITHUB_ACTIONS = "GITHUB_ACTIONS",
  GITLAB_CI = "GITLAB_CI",
  JENKINSFILE = "JENKINSFILE",
  DOCKERFILE = "DOCKERFILE",
  KUBERNETES = "KUBERNETES",
  HELM = "HELM",
  TERRAFORM = "TERRAFORM",
  COMPOSE = "COMPOSE",
  UNKNOWN = "UNKNOWN",
}

export enum ParserType {
  GITHUB_ACTIONS = "github-actions.parser",
  GITLAB_CI = "gitlab-ci.parser",
  DOCKERFILE = "dockerfile.parser",
  JENKINSFILE = "jenkinsfile.parser",
  KUBERNETES = "k8s-manifest.parser",
  TERRAFORM = "terraform.parser",
  UNKNOWN = "unknown",
}

export interface DetectedCIFile {
  path: string;
  type: CIFileType;
  parser: ParserType;
  confidence: number;
  size?: number;
  sha: string;
}

export interface ScanSummary {
  totalFiles: number;
  ciFileCount: number;
  githubActionsCount: number;
  gitlabCount: number;
  dockerCount: number;
  kubernetesCount: number;
  jenkinsCount: number;
  terraformCount: number;
  composeCount: number;
}

export interface RepoScanResult {
  repo: string;
  metadata: any;
  scannedAt: Date;
  ciFiles: DetectedCIFile[];
  summary: ScanSummary;
}

// ============================================================================
// SECTION 2, 3, 4 — REPO SCANNER, FILE DETECTION RULES & FILTERING
// ============================================================================

const IGNORED_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  "target",
]);

const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".jar", ".class", ".exe", ".dll", ".so", ".dylib",
  ".mp4", ".mp3", ".pdf"
]);

export class RepositoryScanner {
  constructor(private client: GitHubClient) {}

  public async scanRepository(repoUrl: string): Promise<RepoScanResult> {
    const ref = parseGitHubRepoUrl(repoUrl);
    
    const isValid = await this.client.validateRepositoryAccess(ref);
    if (!isValid) {
      throw new Error(`Cannot access repository: ${ref.owner}/${ref.repo}`);
    }

    const metadata = await this.client.getRepositoryMetadata(ref);
    const tree = await this.client.getRepositoryTree(ref, true);

    const ciFiles: DetectedCIFile[] = [];
    let totalFiles = 0;

    for (const item of tree) {
      if (item.type !== "blob") continue;
      
      const parsedPath = path.parse(item.path);
      
      // Filtering - ignore large files (> 5MB)
      if (item.size && item.size > 5 * 1024 * 1024) continue;

      // Filtering - ignore specific extensions
      if (IGNORED_EXTENSIONS.has(parsedPath.ext.toLowerCase())) continue;

      // Filtering - ignore specific directories
      const dirs = parsedPath.dir.split(path.sep);
      if (dirs.some(d => IGNORED_DIRS.has(d))) continue;

      totalFiles++;

      const detected = this.detectCIFile(item);
      if (detected) {
        ciFiles.push(detected);
      }
    }

    const summary: ScanSummary = {
      totalFiles,
      ciFileCount: ciFiles.length,
      githubActionsCount: ciFiles.filter(f => f.type === CIFileType.GITHUB_ACTIONS).length,
      gitlabCount: ciFiles.filter(f => f.type === CIFileType.GITLAB_CI).length,
      dockerCount: ciFiles.filter(f => f.type === CIFileType.DOCKERFILE).length,
      kubernetesCount: ciFiles.filter(f => f.type === CIFileType.KUBERNETES).length,
      jenkinsCount: ciFiles.filter(f => f.type === CIFileType.JENKINSFILE).length,
      terraformCount: ciFiles.filter(f => f.type === CIFileType.TERRAFORM).length,
      composeCount: ciFiles.filter(f => f.type === CIFileType.COMPOSE).length,
    };

    return {
      repo: `${ref.owner}/${ref.repo}`,
      metadata,
      scannedAt: new Date(),
      ciFiles,
      summary
    };
  }

  public detectCIFile(file: GitHubTreeItem): DetectedCIFile | null {
    const type = this.detectFileType(file.path);
    if (type === CIFileType.UNKNOWN) return null;

    return {
      path: file.path,
      type,
      parser: this.inferParser(type),
      confidence: this.calculateConfidence(file.path, type),
      sha: file.sha,
      ...(file.size !== undefined ? { size: file.size } : {})
    };
  }

  public detectFileType(filePath: string): CIFileType {
    const p = filePath.toLowerCase();
    
    // GitHub Actions
    if (p.startsWith(".github/workflows/") && (p.endsWith(".yml") || p.endsWith(".yaml"))) {
      return CIFileType.GITHUB_ACTIONS;
    }
    
    // GitLab CI
    if (p.endsWith(".gitlab-ci.yml") || p.endsWith(".gitlab-ci.yaml")) {
      return CIFileType.GITLAB_CI;
    }
    
    // Docker
    if (p.endsWith("dockerfile") || p.includes("dockerfile.")) {
      return CIFileType.DOCKERFILE;
    }
    
    // Helm
    if (p.endsWith("chart.yaml") || p.endsWith("values.yaml") || (p.includes("templates/") && (p.endsWith(".yml") || p.endsWith(".yaml")))) {
      return CIFileType.HELM;
    }
    
    // Kubernetes
    if ((p.includes("k8s/") || p.includes("kubernetes/") || p.includes("manifests/")) && (p.endsWith(".yml") || p.endsWith(".yaml"))) {
      return CIFileType.KUBERNETES;
    }
    if (p.endsWith("deployment.yaml") || p.endsWith("deployment.yml") ||
        p.endsWith("service.yaml") || p.endsWith("service.yml") ||
        p.endsWith("ingress.yaml") || p.endsWith("ingress.yml")) {
      return CIFileType.KUBERNETES;
    }
    
    // Terraform
    if (p.endsWith(".tf") || p.endsWith(".tfvars")) {
      return CIFileType.TERRAFORM;
    }
    
    // Compose
    if (p.endsWith("docker-compose.yml") || p.endsWith("docker-compose.yaml") || p.endsWith("compose.yml") || p.endsWith("compose.yaml")) {
      return CIFileType.COMPOSE;
    }
    
    // Jenkins
    if (p.endsWith("jenkinsfile") || p.includes(".jenkinsfile")) {
      return CIFileType.JENKINSFILE;
    }

    // Heuristics
    if ((p.endsWith(".yml") || p.endsWith(".yaml")) && 
        (p.includes("deploy") || p.includes("pipeline") || p.includes("workflow") || p.includes("infra") || p.includes("chart") || p.includes("helm") || p.includes("container"))) {
      // Best guess for heuristic yamls that aren't mapped perfectly
      return CIFileType.UNKNOWN; // For safety, we keep it unknown unless we have a clear CI indicator. We can map later if contents match.
    }

    return CIFileType.UNKNOWN;
  }

  public inferParser(type: CIFileType): ParserType {
    switch (type) {
      case CIFileType.GITHUB_ACTIONS: return ParserType.GITHUB_ACTIONS;
      case CIFileType.GITLAB_CI: return ParserType.GITLAB_CI;
      case CIFileType.DOCKERFILE: return ParserType.DOCKERFILE;
      case CIFileType.JENKINSFILE: return ParserType.JENKINSFILE;
      case CIFileType.KUBERNETES: return ParserType.KUBERNETES;
      case CIFileType.TERRAFORM: return ParserType.TERRAFORM;
      default: return ParserType.UNKNOWN;
    }
  }

  public calculateConfidence(filePath: string, type: CIFileType): number {
    const p = filePath.toLowerCase();
    
    switch (type) {
      case CIFileType.GITHUB_ACTIONS:
        return p.startsWith(".github/workflows/") ? 100 : 80;
      case CIFileType.GITLAB_CI:
        return (p === ".gitlab-ci.yml" || p === ".gitlab-ci.yaml") ? 100 : 80;
      case CIFileType.JENKINSFILE:
        return p === "jenkinsfile" ? 100 : 80;
      case CIFileType.DOCKERFILE:
        return p === "dockerfile" ? 100 : 80;
      case CIFileType.KUBERNETES:
        if (p.endsWith("deployment.yaml") || p.endsWith("service.yaml") || p.endsWith("ingress.yaml")) return 100;
        if (p.includes("k8s/") || p.includes("kubernetes/")) return 80;
        return 60;
      case CIFileType.HELM:
        return p.endsWith("chart.yaml") ? 100 : (p.endsWith("values.yaml") ? 80 : 60);
      case CIFileType.TERRAFORM:
        return p.endsWith(".tf") ? 100 : 80;
      case CIFileType.COMPOSE:
        return (p === "docker-compose.yml" || p === "compose.yml") ? 100 : 80;
      default:
        return 20;
    }
  }
}

// ============================================================================
// SECTION 5 — CLONING SUPPORT
// ============================================================================

export async function cloneRepositoryIfNeeded(repoUrl: string, targetDir: string): Promise<string> {
  const ref = parseGitHubRepoUrl(repoUrl);
  
  // Prevent path traversal
  const safeRepoName = ref.repo.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeOwnerName = ref.owner.replace(/[^a-zA-Z0-9_-]/g, "");
  const clonePath = path.join(targetDir, safeOwnerName, safeRepoName);

  if (fs.existsSync(clonePath)) {
    // Reuse existing clone
    return clonePath;
  }

  // Ensure parent dir exists
  fs.mkdirSync(path.join(targetDir, safeOwnerName), { recursive: true });

  const git: SimpleGit = simpleGit();
  
  // Support token auth
  const token = process.env.GITHUB_TOKEN;
  let cloneUrl = `https://github.com/${ref.owner}/${ref.repo}.git`;
  if (token) {
    cloneUrl = `https://x-access-token:${token}@github.com/${ref.owner}/${ref.repo}.git`;
  }

  try {
    await git.clone(cloneUrl, clonePath, ["--depth=1"]);
    return clonePath;
  } catch (err: any) {
    throw new Error(`Failed to clone repository ${ref.owner}/${ref.repo}: ${err.message}`);
  }
}

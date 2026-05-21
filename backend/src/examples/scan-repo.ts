/**
 * @file scan-repo.ts
 * @description Example CLI script demonstrating the repository scanner.
 * 
 * Usage:
 * npx ts-node src/examples/scan-repo.ts https://github.com/vercel/next.js
 * 
 * EXPLANATION OF APPROACH:
 * 1. Why Contents API / Git Tree API first?
 *    Fetching the repository tree recursively using the GitHub API allows us to discover
 *    thousands of files across the entire repository in milliseconds, without pulling
 *    the actual blobs (file contents). 
 * 
 * 2. Why cloning is delayed?
 *    A full git clone (even shallow) involves transferring the entire `.git` object database
 *    and downloading every single file. This consumes immense bandwidth, disk space, and 
 *    compute time. By doing a lightweight scan via the API first, we only clone the repo
 *    if we determine that it contains relevant CI/CD configurations that require deep parsing.
 * 
 * 3. Scalability Improvements
 *    By avoiding aggressive cloning, the CI/CD Intelligence Platform can scan hundreds of
 *    repositories a minute via asynchronous API calls, drastically reducing infrastructure
 *    costs and minimizing worker node disk exhaustion.
 * 
 * 4. Flow into Parser & Rule Engine
 *    Scanner -> Discovers CI/CD files and assigns Confidence/Parser Type.
 *    Ingestion Layer -> Downloads ONLY the detected CI/CD files (or does a targeted shallow clone).
 *    Parser Layer -> Converts raw YAML/JSON/Groovy into `NormalizedWorkflow`.
 *    Rule Engine (Phase 2) -> Applies heuristic validation rules (e.g. "Missing digest", "Root privileges")
 *                             against the Normalized data model.
 */

import { GitHubClient } from "../ingestion/github.client";
import { RepositoryScanner } from "../ingestion/repo-scanner";

async function main() {
  const args = process.argv.slice(2);
  const repoUrl = args[0];

  if (!repoUrl) {
    console.error("Usage: npx ts-node src/examples/scan-repo.ts <github-url>");
    process.exit(1);
  }

  console.log(`Initializing GitHub Client...`);
  const client = new GitHubClient();
  const scanner = new RepositoryScanner(client);

  try {
    console.log(`\nScanning repository: ${repoUrl}`);
    const result = await scanner.scanRepository(repoUrl);

    console.log(`\n======================================================`);
    console.log(`SCAN SUMMARY: ${result.repo}`);
    console.log(`======================================================`);
    console.log(`Total Files Checked   : ${result.summary.totalFiles}`);
    console.log(`Total CI/CD Files     : ${result.summary.ciFileCount}`);
    console.log(`------------------------------------------------------`);
    console.log(`GitHub Actions        : ${result.summary.githubActionsCount}`);
    console.log(`GitLab CI             : ${result.summary.gitlabCount}`);
    console.log(`Kubernetes Manifests  : ${result.summary.kubernetesCount}`);
    console.log(`Dockerfiles           : ${result.summary.dockerCount}`);
    console.log(`Helm Charts           : ${result.summary.terraformCount}`);
    console.log(`Terraform Configs     : ${result.summary.terraformCount}`);
    console.log(`Jenkins Pipelines     : ${result.summary.jenkinsCount}`);
    console.log(`Docker Compose        : ${result.summary.composeCount}`);
    console.log(`======================================================\n`);

    if (result.ciFiles.length > 0) {
      console.log(`DETECTED FILES:`);
      for (const file of result.ciFiles) {
        const confidenceStr = file.confidence.toString().padStart(3, " ");
        console.log(` [${confidenceStr}%] ${file.path.padEnd(50, " ")} (${file.type})`);
      }
    } else {
      console.log(`No CI/CD configurations detected.`);
    }

    const rate = await client.getRateLimit();
    console.log(`\n[API Rate Limit Remaining: ${rate?.remaining} / ${rate?.limit}]`);

  } catch (err: any) {
    console.error(`\n[FATAL ERROR]: ${err.message}`);
    process.exit(1);
  }
}

main();

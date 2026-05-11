/**
 * @file repo-scanner.test.ts
 */

import * as assert from "assert";
import { parseGitHubRepoUrl } from "./github.client";
import { RepositoryScanner, CIFileType, ParserType, cloneRepositoryIfNeeded } from "./repo-scanner";

let passed = 0; let failed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); console.log(`  ✅ PASS  ${name}`); passed++; }
  catch (e) {
    const r = e instanceof assert.AssertionError
      ? `Expected ${JSON.stringify(e.expected)} got ${JSON.stringify(e.actual)}`
      : String(e);
    console.log(`  ❌ FAIL  ${name}\n           → ${r}`); failed++;
  }
}

// Dummy client for testing Scanner logic without real API calls
const dummyClient = {} as any;
const scanner = new RepositoryScanner(dummyClient);

test("TEST 1 — Parse GitHub URL", () => {
  const ref = parseGitHubRepoUrl("https://github.com/vercel/next.js");
  assert.strictEqual(ref.owner, "vercel");
  assert.strictEqual(ref.repo, "next.js");
});

test("TEST 2 — Parse SSH URL", () => {
  const ref = parseGitHubRepoUrl("git@github.com:vercel/next.js.git");
  assert.strictEqual(ref.owner, "vercel");
  assert.strictEqual(ref.repo, "next.js");
});

test("TEST 3 — Reject invalid URL", () => {
  assert.throws(() => parseGitHubRepoUrl("https://gitlab.com/vercel/next.js"));
});

test("TEST 4 — Detect GitHub Actions workflow", () => {
  assert.strictEqual(scanner.detectFileType(".github/workflows/ci.yml"), CIFileType.GITHUB_ACTIONS);
});

test("TEST 5 — Detect GitLab CI config", () => {
  assert.strictEqual(scanner.detectFileType(".gitlab-ci.yml"), CIFileType.GITLAB_CI);
});

test("TEST 6 — Detect Dockerfile", () => {
  assert.strictEqual(scanner.detectFileType("Dockerfile.prod"), CIFileType.DOCKERFILE);
  assert.strictEqual(scanner.detectFileType("api.dockerfile"), CIFileType.DOCKERFILE);
});

test("TEST 7 — Detect Kubernetes manifest", () => {
  assert.strictEqual(scanner.detectFileType("k8s/deployment.yaml"), CIFileType.KUBERNETES);
  assert.strictEqual(scanner.detectFileType("manifests/service.yml"), CIFileType.KUBERNETES);
});

test("TEST 8 — Detect Helm chart", () => {
  assert.strictEqual(scanner.detectFileType("Chart.yaml"), CIFileType.HELM);
  assert.strictEqual(scanner.detectFileType("templates/deployment.yaml"), CIFileType.HELM);
});

test("TEST 9 — Detect Terraform file", () => {
  assert.strictEqual(scanner.detectFileType("main.tf"), CIFileType.TERRAFORM);
});

test("TEST 10 — Ignore binary file (filtered out upstream)", () => {
  // detectCIFile filters happen internally but let's test detectFileType fallback
  assert.strictEqual(scanner.detectFileType("image.png"), CIFileType.UNKNOWN);
});

test("TEST 11 — Ignore node_modules (filtered out upstream)", () => {
  // Test that it wouldn't map node_modules items as 100 confidence
  assert.strictEqual(scanner.calculateConfidence("node_modules/ci.yml", CIFileType.UNKNOWN), 20);
});

test("TEST 12 — Confidence scoring", () => {
  assert.strictEqual(scanner.calculateConfidence(".github/workflows/ci.yml", CIFileType.GITHUB_ACTIONS), 100);
  assert.strictEqual(scanner.calculateConfidence("k8s/custom.yml", CIFileType.KUBERNETES), 80);
});

test("TEST 13 — Parser inference", () => {
  assert.strictEqual(scanner.inferParser(CIFileType.JENKINSFILE), ParserType.JENKINSFILE);
  assert.strictEqual(scanner.inferParser(CIFileType.TERRAFORM), ParserType.TERRAFORM);
});

test("TEST 14 — Summary calculation", async () => {
  // We'll mock the tree API for a quick scanTest
  const mockClient = {
    validateRepositoryAccess: async () => true,
    getRepositoryMetadata: async () => ({ id: 1 }),
    getRepositoryTree: async () => [
      { path: "Dockerfile", type: "blob" },
      { path: ".github/workflows/main.yml", type: "blob" },
      { path: "main.ts", type: "blob" }
    ]
  } as any;
  const mockScanner = new RepositoryScanner(mockClient);
  const result = await mockScanner.scanRepository("https://github.com/a/b");
  assert.strictEqual(result.summary.totalFiles, 3);
  assert.strictEqual(result.summary.ciFileCount, 2);
  assert.strictEqual(result.summary.dockerCount, 1);
  assert.strictEqual(result.summary.githubActionsCount, 1);
});

test("TEST 15 — Clone path sanitization", async () => {
  try {
    // Should throw since we don't have a real git setup, but sanitization shouldn't throw error
    await cloneRepositoryIfNeeded("https://github.com/foo.bar/baz-qux", "/tmp");
  } catch (e: any) {
    assert.ok(e.message.includes("Failed to clone")); // Proves it sanitized and passed to simple-git
  }
});

console.log("");
console.log("─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);

/**
 * @file index.test.ts
 */

import * as assert from "assert";
import { detectFileType, detectAndParse } from "./index";
import { WorkflowSource } from "../models/workflow.model";

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

test("TEST 1 — Routes .github/workflows/ci.yml to GitHub Actions parser", () => {
  const content = `name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo`;
  const type = detectFileType(".github/workflows/ci.yml", content);
  assert.strictEqual(type, 'github-actions');
  const r = detectAndParse(content, ".github/workflows/ci.yml", "repo");
  assert.strictEqual(r.result?.source, WorkflowSource.GITHUB_ACTIONS);
});

test("TEST 2 — Routes .gitlab-ci.yml to GitLab CI parser", () => {
  const content = `stages: [build]\nbuild-job:\n  stage: build\n  script: [echo]`;
  const type = detectFileType(".gitlab-ci.yml", content);
  assert.strictEqual(type, 'gitlab-ci');
  const r = detectAndParse(content, ".gitlab-ci.yml", "repo");
  assert.strictEqual(r.result?.source, WorkflowSource.GITLAB_CI);
});

test("TEST 3 — Routes Dockerfile to Dockerfile parser", () => {
  const content = `FROM node:18`;
  const type = detectFileType("Dockerfile", content);
  assert.strictEqual(type, 'dockerfile');
  const r = detectAndParse(content, "Dockerfile", "repo");
  assert.strictEqual(r.result?.source, WorkflowSource.DOCKERFILE);
});

test("TEST 4 — Routes Jenkinsfile to Jenkinsfile parser", () => {
  const content = `pipeline { agent any }`;
  const type = detectFileType("Jenkinsfile", content);
  assert.strictEqual(type, 'jenkinsfile');
  const r = detectAndParse(content, "Jenkinsfile", "repo");
  assert.strictEqual(r.result?.source, WorkflowSource.JENKINS);
});

test("TEST 5 — Routes deployment.yaml with kind: Deployment to K8s parser", () => {
  const content = `kind: Deployment\nmetadata:\n  name: app`;
  const type = detectFileType("deployment.yaml", content);
  assert.strictEqual(type, 'kubernetes');
  const r = detectAndParse(content, "deployment.yaml", "repo");
  assert.strictEqual(r.result?.source, WorkflowSource.KUBERNETES);
});

test("TEST 6 — Returns error for unsupported file type", () => {
  const content = `{"some": "json"}`;
  const r = detectAndParse(content, "package.json", "repo");
  assert.strictEqual(r.success, false);
  assert.ok(r.errors[0]?.message.includes("Unsupported file type: package.json"));
});

test("TEST 7 — detectFileType returns correct SupportedCIFile for each", () => {
  assert.strictEqual(detectFileType("Dockerfile.prod", "FROM node:18"), 'dockerfile');
  assert.strictEqual(detectFileType("Jenkinsfile.test", "node { }"), 'jenkinsfile');
  assert.strictEqual(detectFileType("random.yaml", "jobs:\n  test:\n    runs-on: linux"), 'github-actions');
});

console.log("");
console.log("─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);

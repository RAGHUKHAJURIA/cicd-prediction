/**
 * @file github-actions.parser.test.ts
 * @description Integration tests for the GitHub Actions parser.
 * Uses only Node.js built-in "assert" — no external test framework required.
 *
 * Run with: npx ts-node src/parsers/github-actions.parser.test.ts
 */

import * as assert from "assert";
import { parseGithubActions } from "./github-actions.parser";
import { ActionRefType, RunnerType, SecretSource } from "../models/workflow.model";

// =============================================================================
// Test runner
// =============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✅ PASS  ${name}`);
    passed++;
  } catch (e) {
    const reason = e instanceof assert.AssertionError
      ? `Expected ${JSON.stringify(e.expected)} but got ${JSON.stringify(e.actual)} (${e.message})`
      : String(e);
    console.log(`  ❌ FAIL  ${name}`);
    console.log(`           → ${reason}`);
    failed++;
  }
}

// =============================================================================
// TEST 1 — Basic valid workflow
// =============================================================================

test("TEST 1 — Basic valid workflow: 1 job, 2 steps, no errors", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
      - name: Install
        run: npm ci
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-1");
  assert.strictEqual(result.success, true, "success should be true");
  assert.strictEqual(result.errors.length, 0, "should have no errors");
  assert.ok(result.result, "result should be non-null");
  assert.strictEqual(result.result.jobs.length, 1, "should have 1 job");
  assert.strictEqual(result.result.jobs[0]!.steps.length, 2, "should have 2 steps");
  assert.strictEqual(result.result.metadata.totalJobs, 1);
  assert.strictEqual(result.result.metadata.totalSteps, 2);
  assert.strictEqual(result.result.metadata.ciSystem, "github-actions");
});

// =============================================================================
// TEST 2 — Floating action ref warning
// =============================================================================

test("TEST 2 — Floating action ref: TAG ref emits unpinned warning", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v3
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-2");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");

  const step = result.result.jobs[0]!.steps[0]!;
  assert.ok(step.actionRef, "actionRef should be set");
  assert.strictEqual(step.actionRef.isPinned, false, "isPinned should be false for tag ref");
  assert.strictEqual(step.actionRef.refType, ActionRefType.TAG, "refType should be TAG");

  const hasUnpinnedWarn = result.warnings.some((w) =>
    w.message.toLowerCase().includes("not pinned") || w.message.toLowerCase().includes("sha")
  );
  assert.ok(hasUnpinnedWarn, "should warn about unpinned action");
});

// =============================================================================
// TEST 3 — Pinned action ref (SHA) — no floating warning
// =============================================================================

test("TEST 3 — Pinned SHA ref: isPinned true, refType SHA, no floating warning", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@a81bbbf8298c0fa03ea29cdc473d45769f953675
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-3");
  assert.ok(result.result, "result should be non-null");

  const step = result.result.jobs[0]!.steps[0]!;
  assert.ok(step.actionRef, "actionRef should be set");
  assert.strictEqual(step.actionRef.isPinned, true, "isPinned should be true for SHA");
  assert.strictEqual(step.actionRef.refType, ActionRefType.SHA, "refType should be SHA");

  const hasFloatingWarn = result.warnings.some((w) =>
    w.message.toLowerCase().includes("not pinned") || w.message.toLowerCase().includes("floating")
  );
  assert.ok(!hasFloatingWarn, "should NOT warn about unpinned action for SHA ref");
});

// =============================================================================
// TEST 4 — Docker latest tag warning
// =============================================================================

test("TEST 4 — Docker latest tag: isFloating true, warning emitted", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    container:
      image: node:latest
    steps:
      - run: echo hello
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-4");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");

  const job = result.result.jobs[0]!;
  assert.ok(job.container, "container should be parsed");
  assert.strictEqual(job.container.imageRef.isFloating, true, "imageRef.isFloating should be true");
  assert.strictEqual(job.container.imageRef.tag, "latest");

  const hasDockerWarn = result.warnings.some((w) =>
    w.message.toLowerCase().includes("floating") || w.message.toLowerCase().includes("latest")
  );
  assert.ok(hasDockerWarn, "should warn about floating Docker tag");
});

// =============================================================================
// TEST 5 — Missing timeout warning
// =============================================================================

test("TEST 5 — Missing timeout: timeoutMinutes null, warning emitted", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: echo hello
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-5");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");

  const job = result.result.jobs[0]!;
  assert.strictEqual(job.timeoutMinutes, null, "timeoutMinutes should be null");

  const hasTimeoutWarn = result.warnings.some((w) =>
    w.message.toLowerCase().includes("timeout")
  );
  assert.ok(hasTimeoutWarn, "should warn about missing timeout");
});

// =============================================================================
// TEST 6 — Secret detection
// =============================================================================

test("TEST 6 — Secret detection: containsSecret true, SecretRef at job level", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Test
        run: echo test
        env:
          API_KEY: \${{ secrets.MY_API_KEY }}
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-6");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");

  const step = result.result.jobs[0]!.steps[0]!;
  const secretEnvVar = step.env.find((e) => e.key === "API_KEY");
  assert.ok(secretEnvVar, "API_KEY env var should be present on step");
  assert.strictEqual(secretEnvVar.containsSecret, true, "containsSecret should be true for *_KEY pattern");

  // Secrets are aggregated to job level during step parsing
  const job = result.result.jobs[0]!;
  const secretRef = job.secrets.find((s) => s.source === SecretSource.SECRETS_CONTEXT);
  assert.ok(secretRef, "job.secrets should contain a SECRETS_CONTEXT SecretRef");
  assert.strictEqual(secretRef.name, "MY_API_KEY");
});

// =============================================================================
// TEST 7 — npm install instead of npm ci warning
// =============================================================================

test("TEST 7 — npm install: warning emitted, not npm ci", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: npm install
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-7");
  assert.strictEqual(result.success, true, "success should be true");

  const hasNpmWarn = result.warnings.some((w) =>
    w.message.toLowerCase().includes("npm install") || w.message.toLowerCase().includes("npm ci")
  );
  assert.ok(hasNpmWarn, "should warn about npm install vs npm ci");
});

// =============================================================================
// TEST 8 — Matrix strategy parsing
// =============================================================================

test("TEST 8 — Matrix strategy: parsed correctly", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      fail-fast: false
      matrix:
        node: [16, 18, 20]
    steps:
      - run: echo hello
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-8");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");

  const job = result.result.jobs[0]!;
  assert.ok(job.strategy, "strategy should be set");
  assert.deepStrictEqual(
    job.strategy.matrix["node"],
    ["16", "18", "20"],
    "matrix.node should be string array"
  );
  assert.strictEqual(typeof job.strategy.failFast, "boolean", "failFast should be boolean");
  assert.strictEqual(job.strategy.failFast, false);
});

// =============================================================================
// TEST 9 — Multi-trigger parsing
// =============================================================================

test("TEST 9 — Multi-trigger: [push, pull_request] → 2 triggers", () => {
  const yaml = `
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo hello
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-9");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");
  assert.strictEqual(result.result.triggers.length, 2, "should have 2 triggers");

  const types = result.result.triggers.map((t) => t.type);
  assert.ok(types.includes("PUSH" as never), "should include PUSH trigger");
  assert.ok(types.includes("PULL_REQUEST" as never), "should include PULL_REQUEST trigger");
});

// =============================================================================
// TEST 10 — Invalid YAML returns error
// =============================================================================

test("TEST 10 — Invalid YAML: success false, errors non-empty, result null", () => {
  const invalidYaml = "{ invalid: yaml: content: [";
  const result = parseGithubActions(invalidYaml, ".github/workflows/ci.yml", "repo-10");
  assert.strictEqual(result.success, false, "success should be false for invalid YAML");
  assert.ok(result.errors.length > 0, "errors should be non-empty");
  assert.strictEqual(result.result, null, "result should be null on parse failure");
});

// =============================================================================
// TEST 11 — needs dependency parsing
// =============================================================================

test("TEST 11 — needs: jobB.needs[0].jobId === 'jobA'", () => {
  const yaml = `
name: CI
on: push
jobs:
  jobA:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - run: echo a
  jobB:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [jobA]
    steps:
      - run: echo b
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-11");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");

  const jobB = result.result.jobs.find((j) => j.id === "jobB");
  assert.ok(jobB, "jobB should exist");
  assert.strictEqual(jobB.needs.length, 1, "jobB should have 1 dependency");
  assert.strictEqual(jobB.needs[0]!.jobId, "jobA", "dependency jobId should be 'jobA'");
});

// =============================================================================
// TEST 12 — Self-hosted runner detection
// =============================================================================

test("TEST 12 — Self-hosted runner: [self-hosted, linux, x64]", () => {
  const yaml = `
name: CI
on: push
jobs:
  build:
    runs-on: [self-hosted, linux, x64]
    timeout-minutes: 10
    steps:
      - run: echo hello
`;
  const result = parseGithubActions(yaml, ".github/workflows/ci.yml", "repo-12");
  assert.strictEqual(result.success, true, "success should be true");
  assert.ok(result.result, "result should be non-null");

  const job = result.result.jobs[0]!;
  assert.strictEqual(job.runsOn.type, RunnerType.SELF_HOSTED, "runsOn.type should be SELF_HOSTED");
  assert.ok(job.runsOn.labels.includes("linux"), "labels should include 'linux'");
  assert.ok(job.runsOn.labels.includes("x64"), "labels should include 'x64'");
});

// =============================================================================
// Summary
// =============================================================================

console.log("");
console.log("─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) {
  console.log("⚠️  Some tests FAILED.");
  process.exit(1);
} else {
  console.log("🎉  All tests PASSED.");
}

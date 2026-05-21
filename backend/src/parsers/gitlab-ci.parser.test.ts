/**
 * @file gitlab-ci.parser.test.ts
 * @description 20 integration tests for the GitLab CI parser.
 * Run with: npx ts-node src/parsers/gitlab-ci.parser.test.ts
 */
import * as assert from "assert";
import { parseGitlabCI, parseGitlabTimeout } from "./gitlab-ci.parser";
import { ArtifactType, ConditionType, RunnerType } from "../models/workflow.model";

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

// ── TEST 1 — Basic valid pipeline ─────────────────────────────────────────────
test("TEST 1 — Basic valid pipeline: 3 jobs, no errors", () => {
  const src = `
stages: [build, test, deploy]
build-job:
  stage: build
  script: [make build]
test-job:
  stage: test
  script: [make test]
deploy-job:
  stage: deploy
  script: [make deploy]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-1");
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.errors.length, 0);
  assert.ok(r.result);
  assert.strictEqual(r.result.jobs.length, 3);
  const stages = r.result.jobs.map((j) => j.id);
  assert.ok(stages.includes("build-job") && stages.includes("test-job") && stages.includes("deploy-job"));
});

// ── TEST 2 — Stage-based dependency resolution ────────────────────────────────
test("TEST 2 — Stage dependencies: build←test←deploy", () => {
  const src = `
stages: [build, test, deploy]
build-job:
  stage: build
  script: [echo build]
test-job:
  stage: test
  script: [echo test]
deploy-job:
  stage: deploy
  script: [echo deploy]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-2");
  assert.ok(r.result);
  const build  = r.result.jobs.find((j) => j.id === "build-job")!;
  const test_  = r.result.jobs.find((j) => j.id === "test-job")!;
  const deploy = r.result.jobs.find((j) => j.id === "deploy-job")!;
  assert.strictEqual(build.needs.length, 0, "build-job should have no deps");
  assert.strictEqual(test_.needs.length, 1);
  assert.strictEqual(test_.needs[0]!.jobId, "build-job");
  assert.strictEqual(deploy.needs.length, 1);
  assert.strictEqual(deploy.needs[0]!.jobId, "test-job");
});

// ── TEST 3 — needs overrides stage deps (DAG mode) ────────────────────────────
test("TEST 3 — needs: overrides stage-based deps", () => {
  const src = `
stages: [build, test, deploy]
build-job:
  stage: build
  script: [echo build]
dag-job:
  stage: test
  needs: [build-job]
  script: [echo dag]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-3");
  assert.ok(r.result);
  const dagJob = r.result.jobs.find((j) => j.id === "dag-job")!;
  assert.strictEqual(dagJob.needs.length, 1);
  assert.strictEqual(dagJob.needs[0]!.jobId, "build-job");
  // Should NOT also have stage-based deps (only the explicit needs)
  assert.ok(!dagJob.needs.some((n) => n.jobId !== "build-job"));
});

// ── TEST 4 — Global image parsing ────────────────────────────────────────────
test("TEST 4 — Global image: parsed with correct tag, hasDockerImages true", () => {
  const src = `
image: node:18-alpine
stages: [build]
build-job:
  stage: build
  script: [npm ci]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-4");
  assert.ok(r.result);
  assert.strictEqual(r.result.metadata.hasDockerImages, true);
  const job = r.result.jobs[0]!;
  assert.ok(job.container, "job should inherit global image as container");
  assert.strictEqual(job.container.imageRef.tag, "18-alpine");
  assert.strictEqual(job.container.imageRef.isFloating, false);
});

// ── TEST 5 — Floating image warning ──────────────────────────────────────────
test("TEST 5 — Floating image: warning emitted, isFloating true", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  image: python:latest
  script: [pytest]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-5");
  assert.strictEqual(r.success, true);
  assert.ok(r.result);
  const job = r.result.jobs[0]!;
  assert.ok(job.container);
  assert.strictEqual(job.container.imageRef.isFloating, true);
  const hasWarn = r.warnings.some((w) => w.message.toLowerCase().includes("floating") || w.message.toLowerCase().includes("latest"));
  assert.ok(hasWarn, "should warn about floating image");
});

// ── TEST 6 — before_script, script, after_script as ordered steps ─────────────
test("TEST 6 — before/script/after: 3 ordered steps", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  before_script: [npm ci]
  script: [npm test]
  after_script: [echo done]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-6");
  assert.ok(r.result);
  const steps = r.result.jobs[0]!.steps;
  assert.strictEqual(steps.length, 3);
  assert.ok(steps[0]!.name?.includes("Before script"), `step[0] name="${steps[0]!.name}"`);
  assert.ok(!steps[1]!.name?.startsWith("Before") && !steps[1]!.name?.startsWith("After"), "middle step should be script");
  assert.ok(steps[2]!.name?.includes("After script"), `step[2] name="${steps[2]!.name}"`);
});

// ── TEST 7 — retry parsing ────────────────────────────────────────────────────
test("TEST 7 — retry: maxAttempts=2, onFailure=true", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  script: [pytest]
  retry:
    max: 2
    when: [runner_system_failure]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-7");
  assert.ok(r.result);
  const retry = r.result.jobs[0]!.retryStrategy;
  assert.ok(retry, "retryStrategy should be set");
  assert.strictEqual(retry.maxAttempts, 2);
  assert.strictEqual(retry.onFailure, true);
});

// ── TEST 8 — rules parsing ────────────────────────────────────────────────────
test("TEST 8 — rules: 3 conditions all type RULES", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  script: [echo ok]
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: always
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
      when: always
    - when: never
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-8");
  assert.ok(r.result);
  const conds = r.result.jobs[0]!.conditions;
  assert.strictEqual(conds.length, 3);
  assert.ok(conds.every((c) => c.type === ConditionType.RULES));
});

// ── TEST 9 — cache parsing ────────────────────────────────────────────────────
test("TEST 9 — cache: ArtifactSpec type CACHE with correct paths", () => {
  const src = `
stages: [build]
build-job:
  stage: build
  script: [npm ci]
  cache:
    key: \$CI_COMMIT_REF_SLUG
    paths: [node_modules/]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-9");
  assert.ok(r.result);
  const artifacts = r.result.jobs[0]!.artifacts;
  const cache = artifacts.find((a) => a.type === ArtifactType.CACHE);
  assert.ok(cache, "should have a CACHE artifact");
  assert.ok(cache.paths.includes("node_modules/"));
});

// ── TEST 10 — artifacts with expire_in ───────────────────────────────────────
test("TEST 10 — artifacts: UPLOAD type with expireIn='1 week'", () => {
  const src = `
stages: [build]
build-job:
  stage: build
  script: [npm run build]
  artifacts:
    paths: [dist/]
    expire_in: 1 week
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-10");
  assert.ok(r.result);
  const artifacts = r.result.jobs[0]!.artifacts;
  const upload = artifacts.find((a) => a.type === ArtifactType.UPLOAD);
  assert.ok(upload, "should have an UPLOAD artifact");
  assert.strictEqual(upload.expireIn, "1 week");
  assert.ok(upload.paths.includes("dist/"));
});

// ── TEST 11 — timeout string parsing ─────────────────────────────────────────
test("TEST 11 — timeout: '1h 30m'=90, '45 minutes'=45", () => {
  assert.strictEqual(parseGitlabTimeout("1h 30m"), 90);
  assert.strictEqual(parseGitlabTimeout("45 minutes"), 45);
  assert.strictEqual(parseGitlabTimeout("2h"), 120);
  assert.strictEqual(parseGitlabTimeout("1 day"), 1440);
  assert.strictEqual(parseGitlabTimeout("3600 seconds"), 60);
  assert.strictEqual(parseGitlabTimeout("1 hour"), 60);
  assert.strictEqual(parseGitlabTimeout("1 hour 30 minutes"), 90);

  const src = `
stages: [test]
test-job:
  stage: test
  script: [pytest]
  timeout: 1h 30m
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-11");
  assert.ok(r.result);
  assert.strictEqual(r.result.jobs[0]!.timeoutMinutes, 90);
});

// ── TEST 12 — variables (global + job level) ──────────────────────────────────
test("TEST 12 — variables: global and job-level, containsSecret check", () => {
  const src = `
variables:
  NODE_ENV: production
  API_KEY: supersecret
stages: [test]
test-job:
  stage: test
  script: [echo ok]
  variables:
    DEBUG: "true"
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-12");
  assert.ok(r.result);
  const globalEnv = r.result.globalEnv;
  assert.ok(globalEnv.some((e) => e.key === "NODE_ENV"), "should have NODE_ENV");
  assert.ok(globalEnv.some((e) => e.key === "API_KEY"), "should have API_KEY");
  const apiKeyVar = globalEnv.find((e) => e.key === "API_KEY")!;
  assert.strictEqual(apiKeyVar.containsSecret, true, "API_KEY should have containsSecret=true");
  const jobEnv = r.result.jobs[0]!.env;
  assert.ok(jobEnv.some((e) => e.key === "DEBUG"), "should have DEBUG in job env");
});

// ── TEST 13 — parallel matrix strategy ───────────────────────────────────────
test("TEST 13 — parallel matrix: REGION and ENV dimensions", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  script: [echo ok]
  parallel:
    matrix:
      - REGION: [us, eu]
        ENV: [prod, staging]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-13");
  assert.ok(r.result);
  const strategy = r.result.jobs[0]!.strategy;
  assert.ok(strategy, "strategy should be set");
  assert.ok(strategy.matrix["REGION"]?.includes("us") && strategy.matrix["REGION"]?.includes("eu"));
  assert.ok(strategy.matrix["ENV"]?.includes("prod") && strategy.matrix["ENV"]?.includes("staging"));
});

// ── TEST 14 — services parsing ────────────────────────────────────────────────
test("TEST 14 — services: two services parsed with correct tags", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  script: [pytest]
  services:
    - postgres:14
    - name: redis:6
      alias: cache
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-14");
  assert.ok(r.result);
  const services = r.result.jobs[0]!.services;
  assert.strictEqual(services.length, 2);
  assert.strictEqual(services[0]!.container.imageRef.tag, "14");
  assert.strictEqual(services[1]!.container.imageRef.tag, "6");
  assert.strictEqual(services[1]!.name, "cache");
});

// ── TEST 15 — reserved keys not parsed as jobs ────────────────────────────────
test("TEST 15 — reserved keys: only 'build' job is parsed", () => {
  const src = `
stages: [build]
variables:
  FOO: bar
image: node:18
default:
  before_script: [echo hi]
workflow:
  rules:
    - when: always
build:
  stage: build
  script: [make]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-15");
  assert.ok(r.result, `result is null, errors: ${JSON.stringify(r.errors)}`);
  assert.strictEqual(r.result.jobs.length, 1);
  assert.strictEqual(r.result.jobs[0]!.id, "build");
});

// ── TEST 16 — missing script warning ─────────────────────────────────────────
test("TEST 16 — missing script: warning emitted, success true", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  image: node:18
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-16");
  assert.strictEqual(r.success, true);
  const hasWarn = r.warnings.some((w) => w.message.toLowerCase().includes("script"));
  assert.ok(hasWarn, `should warn about missing script. Warnings: ${JSON.stringify(r.warnings.map(w=>w.message))}`);
});

// ── TEST 17 — invalid YAML ────────────────────────────────────────────────────
test("TEST 17 — invalid YAML: success false, result null", () => {
  const r = parseGitlabCI("{ invalid: [yaml content", ".gitlab-ci.yml", "repo-17");
  assert.strictEqual(r.success, false);
  assert.ok(r.errors.length > 0);
  assert.strictEqual(r.result, null);
});

// ── TEST 18 — only/except parsing (legacy) ────────────────────────────────────
test("TEST 18 — only/except: conditions include ONLY and EXCEPT types", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  script: [echo ok]
  only: [main, merge_requests]
  except: [schedules]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-18");
  assert.ok(r.result);
  const conds = r.result.jobs[0]!.conditions;
  assert.ok(conds.some((c) => c.type === ConditionType.ONLY), "should have ONLY condition");
  assert.ok(conds.some((c) => c.type === ConditionType.EXCEPT), "should have EXCEPT condition");
});

// ── TEST 19 — self-hosted runner via tags ─────────────────────────────────────
test("TEST 19 — tags: SELF_HOSTED runner with correct labels", () => {
  const src = `
stages: [build]
build-job:
  stage: build
  script: [make]
  tags: [docker, linux, production]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-19");
  assert.ok(r.result);
  const runsOn = r.result.jobs[0]!.runsOn;
  assert.strictEqual(runsOn.type, RunnerType.SELF_HOSTED);
  assert.ok(runsOn.labels.includes("docker") && runsOn.labels.includes("linux") && runsOn.labels.includes("production"));
});

// ── TEST 20 — needs references nonexistent job ────────────────────────────────
test("TEST 20 — needs nonexistent job: success true, warning emitted", () => {
  const src = `
stages: [test]
test-job:
  stage: test
  script: [echo ok]
  needs: [nonexistent-job]
`;
  const r = parseGitlabCI(src, ".gitlab-ci.yml", "repo-20");
  assert.strictEqual(r.success, true);
  const hasWarn = r.warnings.some((w) => w.message.includes("nonexistent-job") || w.message.toLowerCase().includes("does not exist"));
  assert.ok(hasWarn, `should warn about nonexistent-job. Warnings: ${JSON.stringify(r.warnings.map(w=>w.message))}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("");
console.log("─".repeat(55));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) { console.log("⚠️  Some tests FAILED."); process.exit(1); }
else             { console.log("🎉  All tests PASSED."); }

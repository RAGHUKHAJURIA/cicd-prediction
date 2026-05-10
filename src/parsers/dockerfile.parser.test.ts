/**
 * @file dockerfile.parser.test.ts
 */

import * as assert from "assert";
import { parseDockerfile } from "./dockerfile.parser";

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

test("TEST 1 — Single stage Dockerfile", () => {
  const raw = `FROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nEXPOSE 3000\nUSER node\nCMD ["node", "server.js"]`;
  const r = parseDockerfile(raw, "Dockerfile", "repo-1");
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.result!.jobs.length, 1);
  assert.strictEqual(r.result!.jobs[0]!.container!.imageRef.tag, "18-alpine");
  assert.strictEqual(r.result!.jobs[0]!.container!.imageRef.isFloating, false);
  const md = r.result!.metadata as any;
  assert.ok(md.exposedPorts.includes(3000));
});

test("TEST 2 — Multi-stage Dockerfile", () => {
  const raw = `FROM node:18 AS builder\nRUN npm run build\nFROM node:18-alpine AS runner\nCOPY --from=builder /dist /dist`;
  const r = parseDockerfile(raw, "Dockerfile", "repo-2");
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.result!.jobs.length, 2);
  assert.strictEqual(r.result!.jobs[0]!.id, "builder");
  assert.strictEqual(r.result!.jobs[1]!.id, "runner");
  assert.strictEqual((r.result!.metadata as any).isMultiStage, true);
});

test("TEST 3 — Floating base image warning", () => {
  const raw = `FROM node:latest`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("latest tag") || w.message.includes("floating tag")));
  assert.strictEqual(r.result!.jobs[0]!.container!.imageRef.isFloating, true);
});

test("TEST 4 — Root user warning", () => {
  const raw = `FROM node:18\nCMD ["node"]`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("runs as root")));
});

test("TEST 5 — npm install warning", () => {
  const raw = `FROM node:18\nRUN npm install`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("npm install instead of npm ci")));
});

test("TEST 6 — ARG used for secrets warning", () => {
  const raw = `FROM node:18\nARG API_SECRET\nARG DATABASE_PASSWORD`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  const ws = r.warnings.filter(w => w.message.includes("ARG used for secrets (appears in image history)"));
  assert.strictEqual(ws.length, 2);
  const env = r.result!.jobs[0]!.env;
  assert.strictEqual(env.find(e => e.key === "API_SECRET")!.containsSecret, true);
  assert.strictEqual(env.find(e => e.key === "DATABASE_PASSWORD")!.containsSecret, true);
});

test("TEST 7 — COPY . . warning", () => {
  const raw = `FROM node:18\nCOPY . .`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("COPY . . without dockerignore warning")));
});

test("TEST 8 — No HEALTHCHECK warning", () => {
  const raw = `FROM node:18`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("No HEALTHCHECK instruction")));
});

test("TEST 9 — ADD instead of COPY warning", () => {
  const raw = `FROM node:18\nADD config.json /app/`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("ADD used instead of COPY")));
});

test("TEST 10 — ENV parsing both formats", () => {
  const raw = `FROM node:18\nENV NODE_ENV=production\nENV DEBUG true`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  const env = r.result!.jobs[0]!.env;
  assert.strictEqual(env.find(e => e.key === "NODE_ENV")!.value, "production");
  assert.ok(r.warnings.some(w => w.message.includes("Legacy ENV format")));
});

test("TEST 11 — curl pipe bash warning", () => {
  const raw = `FROM node:18\nRUN curl -sSL https://example.com/install.sh | bash`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("curl | bash")));
});

test("TEST 12 — Pinned digest image (no warning)", () => {
  const raw = `FROM node@sha256:abc123def4567890`;
  const r = parseDockerfile(raw, "Dockerfile", "repo");
  const img = r.result!.jobs[0]!.container!.imageRef;
  assert.strictEqual(img.isPinned, true);
  assert.strictEqual(img.isFloating, false);
  assert.ok(!r.warnings.some(w => w.message.includes("uses latest tag or has no tag")));
});

console.log("");
console.log("─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);

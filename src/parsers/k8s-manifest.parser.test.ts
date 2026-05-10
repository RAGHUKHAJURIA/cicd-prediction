/**
 * @file k8s-manifest.parser.test.ts
 */

import * as assert from "assert";
import { parseK8sManifest } from "./k8s-manifest.parser";
import { SecretSource, TriggerType } from "../models/workflow.model";

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

test("TEST 1 — Basic Deployment parsing", () => {
  const raw = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: test-app
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        image: node:18
        resources:
          limits:
            memory: "512Mi"
          requests:
            memory: "256Mi"
        livenessProbe:
          httpGet:
            path: /
        readinessProbe:
          httpGet:
            path: /
`;
  const r = parseK8sManifest(raw, "deployment.yaml", "repo");
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.result!.jobs.length, 1);
  assert.ok(r.result!.jobs[0]!.name.includes("Deployment"));
  assert.strictEqual(r.result!.jobs[0]!.container!.imageRef.tag, "18");
});

test("TEST 2 — Multi-document YAML (--- separator)", () => {
  const raw = `
kind: Deployment
metadata:
  name: d1
---
kind: Service
metadata:
  name: s1
---
kind: ConfigMap
metadata:
  name: c1
`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.result!.jobs.length, 1); // Only deployment is a job
  assert.strictEqual((r.result!.metadata as any).totalResources, 3);
});

test("TEST 3 — Floating image warning", () => {
  const raw = `kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - image: nginx:latest`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("latest tag")));
  assert.strictEqual(r.result!.jobs[0]!.container!.imageRef.isFloating, true);
});

test("TEST 4 — No resource limits warning", () => {
  const raw = `kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - image: nginx:1`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("No resource limits")));
  assert.ok(r.warnings.some(w => w.message.includes("No resource requests")));
});

test("TEST 5 — No liveness probe warning", () => {
  const raw = `kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - image: nginx:1`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("No livenessProbe")));
});

test("TEST 6 — No readiness probe warning", () => {
  const raw = `kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - image: nginx:1`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("No readinessProbe")));
});

test("TEST 7 — Root container warning", () => {
  const raw = `kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - image: nginx:1\n        securityContext:\n          runAsUser: 0`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("runs as root")));
});

test("TEST 8 — allowPrivilegeEscalation warning", () => {
  const raw = `kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - image: nginx:1\n        securityContext:\n          runAsUser: 1000`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("allowPrivilegeEscalation not set to false")));
});

test("TEST 9 — Secret in manifest warning", () => {
  const raw = `kind: Secret\nstringData:\n  api-key: my-secret`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("Secret resource committed to version control")));
  assert.ok(r.warnings.some(w => w.message.includes("plaintext secret")));
});

test("TEST 10 — secretKeyRef env var becomes SecretRef", () => {
  const raw = `
kind: Deployment
spec:
  template:
    spec:
      containers:
      - image: nginx:1
        env:
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: my-secret
              key: token
`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  const job = r.result!.jobs[0]!;
  assert.ok(job.secrets.some(s => s.name === "API_KEY" && s.source === SecretSource.VAULT));
});

test("TEST 11 — CronJob trigger parsing", () => {
  const raw = `kind: CronJob\nspec:\n  schedule: "0 2 * * *"`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.strictEqual(r.result!.triggers[0]!.type, TriggerType.SCHEDULE);
  assert.strictEqual(r.result!.triggers[0]!.schedule, "0 2 * * *");
});

test("TEST 12 — Batch Job retry and timeout", () => {
  const raw = `kind: Job\nspec:\n  backoffLimit: 3\n  activeDeadlineSeconds: 3600`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.strictEqual(r.result!.jobs[0]!.retryStrategy!.maxAttempts, 3);
  assert.strictEqual(r.result!.jobs[0]!.timeoutMinutes, 60);
});

test("TEST 13 — RBAC wildcard warning", () => {
  const raw = `kind: ClusterRole\nrules:\n- apiGroups: [""]\n  resources: ["*"]\n  verbs: ["*"]`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("Wildcard permissions")));
});

test("TEST 14 — Ingress without TLS warning", () => {
  const raw = `kind: Ingress\nspec:\n  rules:\n  - host: a.com`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("Ingress without TLS")));
});

test("TEST 15 — Single replica warning", () => {
  const raw = `kind: Deployment\nspec:\n  replicas: 1`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("single point of failure")));
});

test("TEST 16 — Privileged container warning", () => {
  const raw = `kind: Deployment\nspec:\n  template:\n    spec:\n      containers:\n      - image: n\n        securityContext:\n          privileged: true`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("Privileged container")));
});

test("TEST 17 — No namespace warning", () => {
  const raw = `kind: Deployment\nmetadata:\n  name: app`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("No namespace")));
});

test("TEST 18 — LoadBalancer without source ranges warning", () => {
  const raw = `kind: Service\nspec:\n  type: LoadBalancer`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("open to internet")));
});

test("TEST 19 — ConfigMap with secret-looking data warning", () => {
  const raw = `kind: ConfigMap\ndata:\n  API_PASSWORD: foo`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.ok(r.warnings.some(w => w.message.includes("secret-looking data")));
});

test("TEST 20 — Invalid YAML returns error", () => {
  const raw = `{ invalid yaml content [`;
  const r = parseK8sManifest(raw, "manifest.yaml", "repo");
  assert.strictEqual(r.success, false);
  assert.strictEqual(r.result, null);
  assert.ok(r.errors.length > 0);
});

console.log("");
console.log("─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed > 0) process.exit(1);

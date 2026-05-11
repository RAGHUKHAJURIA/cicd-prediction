/**
 * Integration tests for the REST API.
 * Uses Node.js built-in http module — no Jest, no Vitest, no supertest.
 * Run with: npx tsx src/routes/routes.test.ts
 */

import http from "http";
import { createApp } from "../app";

// ─── Test harness ─────────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

async function setup(): Promise<void> {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve()); // random available port
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 3000;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[test] Server started on ${baseUrl}`);
}

function teardown(): void {
  server?.close();
  console.log("[test] Server stopped.");
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

interface HttpResult {
  status: number;
  body: unknown;
}

function request(
  method: string,
  path: string,
  body?: unknown
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const url = new URL(path, baseUrl);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload).toString() } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: raw });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Assertion helper ─────────────────────────────────────────────────────────

let passed = 0;
let skipped = 0;
let failed = 0;

function assert(condition: boolean, description: string): void {
  if (!condition) throw new Error(`Assertion failed: ${description}`);
}

async function test(
  name: string,
  fn: () => Promise<void>,
  skip = false
): Promise<void> {
  if (skip) {
    console.log(`  SKIP  ${name}`);
    skipped++;
    return;
  }
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL  ${name} — ${message}`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function runTests(): Promise<void> {
  await setup();

  // TEST 1 — GET /health returns 200 with status ok
  await test("GET /health returns 200 with status ok", async () => {
    const { status, body } = await request("GET", "/health");
    assert(status === 200, `Expected 200, got ${status}`);
    const b = body as Record<string, unknown>;
    assert(b["status"] === "ok", "Expected status: ok");
    assert(typeof b["uptime"] === "number", "Expected uptime to be a number");
  });

  // TEST 2 — GET /api returns 200 with API info
  await test("GET /api returns 200 with API info", async () => {
    const { status, body } = await request("GET", "/api");
    assert(status === 200, `Expected 200, got ${status}`);
    const b = body as Record<string, unknown>;
    assert(typeof b["name"] === "string", "Expected name field");
    assert(Array.isArray(b["endpoints"]), "Expected endpoints array");
  });

  // TEST 3 — Unknown route returns 404 with ROUTE_NOT_FOUND
  await test("Unknown route returns 404 with ROUTE_NOT_FOUND", async () => {
    const { status, body } = await request("GET", "/api/v999/unknown");
    assert(status === 404, `Expected 404, got ${status}`);
    const b = body as Record<string, unknown>;
    assert(b["code"] === "ROUTE_NOT_FOUND", `Expected ROUTE_NOT_FOUND, got ${b["code"]}`);
  });

  // TEST 4 — POST /api/repos with invalid URL returns 422
  await test("POST /api/repos with invalid URL returns 422", async () => {
    const { status, body } = await request("POST", "/api/repos", {
      repoUrl: "not-a-url",
    });
    assert(status === 422, `Expected 422, got ${status}`);
    const b = body as Record<string, unknown>;
    assert(b["success"] === false, "Expected success: false");
    assert(Array.isArray(b["details"]), "Expected details array");
    const details = b["details"] as Array<Record<string, unknown>>;
    assert(
      details.some((d) => String(d["field"]).includes("repoUrl")),
      "Expected repoUrl error in details"
    );
  });

  // TEST 5 — POST /api/repos with empty body returns 422
  await test("POST /api/repos with missing required fields returns 422", async () => {
    const { status, body } = await request("POST", "/api/repos", {});
    assert(status === 422, `Expected 422, got ${status}`);
    const b = body as Record<string, unknown>;
    assert(b["success"] === false, "Expected success: false");
  });

  // TEST 6 — GET /api/repos/:id with non-UUID returns 422
  await test("GET /api/repos/:id with non-UUID returns 422", async () => {
    const { status, body } = await request("GET", "/api/repos/not-a-uuid");
    assert(status === 422, `Expected 422, got ${status}`);
    const b = body as Record<string, unknown>;
    assert(b["success"] === false, "Expected success: false");
    const details = b["details"] as Array<Record<string, unknown>>;
    assert(
      details.some((d) => String(d["message"]).toLowerCase().includes("uuid")),
      "Expected UUID message in details"
    );
  });

  // TEST 7 — GET /api/repos/:id with valid UUID but nonexistent returns 404
  await test(
    "GET /api/repos/:id with valid UUID but nonexistent returns 404",
    async () => {
      const fakeId = "00000000-0000-4000-8000-000000000000";
      const { status, body } = await request("GET", `/api/repos/${fakeId}`);
      assert(status === 404, `Expected 404, got ${status}`);
      const b = body as Record<string, unknown>;
      assert(b["success"] === false, "Expected success: false");
    }
  );

  // TEST 8 — DELETE /api/repos/:id with nonexistent id returns 404
  await test(
    "DELETE /api/repos/:id with nonexistent id returns 404",
    async () => {
      const fakeId = "00000000-0000-4000-8000-000000000001";
      const { status, body } = await request("DELETE", `/api/repos/${fakeId}`);
      assert(status === 404, `Expected 404, got ${status}`);
      const b = body as Record<string, unknown>;
      assert(b["success"] === false, "Expected success: false");
    }
  );

  // TEST 9 — GET /api/repos returns 200 with pagination structure
  await test("GET /api/repos returns 200 with pagination structure", async () => {
    const { status, body } = await request("GET", "/api/repos");
    assert(status === 200, `Expected 200, got ${status}`);
    const b = body as Record<string, unknown>;
    assert(b["success"] === true, "Expected success: true");
    const data = b["data"] as Record<string, unknown>;
    assert(Array.isArray(data["repos"]), "Expected repos array");
    const pagination = data["pagination"] as Record<string, unknown>;
    assert(typeof pagination["page"] === "number", "Expected pagination.page");
    assert(typeof pagination["limit"] === "number", "Expected pagination.limit");
    assert(typeof pagination["total"] === "number", "Expected pagination.total");
    assert(typeof pagination["totalPages"] === "number", "Expected pagination.totalPages");
  });

  // TEST 10 — POST /api/repos with valid GitHub URL
  const hasToken = Boolean(process.env["GITHUB_TOKEN"]);
  await test(
    "POST /api/repos with valid GitHub URL returns 201 or 403",
    async () => {
      const { status, body } = await request("POST", "/api/repos", {
        repoUrl: "https://github.com/expressjs/express",
        provider: "github",
      });
      const b = body as Record<string, unknown>;
      // Without a token verification is skipped, so we get 201
      // With a valid token we get 201 (or 409 if already registered)
      // With invalid token pointing to private repo we get 403
      const acceptableStatuses = [201, 403, 409];
      assert(
        acceptableStatuses.includes(status),
        `Expected 201/403/409, got ${status}: ${JSON.stringify(b)}`
      );
      assert("success" in b, "Expected success field in response");
    },
    false // never skip — acceptable statuses account for missing token
  );

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(
    `\n[test] Results: ${passed} passed, ${skipped} skipped, ${failed} failed`
  );

  teardown();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err: unknown) => {
  console.error("[test] Fatal error:", err);
  teardown();
  process.exit(1);
});

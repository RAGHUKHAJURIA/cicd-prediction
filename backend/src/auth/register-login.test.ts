import Module from "module";

// Intercept require for ESM-only or network-reliant packages to bypass Node 22 CommonJS and Redis resolution errors
const originalRequire = Module.prototype.require;
Module.prototype.require = function (this: any, id: string) {
  if (id === "@octokit/app") {
    return {
      App: class App {
        constructor() {}
        getInstallationOctokit() {
          return Promise.resolve({});
        }
        getSignedJsonWebToken() {
          return "mock-jwt";
        }
        octokit = {
          request: () => Promise.resolve({ data: { id: 1 } }),
        };
      },
    };
  }
  if (id === "@octokit/rest") {
    return {
      Octokit: class Octokit {
        constructor() {}
      },
    };
  }
  if (id === "ioredis") {
    class MockRedis {
      constructor() {}
      on() {
        return this;
      }
      status = "ready";
      connect() {
        return Promise.resolve();
      }
      quit() {
        return Promise.resolve();
      }
      incr() {
        return Promise.resolve(1);
      }
      expire() {
        return Promise.resolve(true);
      }
      ttl() {
        return Promise.resolve(60);
      }
      ping() {
        return Promise.resolve("PONG");
      }
    }
    const mock = MockRedis as any;
    mock.default = MockRedis;
    return mock;
  }
  return originalRequire.apply(this, arguments as any);
};

import "dotenv/config";
import assert from "assert";
import http from "http";
import { createApp } from "../app";
import { db, pool } from "../db/client";
import { sql } from "drizzle-orm";

function getSessionCookie(headers: Headers): string | null {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/cicd\.sid=([^;]+)/);
  return match ? match[0] : null;
}

async function runTests() {
  console.log("\nStarting Registration & Login Flow Test Suite...\n");

  // Clear existing test data
  await pool.query(
    "DELETE FROM users WHERE email IN ('flowtest@example.com', 'tempsessioncheck@example.com')"
  );
  await pool.query(
    "DELETE FROM session WHERE sess::json->>'email' IN ('flowtest@example.com', 'tempsessioncheck@example.com')"
  );

  const app = createApp();
  const server = http.createServer(app);

  // Bind to random port
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
      passed++;
    } catch (e: any) {
      console.error(`  FAIL  ${name}\n        ${e.message}\n        ${e.stack}`);
      failed++;
    }
  }

  const email = "flowtest@example.com";
  const password = "Password123!";
  const username = "flow_user";

  // TEST 1 — Register returns 201 but NO Set-Cookie header
  await test("TEST 1 — Register returns 201 but NO Set-Cookie header", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username }),
    });

    assert.strictEqual(res.status, 201);
    const cookie = getSessionCookie(res.headers);
    assert.ok(!cookie, "Set-Cookie header should not be present");

    const body = (await res.json()) as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.registered, true);
    assert.strictEqual(body.data.email, email);
    assert.strictEqual(body.data.userId, undefined);
    assert.strictEqual(body.data.role, undefined);
  });

  // TEST 2 — GET /auth/me after register returns 401
  await test("TEST 2 — GET /auth/me after register returns 401", async () => {
    // No session cookie sent
    const res = await fetch(`${baseUrl}/auth/me`);
    assert.strictEqual(res.status, 401);
  });

  // TEST 3 — Login after register works
  let loginCookie: string | null = null;
  await test("TEST 3 — Login after register works", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, email);

    loginCookie = getSessionCookie(res.headers);
    assert.ok(loginCookie, "Set-Cookie header should be present with cicd.sid");
  });

  // TEST 4 — GET /auth/me after login returns user
  await test("TEST 4 — GET /auth/me after login returns user", async () => {
    assert.ok(loginCookie);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: loginCookie },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, email);
  });

  // TEST 5 — Login with wrong password returns 401
  await test("TEST 5 — Login with wrong password returns 401", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong_password" }),
    });

    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error, "Invalid email or password");
    const cookie = getSessionCookie(res.headers);
    assert.ok(!cookie, "Set-Cookie header should not be present on login failure");
  });

  // TEST 6 — Login with wrong email returns 401
  await test("TEST 6 — Login with wrong email returns 401", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "wrongemail@example.com", password }),
    });

    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.error, "Invalid email or password");
    const cookie = getSessionCookie(res.headers);
    assert.ok(!cookie, "Set-Cookie header should not be present on login failure");
  });

  // TEST 7 — Protected route blocked after register (no login)
  await test("TEST 7 — Protected route blocked after register (no login)", async () => {
    const res = await fetch(`${baseUrl}/api/repos`);
    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.code, "UNAUTHORIZED");
  });

  // TEST 8 — Protected route accessible after login
  await test("TEST 8 — Protected route accessible after login", async () => {
    assert.ok(loginCookie);
    const res = await fetch(`${baseUrl}/api/repos`, {
      headers: { Cookie: loginCookie },
    });
    assert.strictEqual(res.status, 200);
  });

  // TEST 9 — Cannot register same email twice
  await test("TEST 9 — Cannot register same email twice", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, username: "another_user" }),
    });

    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    assert.ok(body.error.toLowerCase().includes("already registered"));
  });

  // TEST 10 — Session not created during registration
  await test("TEST 10 — Session not created during registration", async () => {
    const tempEmail = "tempsessioncheck@example.com";
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: tempEmail, password, username: "temp_user" }),
    });

    const result = await pool.query(
      `SELECT count(*)::integer as count FROM "session" WHERE sess::json->>'email' = $1`,
      [tempEmail]
    );
    const count = result.rows[0].count;
    assert.strictEqual(count, 0, "No session row should exist in the database for the registered email");
  });

  // Close server and pool
  server.close();
  await pool.end();

  console.log(`\nTests finished: ${passed} passed, ${failed} failed out of ${passed + failed} total.`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});

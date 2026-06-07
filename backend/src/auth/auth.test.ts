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
    // Return both default and named exports
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
import { users } from "../db/schema";
import { sql, eq } from "drizzle-orm";
import { encrypt, decrypt } from "../utils/encryption";

// Helper to extract session cookie from headers
function getSessionCookie(headers: Headers): string | null {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/cicd\.sid=([^;]+)/);
  return match ? match[0] : null;
}

// Helper to extract session ID from cookie signature
function getSessionId(headers: Headers): string | null {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return null;
  const match = setCookie.match(/cicd\.sid=s%3A([^.]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function runTests() {
  console.log("\nStarting Session Authentication Test Suite...\n");

  // Clear existing test data
  await db.execute(sql`DELETE FROM users WHERE email IN ('test@example.com', 'dummy@example.com')`);

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

  const testEmail = "test@example.com";
  const testPassword = "Password123!";
  const testUsername = "test_user";

  // Cache session cookie for subsequent tests
  let authedCookie: string | null = null;

  // TEST 1 — Register with valid data returns 201
  await test("TEST 1 — Register with valid data returns 201", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        username: testUsername,
      }),
    });

    assert.strictEqual(res.status, 201);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.registered, true);
    assert.strictEqual(body.data.email, testEmail);

    const cookie = getSessionCookie(res.headers);
    assert.ok(!cookie, "Set-Cookie header should not be present on registration");
  });

  // TEST 2 — Register with duplicate email returns 409
  await test("TEST 2 — Register with duplicate email returns 409", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        username: "another_user",
      }),
    });

    assert.strictEqual(res.status, 409);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.code, "DUPLICATE_EMAIL");
  });

  // TEST 3 — Register with weak password returns 400
  await test("TEST 3 — Register with weak password returns 400", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "weak@example.com",
        password: "abc",
        username: "weak_user",
      }),
    });

    assert.strictEqual(res.status, 400);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.code, "WEAK_PASSWORD");
  });

  // TEST 4 — Login with correct credentials returns 200 and sets cookie
  await test("TEST 4 — Login with correct credentials returns 200 and sets cookie", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, true);
    assert.ok(body.data.user.id);
    assert.strictEqual(body.data.user.email, testEmail);

    authedCookie = getSessionCookie(res.headers);
    assert.ok(authedCookie);
  });

  // TEST 5 — Login with wrong password returns 401
  await test("TEST 5 — Login with wrong password returns 401", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "WrongPassword123",
      }),
    });

    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, "Invalid email or password");
    assert.strictEqual(body.code, "INVALID_CREDENTIALS");
  });

  // TEST 6 — Login with wrong email returns 401
  await test("TEST 6 — Login with wrong email returns 401", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent@example.com",
        password: testPassword,
      }),
    });

    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, "Invalid email or password");
    assert.strictEqual(body.code, "INVALID_CREDENTIALS");
  });

  // TEST 7 — GET /auth/me without cookie returns 401
  await test("TEST 7 — GET /auth/me without cookie returns 401", async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    assert.strictEqual(res.status, 401);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.code, "UNAUTHORIZED");
  });

  // TEST 8 — GET /auth/me with valid session returns user
  await test("TEST 8 — GET /auth/me with valid session returns user", async () => {
    assert.ok(authedCookie, "Skipped: no authed cookie from previous test");
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: authedCookie },
    });

    assert.strictEqual(res.status, 200);
    const body = (await res.json()) as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, testEmail);
    assert.strictEqual(body.data.user.password, undefined);
  });

  // TEST 9 — Logout destroys session
  await test("TEST 9 — Logout destroys session", async () => {
    assert.ok(authedCookie, "Skipped: no authed cookie");
    const resLogout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Cookie: authedCookie },
    });

    assert.strictEqual(resLogout.status, 200);

    const resMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: authedCookie },
    });
    assert.strictEqual(resMe.status, 401);
  });

  // TEST 10 — Protected route blocked without auth
  await test("TEST 10 — Protected route blocked without auth", async () => {
    const res = await fetch(`${baseUrl}/api/repos`);
    assert.strictEqual(res.status, 401);
  });

  // TEST 11 — Protected route accessible with auth
  await test("TEST 11 — Protected route accessible with auth", async () => {
    // Login again to get new cookie
    const resLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const cookie = getSessionCookie(resLogin.headers);
    assert.ok(cookie);

    const resRepos = await fetch(`${baseUrl}/api/repos`, {
      headers: { Cookie: cookie },
    });
    assert.strictEqual(resRepos.status, 200);
  });

  // TEST 12 — Password hash is never exposed
  await test("TEST 12 — Password hash is never exposed", async () => {
    const [user] = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.email, testEmail))
      .limit(1);

    assert.ok(user);
    assert.ok(user.password);
    assert.ok(user.password.startsWith("$2a$12$") || user.password.startsWith("$2b$12$"));
    assert.notStrictEqual(user.password, testPassword);
  });

  // TEST 13 — Session regenerated on login (session fixation prevention)
  await test("TEST 13 — Session regenerated on login (session fixation prevention)", async () => {
    const dummyEmail = "dummy@example.com";
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: dummyEmail,
        password: testPassword,
        username: "dummy",
      }),
    });

    // 1. Log in as test user to get a valid session cookie
    const resLogin1 = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    const firstCookie = getSessionCookie(resLogin1.headers);
    const firstSessionId = getSessionId(resLogin1.headers);
    assert.ok(firstSessionId);
    assert.ok(firstCookie);

    // 2. Perform login for dummy user while sending the first session cookie
    const resLogin2 = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": firstCookie,
      },
      body: JSON.stringify({
        email: dummyEmail,
        password: testPassword,
      }),
    });
    const secondSessionId = getSessionId(resLogin2.headers);
    assert.ok(secondSessionId);

    assert.notStrictEqual(firstSessionId, secondSessionId);
  });

  // TEST 14 — Encryption/decryption round trip
  await test("TEST 14 — Encryption/decryption round trip", async () => {
    const plaintext = "my-secret-token";
    const encrypted = encrypt(plaintext);
    assert.ok(encrypted);
    assert.notStrictEqual(encrypted, plaintext);

    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, plaintext);
  });

  // TEST 15 — Decryption fails on tampered ciphertext
  await test("TEST 15 — Decryption fails on tampered ciphertext", async () => {
    const plaintext = "my-secret-token";
    const encrypted = encrypt(plaintext);
    const parts = encrypted.split(":");
    
    // Tamper with the ciphertext section
    const tamperedCiphertext = parts[2]!.substring(0, parts[2]!.length - 4) + "0000";
    const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

    assert.throws(
      () => decrypt(tampered),
      /Decryption failed/
    );
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

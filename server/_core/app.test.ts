import { COOKIE_NAME } from "@shared/const";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { SignJWT } from "jose";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import superjson from "superjson";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The real middleware chain (headers, request ids, the API ceiling, scheduled jobs, tRPC, error handling) over real HTTP, with no database: a
// call that needs the database fails inside, which is what lets the failure path be observed.
const SECRET = "app-test-secret-0123456789abcdef";
const SECRETS = { message: "Sup3rS3cretPassw0rd", email: "someone.private@example.test", sql: "INSERT INTO users VALUES" };

type Built = { base: string; close: () => Promise<void>; clock: { value: number }; logs: string[]; restore: () => void };
const built: Built[] = [];

async function start(options: { production?: boolean; perMinute?: number } = {}): Promise<Built> {
  vi.resetModules();
  vi.stubEnv("JWT_SECRET", SECRET);
  vi.stubEnv("CRON_SECRET", "cron-secret-for-tests-0123456789");
  const { createApp } = await import("./app");
  const { captureLogs } = await import("./logger");
  const logs: string[] = [];
  const restore = captureLogs(line => logs.push(line));
  const clock = { value: Date.now() };
  const { app, finish } = createApp({
    production: options.production ?? true,
    apiRequestsPerMinute: options.perMinute ?? 1000,
    now: () => clock.value,
    registerAuth: () => undefined,
    extraRoutes: target => {
      target.get("/boom", () => { throw Object.assign(new Error(`Duplicate entry '${SECRETS.email}' ${SECRETS.sql} ${SECRETS.message}`), { code: "23505" }); });
      target.get("/api/boom", () => { throw new Error(`${SECRETS.message} ${SECRETS.email}`); });
      target.post("/api/echo", (req, res) => { res.json({ ok: true, got: req.body }); });
    },
  });
  finish(app);
  const server: Server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const item: Built = { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise(resolve => server.close(() => resolve(undefined))), clock, logs, restore };
  built.push(item);
  return item;
}

afterEach(async () => { for (const item of built.splice(0)) { item.restore(); await item.close(); } vi.unstubAllEnvs(); });
beforeAll(() => undefined);
afterAll(() => undefined);

const leaks = (text: string) => Object.entries(SECRETS).filter(([, value]) => text.includes(value)).map(([name]) => name);

describe("security headers", () => {
  const HEADERS = ["x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy"] as const;

  it("puts the full set on every kind of response in production: page probe, API, unknown address and the error page", async () => {
    const { base } = await start();
    for (const [path, accept] of [["/healthz", "*/*"], ["/api/trpc/auth.me", "application/json"], ["/api/nothing", "application/json"], ["/boom", "text/html"]] as const) {
      const response = await fetch(base + path, { headers: { accept } });
      expect(response.headers.get("x-frame-options"), path).toBe("DENY");
      expect(response.headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(response.headers.get("strict-transport-security"), path).toBe("max-age=31536000; includeSubDomains");
      expect(response.headers.get("referrer-policy"), path).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("permissions-policy"), path).toContain("camera=()");
      expect(response.headers.get("cross-origin-opener-policy"), path).toBe("same-origin");
      expect(response.headers.get("x-powered-by"), path).toBeNull();
      const csp = response.headers.get("content-security-policy")!;
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("base-uri 'self'");
      expect(csp, path).toContain("form-action 'self'");
      expect(csp, path).toContain("default-src 'self'");
    }
  });

  it("lets no script run but its own, and only compile WebAssembly: no 'unsafe-inline' or 'unsafe-eval' and no remote host", async () => {
    const { base } = await start();
    const csp = (await fetch(base + "/healthz")).headers.get("content-security-policy")!;
    const script = csp.split("; ").find(part => part.startsWith("script-src "))!;
    expect(script).toBe("script-src 'self' 'wasm-unsafe-eval'");
    expect(script.split(" ")).not.toContain("'unsafe-eval'");
    expect(script.split(" ")).not.toContain("'unsafe-inline'");
    expect(csp.split("; ").find(part => part.startsWith("connect-src "))).toBe("connect-src 'self' https://*.supabase.co");
  });

  it("outside production sends the always-on headers but neither CSP nor HSTS (the development server needs inline scripts)", async () => {
    const { base } = await start({ production: false });
    const response = await fetch(base + "/healthz");
    for (const name of HEADERS) expect(response.headers.get(name), name).toBeTruthy();
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });

  it("marks every API answer no-store, and stamps each response with its own request id", async () => {
    const { base } = await start();
    const a = await fetch(base + "/api/trpc/auth.me"); const b = await fetch(base + "/api/trpc/auth.me");
    expect(a.headers.get("cache-control")).toContain("no-store");
    expect(a.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.headers.get("x-request-id")).not.toBe(b.headers.get("x-request-id"));
  });
});

describe("the API ceiling", () => {
  const hit = (base: string, path = "/api/echo", ip = "198.51.100.1") => fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: "{}" });

  it("lets a source address send its quota and refuses the next call with 429 and a Retry-After", async () => {
    const { base } = await start({ perMinute: 5 });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await hit(base)).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429]);
    const refused = await hit(base);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect(Number(refused.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    expect(await refused.json()).toEqual({ code: "PROJECT_OS_RATE_LIMITED" });
  });

  it("counts each source address on its own", async () => {
    const { base } = await start({ perMinute: 3 });
    for (let i = 0; i < 3; i++) await hit(base, "/api/echo", "198.51.100.1");
    expect((await hit(base, "/api/echo", "198.51.100.1")).status).toBe(429);
    expect((await hit(base, "/api/echo", "198.51.100.2")).status).toBe(200);
  });

  it("opens again when the minute is over", async () => {
    const { base, clock } = await start({ perMinute: 2 });
    await hit(base); await hit(base);
    expect((await hit(base)).status).toBe(429);
    clock.value += 60_001;
    expect((await hit(base)).status).toBe(200);
  });

  it("does not count the liveness probe or pages, only /api", async () => {
    const { base } = await start({ perMinute: 2 });
    for (let i = 0; i < 6; i++) expect((await fetch(base + "/healthz")).status).toBe(200);
    expect((await hit(base)).status).toBe(200);
  });

  it("gives the scheduled endpoints a small ceiling of their own, so the cron secret cannot be guessed at speed (and the general quota is untouched)", async () => {
    const { base } = await start({ perMinute: 1000 });
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await fetch(base + "/api/scheduled/emailNotifications", { method: "POST", headers: { authorization: "Bearer wrong-secret-0123456789" } })).status);
    expect(statuses.slice(0, 20).every(s => s === 403)).toBe(true); // refused for the secret, not for the rate
    expect(statuses.slice(20)).toEqual([429, 429]);
    expect((await hit(base)).status).toBe(200);
  });

  it("answers a refused tRPC call in the shape the tRPC client understands, so the page can show its Arabic message", async () => {
    const { base } = await start({ perMinute: 1 });
    const client = createTRPCClient<import("../routers").AppRouter>({ links: [httpBatchLink({ url: `${base}/api/trpc`, transformer: superjson, headers: { "x-forwarded-for": "198.51.100.9" } })] });
    await client.auth.me.query(); // the one allowed call
    const error = await client.auth.me.query().then(() => null, e => e);
    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<never>).data).toMatchObject({ code: "TOO_MANY_REQUESTS", httpStatus: 429 });
    expect((error as { data: { projectError: { code: string; messages: { ar: string } } } }).data.projectError).toMatchObject({ code: "PROJECT_OS_RATE_LIMITED" });
    expect((error as { data: { projectError: { messages: { ar: string } } } }).data.projectError.messages.ar).toContain("انتظر");
  });

  it("answers a refused BATCH with one error per call", async () => {
    const { base } = await start({ perMinute: 1 });
    const headers = { "x-forwarded-for": "198.51.100.10" };
    await fetch(`${base}/api/trpc/auth.me`, { headers });
    const response = await fetch(`${base}/api/trpc/auth.me,auth.me?batch=1&input=${encodeURIComponent("{}")}`, { headers });
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body[0].error.json.data.projectError.code).toBe("PROJECT_OS_RATE_LIMITED");
  });
});

describe("failures", () => {
  it("shows a navigation an Arabic page with the request id, and never the message, the stack or the data of the failure", async () => {
    const { base, logs } = await start();
    const response = await fetch(base + "/boom", { headers: { accept: "text/html" } });
    const html = await response.text();
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain('lang="ar"');
    expect(html).toContain("حدث خطأ في الخادم");
    expect(html).toContain("A server error occurred");
    expect(html).toContain(response.headers.get("x-request-id")!);
    expect(html).not.toMatch(/<script/i);
    expect(leaks(html)).toEqual([]);
    expect(html).not.toMatch(/\bat .*\.(ts|js):\d+/); // no stack frame
    expect(logs).toHaveLength(1);
    expect(leaks(logs[0])).toEqual([]);
    expect(JSON.parse(logs[0])).toMatchObject({ level: "error", event: "http.unhandled_error", status: 500, path: "/boom", errorCode: "23505", requestId: response.headers.get("x-request-id") });
  });

  it("answers an API failure with a JSON code and the request id, not a page", async () => {
    const { base, logs } = await start();
    const response = await fetch(base + "/api/boom");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "PROJECT_OS_SERVER_ERROR", requestId: response.headers.get("x-request-id") });
    expect(leaks(logs.join("\n"))).toEqual([]);
  });

  it("answers a malformed JSON body with a 400 and logs nothing at error level (the caller's mistake, not ours)", async () => {
    const { base, logs } = await start();
    const response = await fetch(base + "/api/echo", { method: "POST", headers: { "content-type": "application/json" }, body: `{"email": "${SECRETS.email}", ` });
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("PROJECT_OS_REQUEST_FAILED");
    expect(logs).toEqual([]);
  });

  it("answers an unknown address under /api with a JSON 404 instead of the site's page", async () => {
    const { base } = await start();
    const response = await fetch(base + "/api/does-not-exist", { headers: { accept: "text/html" } });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "PROJECT_OS_NOT_FOUND" });
  });

  it("logs an unexpected failure inside a tRPC procedure (before: nothing), by name and place only, and tells the client 'server error', not 'check your data'", async () => {
    const { base, logs } = await start();
    // a correctly signed cookie for a session that cannot be looked up (no database here): logging out has to reach the database and fails inside
    const token = await new SignJWT({ openId: "email:abc", appId: "project-os", name: "x", sid: "sid-1" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
    const response = await fetch(`${base}/api/trpc/auth.logout`, { method: "POST", headers: { cookie: `${COOKIE_NAME}=${token}`, "content-type": "application/json" } });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.json.data.projectError.code).toBe("PROJECT_OS_SERVER_ERROR");
    expect(body.error.json.data.stack).toBeUndefined();
    const line = logs.find(entry => entry.includes("trpc.internal_error"));
    expect(line).toBeTruthy();
    expect(JSON.parse(line!)).toMatchObject({ event: "trpc.internal_error", path: "auth.logout", type: "mutation", errorName: "Error" });
    expect(line).not.toContain(token);
    expect(line).not.toContain("cookie");
    expect(line).not.toContain("Database connection");
  });
});

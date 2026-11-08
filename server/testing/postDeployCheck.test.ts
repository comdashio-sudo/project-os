import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// D-69: scripts/ci/post-deploy-check.mjs against a fabricated local server. --without-sign-in replaces the wrong-code check with the
// public tRPC procedure system.health; without the flag a 5xx on the code check still fails the release (the default is unchanged).
const script = path.resolve(import.meta.dirname, "../../scripts/ci/post-deploy-check.mjs");

type Behaviour = { healthz?: number; health?: { status: number; body: unknown }; verify?: { status: number; body: unknown } };
let server: Server | null = null;
const seen: string[] = [];

async function start(behaviour: Behaviour): Promise<string> {
  seen.length = 0;
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    seen.push(`${req.method} ${url.pathname}`);
    const send = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname === "/healthz") return send(behaviour.healthz ?? 200, { ok: true });
    if (url.pathname === "/api/trpc/system.health") {
      const input = JSON.parse(url.searchParams.get("input") ?? "null") as { json?: { timestamp?: unknown } } | null;
      if (typeof input?.json?.timestamp !== "number") return send(400, { error: "bad input" });
      return send(behaviour.health?.status ?? 200, behaviour.health?.body ?? { result: { data: { json: { ok: true } } } });
    }
    if (url.pathname === "/api/auth/email/verify") return send(behaviour.verify?.status ?? 400, behaviour.verify?.body ?? { code: "PROJECT_OS_AUTH_CODE_INVALID" });
    if (url.pathname === "/api/readyz") return send(200, { pendingMigrations: [] });
    return send(404, {});
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function run(args: string[]): Promise<{ status: number | null; out: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script, ...args], { env: { ...process.env, BYPASS_SECRET: "" } });
    let out = "";
    child.stdout.on("data", chunk => { out += chunk; });
    child.stderr.on("data", chunk => { out += chunk; });
    child.on("close", status => resolve({ status, out }));
  });
}

afterEach(async () => { if (server) await new Promise(resolve => server!.close(resolve)); server = null; });

describe("post-deploy-check --without-sign-in (D-69)", () => {
  it("passes when /healthz is 200 and system.health answers ok=true, and never calls the sign-in check", async () => {
    const base = await start({});
    const result = await run([base, "--without-sign-in"]);
    expect(result.status).toBe(0);
    expect(result.out).toMatch(/system\.health .*: 200 ok=true/);
    expect(seen).not.toContain("POST /api/auth/email/verify");
    expect(seen).toContain("GET /api/trpc/system.health");
  });

  it("fails when /healthz is not 200", async () => {
    const base = await start({ healthz: 500 });
    const result = await run([base, "--without-sign-in"]);
    expect(result.status).toBe(1);
    expect(result.out).toMatch(/\/healthz answered 500/);
  });

  it("fails when system.health has no ok=true, or is not 200", async () => {
    let base = await start({ health: { status: 200, body: { result: { data: { json: { ok: false } } } } } });
    expect((await run([base, "--without-sign-in"])).status).toBe(1);
    await new Promise(resolve => server!.close(resolve));
    base = await start({ health: { status: 503, body: { error: "down" } } });
    const result = await run([base, "--without-sign-in"]);
    expect(result.status).toBe(1);
    expect(result.out).toMatch(/system\.health answered 503/);
  });

  it("an unknown option is refused (exit 2)", async () => {
    const base = await start({});
    expect((await run([base, "--without-signin"])).status).toBe(2);
  });
});

describe("post-deploy-check default mode is unchanged", () => {
  it("a 503 on the sign-in code check still fails (it is what a release without a key answers: MAIL_UNAVAILABLE)", async () => {
    const base = await start({ verify: { status: 503, body: { code: "PROJECT_OS_MAIL_UNAVAILABLE" } } });
    const result = await run([base]);
    expect(result.status).toBe(1);
    expect(result.out).toMatch(/answered 503 \(a server error\)/);
    expect(seen).not.toContain("GET /api/trpc/system.health");
  });

  it("an application 4xx on a wrong code passes", async () => {
    const base = await start({});
    expect((await run([base])).status).toBe(0);
  });
});

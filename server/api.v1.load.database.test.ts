import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createApp } from "./_core/app";
import { appRouter } from "./routers";

// Work order 14, item 3: a measured load on /api/v1 — a thousand requests from one company key, a mix of reads and idempotent writes, on a real database with the
// application running as its restricted role. It SKIPS unless LOAD_API_V1=1 (it is a measurement, not a gate: the numbers vary by machine). The log it writes
// (docs/verification/API_V1_LOAD.json) carries the time of every endpoint and every error; the assertions only say "nothing failed and nothing was throttled".
process.env.INTEGRATION_SECRET_KEY = "test-only-integration-secret-0123456789"; // secret-scan:allow a test-only value, never a real key
const enabled = process.env.LOAD_API_V1 === "1";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const TOTAL = Number(process.env.LOAD_API_V1_REQUESTS ?? 1000);
const CONCURRENCY = Number(process.env.LOAD_API_V1_CONCURRENCY ?? 25);
const SLUG = "load-v1";
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@load.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);

let connection: fixtureDb.Connection; let api: Server; let base = ""; let key = ""; let tenantId = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["integration_sync_items", "integration_inbound_records", "integration_sync_runs", "integration_mappings", "api_rate_windows", "api_keys", "suppliers", "budget_lines", "wbs_items", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId = 'load-owner'");
}

const quantile = (sorted: number[], q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;

describe.skipIf(!enabled || !isUrl(process.env.TEST_DATABASE_URL))("a thousand requests to /api/v1 from one company key", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('load-owner', 'Load owner', 'load-owner@load.example.test', 'user')");
    const [[row]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'load-owner'");
    const owner = callerFor(row.id, "load-owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Load Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PRJ-1', 'Villas', 'villas', 'SAR', 'active')", ["f9000000-0000-4000-8000-000000000001", tenantId]);
    const { app, finish } = createApp({ production: false, apiRequestsPerMinute: 1_000_000, registerAuth: () => undefined });
    finish(app);
    api = await new Promise<Server>(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    key = (await owner.integrations.createKey({ tenantId, name: "Load", scopes: ["erp.write", "export.read", "sync.read"], rateLimitPerMinute: 6000 })).key;
  }, 120_000);
  afterAll(async () => { await new Promise(resolve => api.close(resolve)); await clear(); await connection.end(); });

  it("answers every request, throttles none, and the log shows the time per endpoint and every error", async () => {
    const plan = (index: number) => {
      const slot = index % 20;
      if (slot < 8) return { name: "GET /ping", method: "GET", path: "/ping" } as const;
      if (slot < 13) return { name: "GET /export/budgets", method: "GET", path: "/export/budgets?limit=50" } as const;
      if (slot < 18) return { name: "POST /erp/suppliers", method: "POST", path: "/erp/suppliers", body: { system: "loadtest", records: [{ externalId: `L-${index}`, code: `LOAD-${index}`, legalName: `Load supplier ${index}` }] } } as const;
      return { name: "GET /sync/runs", method: "GET", path: "/sync/runs" } as const;
    };
    const samples: Array<{ name: string; ms: number; status: number }> = []; const errors: Array<{ name: string; index: number; error: string }> = [];
    let next = 0;
    const started = performance.now();
    const worker = async () => {
      for (;;) {
        const index = next; next += 1;
        if (index >= TOTAL) return;
        const step = plan(index);
        const t0 = performance.now();
        try {
          const response = await fetch(`${base}/api/v1${step.path}`, { method: step.method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: "body" in step ? JSON.stringify(step.body) : undefined });
          await response.arrayBuffer();
          samples.push({ name: step.name, ms: performance.now() - t0, status: response.status });
        } catch (error) { errors.push({ name: step.name, index, error: error instanceof Error ? error.message : String(error) }); }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const seconds = (performance.now() - started) / 1000;
    const all = samples.map(sample => sample.ms).sort((a, b) => a - b);
    const byEndpoint = Object.fromEntries(Array.from(new Set(samples.map(sample => sample.name))).map(name => {
      const rows = samples.filter(sample => sample.name === name); const ms = rows.map(row => row.ms).sort((a, b) => a - b);
      return [name, { requests: rows.length, p50: +quantile(ms, 0.5).toFixed(1), p95: +quantile(ms, 0.95).toFixed(1), p99: +quantile(ms, 0.99).toFixed(1), max: +ms[ms.length - 1].toFixed(1), statuses: rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {}) }];
    }));
    const statuses = samples.reduce<Record<string, number>>((acc, sample) => ({ ...acc, [sample.status]: (acc[sample.status] ?? 0) + 1 }), {});
    const [[written]] = await connection.query<{ n: string }[]>("SELECT COUNT(*) n FROM suppliers WHERE tenantId = ? AND code LIKE 'LOAD-%'", [tenantId]);
    const report = {
      what: "1000 requests to /api/v1 from one company key (reads and idempotent writes), one Node process, one local PostgreSQL, application role restricted by row-level security",
      when: new Date().toISOString(), requests: TOTAL, concurrency: CONCURRENCY, seconds: +seconds.toFixed(2), requestsPerSecond: +(TOTAL / seconds).toFixed(1),
      overallMs: { p50: +quantile(all, 0.5).toFixed(1), p95: +quantile(all, 0.95).toFixed(1), p99: +quantile(all, 0.99).toFixed(1), max: +all[all.length - 1].toFixed(1) },
      statuses, networkErrors: errors.length, errors: errors.slice(0, 20), byEndpoint, suppliersWritten: Number(written.n),
      machine: { cpus: (await import("node:os")).cpus().length, node: process.version }, fingerprint: createHash("sha256").update(JSON.stringify(statuses)).digest("hex").slice(0, 12),
    };
    mkdirSync("docs/verification", { recursive: true });
    writeFileSync("docs/verification/API_V1_LOAD.json", JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
    expect(errors, "network errors").toEqual([]);
    expect(Object.keys(statuses).filter(status => !status.startsWith("2")), `statuses ${JSON.stringify(statuses)}`).toEqual([]);
    expect(Number(written.n)).toBe(Math.round(TOTAL * 5 / 20));
    expect(report.overallMs.p95).toBeLessThan(2000);
  }, 300_000);
});

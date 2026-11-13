import pg from "pg";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { getDb, runWithDbContext } from "./_core/database";
import { loadProfitabilityRows, loadProfitabilityRowsByProject } from "./profitability";
import { loadPmcDataset, loadPmcDatasets } from "./pmcScreensService";

// D-23 (delivery 3.5): how many statements the company level runs for 10 and for 50 projects, counted at the pg client (every statement the
// application sends, its row-level-security context included). Part 2: the profitability and PMC inputs are read once for all projects, so the
// count no longer grows with the number of projects, and the batched read gives each project exactly its own rows. Synthetic data only.
const SLUG = "d23-count";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection; let tenantId = ""; let ownerId = 0;
const caller = () => appRouter.createCaller({ user: { id: ownerId, openId: "d23-owner", name: "D23", email: "d23-owner@d23.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId = 'd23-owner'");
}
async function projectsUpTo(n: number) {
  const [[{ count }]] = await connection.query<{ count: number }[]>("SELECT count(*)::int AS count FROM projects WHERE tenantId = ?", [tenantId]);
  for (let i = count; i < n; i++) await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (gen_random_uuid(), ?, ?, ?, 'villas', 'SAR', 'active')", [tenantId, `D23-${i + 1}`, `Count project ${i + 1}`]);
}
async function statementsFor(run: () => Promise<unknown>) {
  const original = pg.Client.prototype.query; let count = 0;
  pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) { count += 1; return (original as (...a: unknown[]) => unknown).apply(this, args); } as typeof original;
  try { await run(); } finally { pg.Client.prototype.query = original; }
  return count;
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("D-23: the company level's statements for 10 and 50 projects", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('d23-owner', 'D23', 'd23-owner@d23.example.test', 'user')");
    const [[user]] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'd23-owner'");
    ownerId = user.id;
    ({ tenantId } = await caller().tenant.create({ legalName: "D23 Count Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("counts them (the numbers go to docs/STATE.md), and the level answers every project", async () => {
    await projectsUpTo(10);
    await caller().scopes.company({ tenantId }); // warm: the first call also writes the role templates
    const ten = await statementsFor(() => caller().scopes.company({ tenantId }));
    await projectsUpTo(50);
    await caller().scopes.company({ tenantId }); // warm the same way: a project's first visit writes its own defaults once
    let projects = 0;
    const fifty = await statementsFor(async () => { projects = (await caller().scopes.company({ tenantId })).projects.length; });
    console.log(`D-23 statements: 10 projects → ${ten}, 50 projects → ${fifty}`);
    expect(projects).toBe(50);
    expect(ten).toBeGreaterThan(0);
    // part 2: five times the projects, not one statement more (before: 846 → 4038)
    expect(fifty).toBeLessThanOrEqual(ten);
  });

  it("the batched reads give each project exactly what its own read gives, and never another project's rows", async () => {
    await projectsUpTo(2);
    const [[p1], [p2]] = [(await connection.query<{ id: string }[]>("SELECT id FROM projects WHERE tenantId = ? AND code = 'D23-1'", [tenantId]))[0], (await connection.query<{ id: string }[]>("SELECT id FROM projects WHERE tenantId = ? AND code = 'D23-2'", [tenantId]))[0]];
    await connection.query("DELETE FROM wbs_items WHERE tenantId = ?", [tenantId]);
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (gen_random_uuid(), ?, ?, 'A-1', 'Walls of one', 1000), (gen_random_uuid(), ?, ?, 'B-1', 'Roof of two', 2000), (gen_random_uuid(), ?, ?, 'B-2', 'Roads of two', 3000)", [tenantId, p1.id, tenantId, p2.id, tenantId, p2.id]);
    const db = (await getDb())!;
    const now = new Date("2026-11-13T00:00:00Z");
    await runWithDbContext({ userId: ownerId, tenantIds: [tenantId], system: false }, async () => {
      const batch = await loadProfitabilityRowsByProject(db, tenantId, [p1.id, p2.id]);
      expect(batch.get(p1.id)!.wbsRows.map(row => row.code)).toEqual(["A-1"]);
      expect(batch.get(p2.id)!.wbsRows.map(row => row.code).sort()).toEqual(["B-1", "B-2"]);
      // NEGATIVE: no row carries the grouping key out, and project one never sees project two's rows
      expect(Object.keys(batch.get(p1.id)!.wbsRows[0])).not.toContain("projectId");
      expect(batch.get(p1.id)!.wbsRows.some(row => row.code.startsWith("B-"))).toBe(false);
      for (const id of [p1.id, p2.id]) {
        const single = await loadProfitabilityRows(db, { tenantId, projectId: id });
        expect({ ...batch.get(id)!, wbsRows: [...batch.get(id)!.wbsRows].sort((a, b) => a.code.localeCompare(b.code)) }).toEqual({ ...single, wbsRows: [...single.wbsRows].sort((a, b) => a.code.localeCompare(b.code)) });
        expect((await loadPmcDatasets(db, tenantId, [p1.id, p2.id], now)).get(id)).toEqual(await loadPmcDataset(db, { userId: ownerId, tenantId, projectId: id }, now));
      }
      // NEGATIVE: a project of no one (or of another tenant) comes back empty, never with this tenant's rows
      const stranger = "00000000-0000-4000-8000-000000000023";
      expect((await loadProfitabilityRowsByProject(db, tenantId, [stranger])).get(stranger)).toMatchObject({ project: null, wbsRows: [], costRows: [] });
    });
  });
});

import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { appRouter } from "./routers";

// D-6 on a real database, through the real router, as the restricted application role: the three percentages per project for the company and portfolio levels.
// A company-wide PMC reader sees both projects with their numbers; a reader of one project sees that project only (the other is not named); another company's
// member gets nothing here. Synthetic data only.
const T = "50000000-0000-4000-8000-0000000006a1";
const T_OTHER = "50000000-0000-4000-8000-0000000006b1";
const P1 = "50000000-0000-4000-8000-0000000006a2";
const P2 = "50000000-0000-4000-8000-0000000006a3";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const names = ["manager", "scoped", "other"] as const;
const users = {} as Record<(typeof names)[number], number>;
let connection: fixtureDb.Connection;
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const sheet = async (headers: string[], rows: unknown[][]) => (await buildSpreadsheet({ sheetName: "data", headers, rows, format: "xlsx" })).toString("base64");
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");

async function clear() {
  const t = [T, T_OTHER];
  for (const table of ["audit_logs", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId LIKE 'd6-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("D-6: the three percentages per project, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${names.map(n => `('d6-${n}','${n}','d6-${n}@pmc.example.test','user')`).join(",")}`);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'd6-%'");
    for (const name of names) users[name] = rows.find(row => row.openId === `d6-${name}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'D6 Tenant', 'd6-a'), (?, 'D6 Other', 'd6-b')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'D6-1', 'First', 'villas', 'SAR', 'active'), (?, ?, 'D6-2', 'Second', 'villas', 'SAR', 'active')", [P1, T, P2, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('d6-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('d6-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('d6-ent-a', ?, 'd6-sub-a', 'PROJECT', true, NOW()), ('d6-ent-b', ?, 'd6-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    for (const [pid, c] of [["d6-perm-read", "project.pmc.read"], ["d6-perm-update", "project.pmc.update"], ["d6-perm-manage", "project.pmc.manage"]]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (?, ?, ?, 'PROJECT')", [pid, c, c]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('project.pmc.read','project.pmc.update','project.pmc.manage')");
    const perm = (c: string) => permissions.find(p => p.code === c)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('d6-role-m', ?, 'D6_M','Manager','PROJECT'), ('d6-role-r', ?, 'D6_R','Reader','PROJECT'), ('d6-role-o', ?, 'D6_M','Manager','PROJECT')", [T, T, T_OTHER]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('d6-role-m', ?),('d6-role-m', ?),('d6-role-m', ?),('d6-role-r', ?),('d6-role-o', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read"), perm("project.pmc.read")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('d6-m-m', ?, ?, 'active'), ('d6-m-s', ?, ?, 'active'), ('d6-m-o', ?, ?, 'active')", [T, users.manager, T, users.scoped, T_OTHER, users.other]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES ('d6-mr-m','d6-m-m','d6-role-m','company',NULL), ('d6-mr-s','d6-m-s','d6-role-r','project',?), ('d6-mr-o','d6-m-o','d6-role-o','company',NULL)", [P1]);
    const manager = callerFor(users.manager, "d6-manager");
    for (const projectId of [P1, P2]) {
      const scope = { tenantId: T, projectId };
      for (const [kind, base64] of [["locations", await sheet(["Zone", "Block", "Unit", "Model"], [["Z1", "B1", 1, "A"], ["Z1", "B1", 2, "A"]])], ["catalog", await sheet(["Model", "Group", "Stage", "Activity", "Activity name", "Weight"], [["A", "G1", "S1", "FOOT", "Footings", 40], ["A", "G2", "S2", "PAINT", "Paint", 60]])]] as const) {
        const report = await manager.pmc.analyzeImport({ ...scope, kind, format: "xlsx", base64 }); expect(report.errorCount).toBe(0);
        await manager.pmc.confirmImport({ ...scope, kind, format: "xlsx", base64, approvedHash: report.fileHash });
      }
    }
    // P1: one villa of two has its 40% footings complete (monthly 20%); P2: nothing done
    await manager.pmc.updateProgress({ tenantId: T, projectId: P1, activityCode: "FOOT", villas: ["1"], status: "COMPLETE", date: new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) });
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("a company-wide PMC reader gets both projects, each with its three percentages and the differences", async () => {
    const rows = await callerFor(users.manager, "d6-manager").pmcSite.percentagesByProject({ tenantId: T });
    expect(rows.map(row => row.code)).toEqual(["D6-1", "D6-2"]);
    expect(rows[0].units).toBe(2);
    expect(rows[0].monthly).toBeCloseTo(0.2, 5);
    expect(rows[0].siteMinusMonthly).toBeCloseTo(rows[0].site - 0.2, 5);
    expect(rows[1].monthly).toBe(0);
  });

  it("a reader of one project gets that project only; the other is not named", async () => {
    const rows = await callerFor(users.scoped, "d6-scoped").pmcSite.percentagesByProject({ tenantId: T });
    expect(rows.map(row => row.projectId)).toEqual([P1]);
  });

  it("two companies: another company's member gets nothing here", async () => {
    expect(await code(callerFor(users.other, "d6-other").pmcSite.percentagesByProject({ tenantId: T }))).not.toBe("no error");
    expect(await callerFor(users.other, "d6-other").pmcSite.percentagesByProject({ tenantId: T_OTHER })).toEqual([]);
  });
});

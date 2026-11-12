import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { withSystemContext } from "./_core/database";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { computeStalledUnits } from "./stalledUnits";
import { enqueueStalledUnitDigests, STALLED_NOTICE_CODE } from "./stalledUnitsDigest";

// Q-14 (b) on a real database, as the restricted application role under the scheduler's system context: the 7:00 digest reaches the planner and the site
// engineer of the project (one notice and one mail each, the newly stalled villa apart from the continuing one), never twice the same day, never before
// the mailing hour, nothing for a project with nothing stalled, and nothing across companies or to a member of another project. Synthetic data only.
const T = "50000000-0000-4000-8000-0000000014c1";
const T_OTHER = "50000000-0000-4000-8000-0000000014d1";
const P = "50000000-0000-4000-8000-0000000014c2";
const P_SIDE = "50000000-0000-4000-8000-0000000014c3";
const P_OTHER = "50000000-0000-4000-8000-0000000014d2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const names = ["planner", "site", "optout", "side", "other"] as const;
const users = {} as Record<(typeof names)[number], number>;
let connection: fixtureDb.Connection;
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pmc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const sheet = async (headers: string[], rows: unknown[][]) => (await buildSpreadsheet({ sheetName: "data", headers, rows, format: "xlsx" })).toString("base64");
const NOW = new Date(`${new Date().toISOString().slice(0, 10)}T05:00:00.000Z`); // 08:00 in Riyadh: the mailing hour has come
const run = async (now: Date) => withSystemContext("test: the 7:00 stalled-units digest", async () => enqueueStalledUnitDigests((await getDb())!, now, { mail: true }));

async function clear() {
  const t = [T, T_OTHER];
  for (const table of ["email_outbox", "email_notification_preferences", "internal_notifications", "audit_logs", "project_stall_settings", "pmc_qc_receipt_events", "pmc_qc_receipts", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId LIKE 'q14d-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-14 (b): the daily stalled-units digest, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${names.map(n => `('q14d-${n}','${n}','q14d-${n}@pmc.example.test','user')`).join(",")}`);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q14d-%'");
    for (const name of names) users[name] = rows.find(row => row.openId === `q14d-${name}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q14 Digest Tenant', 'q14d-a'), (?, 'Q14 Digest Other', 'q14d-b')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q14D-A', 'Digest project', 'villas', 'SAR', 'active'), (?, ?, 'Q14D-S', 'Side project', 'villas', 'SAR', 'active'), (?, ?, 'Q14D-B', 'Other company project', 'villas', 'SAR', 'active')", [P, T, P_SIDE, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q14d-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q14d-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q14d-ent-a', ?, 'q14d-sub-a', 'PROJECT', true, NOW()), ('q14d-ent-b', ?, 'q14d-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('project.pmc.read','project.pmc.update','project.pmc.manage')");
    const perm = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q14d-role-plan', ?, 'Q14D_PLAN','Planner','PROJECT'), ('q14d-role-site', ?, 'Q14D_SITE','Site','PROJECT'), ('q14d-role-other', ?, 'Q14D_PLAN','Planner','PROJECT')", [T, T, T_OTHER]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('q14d-role-plan', ?),('q14d-role-plan', ?),('q14d-role-plan', ?),('q14d-role-site', ?),('q14d-role-site', ?),('q14d-role-other', ?),('q14d-role-other', ?),('q14d-role-other', ?)", [perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage"), perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.read"), perm("project.pmc.update"), perm("project.pmc.manage")]);
    const member = async (name: (typeof names)[number], tenantId: string, roleId: string, projectId: string) => {
      await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (?, ?, ?, 'active')", [`q14d-m-${name}`, tenantId, users[name]]);
      await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES (?, ?, ?, 'project', ?)", [`q14d-mr-${name}`, `q14d-m-${name}`, roleId, projectId]);
    };
    await member("planner", T, "q14d-role-plan", P); await member("site", T, "q14d-role-site", P); await member("optout", T, "q14d-role-site", P); await member("side", T, "q14d-role-site", P_SIDE); await member("other", T_OTHER, "q14d-role-other", P_OTHER);
    await connection.query("INSERT INTO email_notification_preferences (id, tenantId, userId, kind, enabled) VALUES ('q14d-pref', ?, ?, 'daily_digest', false)", [T, users.optout]);
    // the same small project in both companies; in ours two villas are backdated, in the other everything moved today
    for (const [tenantId, projectId, who] of [[T, P, "planner"], [T_OTHER, P_OTHER, "other"]] as const) {
      const caller = callerFor(users[who], `q14d-${who}`); const scope = { tenantId, projectId };
      for (const [kind, base64] of [["locations", await sheet(["Zone", "Block", "Unit", "Model"], [["Z1", "B1", 1, "A"], ["Z1", "B1", 2, "A"], ["Z1", "B2", 3, "A"]])], ["catalog", await sheet(["Model", "Group", "Stage", "Activity", "Activity name", "Weight"], [["A", "03 Concrete", "S1", "FOOT", "Footings", 40], ["A", "09 Finishes", "S2", "PAINT", "Paint", 60]])]] as const) {
        const report = await caller.pmc.analyzeImport({ ...scope, kind, format: "xlsx", base64 }); expect(report.errorCount).toBe(0);
        await caller.pmc.confirmImport({ ...scope, kind, format: "xlsx", base64, approvedHash: report.fileHash });
      }
      await caller.pmc.updateProgress({ ...scope, activityCode: "FOOT", villas: ["1", "2", "3"], status: "IN_PROGRESS", date: new Date(NOW.getTime() + 3 * 3_600_000).toISOString().slice(0, 10) });
    }
    const backdate = (unitNumber: number, days: number) => connection.query("UPDATE pmc_unit_activity_progress SET lastChangedAt = ? WHERE tenantId = ? AND unitId = (SELECT id FROM pmc_units WHERE tenantId = ? AND projectId = ? AND unitNumber = ?)", [new Date(NOW.getTime() - days * 86_400_000), T, T, P, unitNumber]);
    await backdate(1, 8); await backdate(2, 40);
    // the threshold is set so that villa 1 crossed it exactly today (the newly stalled one); villa 2 has been stalled for weeks (the continuing one)
    const before = await withSystemContext("test: read the classification", async () => computeStalledUnits((await getDb())!, { tenantId: T, projectId: P }, NOW));
    const villa1 = before.rows.find(row => row.villa === "1")!;
    await callerFor(users.planner, "q14d-planner").pmc.setStallThreshold({ tenantId: T, projectId: P, thresholdDays: villa1.workingDays - 1 });
  }, 120_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const notices = async (userId: number) => (await connection.query<{ projectId: string; payload: string }[]>("SELECT projectId, payload FROM internal_notifications WHERE recipientUserId = ? AND notificationCode = ?", [userId, STALLED_NOTICE_CODE]))[0];
  const mails = async (userId: number) => (await connection.query<{ tenantId: string; subject: string; bodyText: string; dedupeKey: string }[]>("SELECT tenantId, subject, bodyText, dedupeKey FROM email_outbox WHERE recipientUserId = ? AND dedupeKey LIKE 'stalled:%'", [userId]))[0];

  it("before 7:00 Riyadh nothing is written", async () => {
    expect(await run(new Date(NOW.getTime() - 2 * 3_600_000))).toEqual({ notices: 0, mails: 0 });
    expect(await notices(users.planner)).toHaveLength(0);
  });

  it("the planner and the site engineer each get one notice and one Arabic-first mail: the newly stalled villa, then the continuing one, with the screen's link", async () => {
    const result = await run(NOW);
    expect(result).toEqual({ notices: 3, mails: 2 }); // planner, site, optout (notice only)
    for (const who of ["planner", "site"] as const) {
      const [notice] = await notices(users[who]); expect(notice.projectId).toBe(P);
      expect(JSON.parse(notice.payload)).toMatchObject({ newToday: 1, continuing: 1 });
      const list = await mails(users[who]); expect(list).toHaveLength(1);
      expect(list[0].subject).toMatch(/^الوحدات المتوقفة/);
      const text = list[0].bodyText;
      expect(text.indexOf("متوقفة جديدة اليوم: 1")).toBeLessThan(text.indexOf("فيلا 1"));
      expect(text.indexOf("فيلا 1")).toBeLessThan(text.indexOf("ما زالت متوقفة: 1"));
      expect(text.indexOf("ما زالت متوقفة: 1")).toBeLessThan(text.indexOf("فيلا 2"));
      expect(text).not.toContain("فيلا 3");
    }
  });

  it("whoever switched off the daily summary gets the notice but no mail", async () => {
    expect(await notices(users.optout)).toHaveLength(1);
    expect(await mails(users.optout)).toHaveLength(0);
  });

  it("run again the same day: nothing more is written", async () => {
    expect(await run(new Date(NOW.getTime() + 3_600_000))).toEqual({ notices: 0, mails: 0 });
    expect(await notices(users.planner)).toHaveLength(1);
    expect(await mails(users.site)).toHaveLength(1);
  });

  it("two companies: the other company's planner (nothing stalled there) and a member of another project of ours receive nothing", async () => {
    expect(await notices(users.other)).toHaveLength(0);
    expect(await mails(users.other)).toHaveLength(0);
    expect(await notices(users.side)).toHaveLength(0);
    expect(await mails(users.side)).toHaveLength(0);
    const [outbox] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM email_outbox WHERE tenantId = ? AND dedupeKey LIKE 'stalled:%'", [T_OTHER]);
    expect(Number(outbox[0].n)).toBe(0);
  });
});

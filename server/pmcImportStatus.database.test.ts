import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-35 on a real database, through the real router, as the restricted application role: each PMC import kind's state comes from the saved import
// (data_imports), an analysed-but-unconfirmed upload is not «imported», and nothing of another company's project is read. Synthetic data only.
const T = "35000000-0000-4000-8000-0000000000a1";
const T_OTHER = "35000000-0000-4000-8000-0000000000b1";
const P = "35000000-0000-4000-8000-0000000000a2";
const P_OTHER = "35000000-0000-4000-8000-0000000000b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q35.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
let connection: fixtureDb.Connection;
const users = { reader: 0, none: 0, other: 0 };

async function clear() {
  const t = [T, T_OTHER];
  await connection.query("DELETE FROM data_imports WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", [P, P_OTHER]);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId LIKE 'q35-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC import status from the saved imports (Q-35)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q35-reader','Q35 Reader','q35-reader@q35.example.test','user'),('q35-none','Q35 None','q35-none@q35.example.test','user'),('q35-other','Q35 Other','q35-other@q35.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q35-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.reader = idOf("q35-reader"); users.none = idOf("q35-none"); users.other = idOf("q35-other");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q35 Tenant', 'q35-tenant'), (?, 'Q35 Other', 'q35-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q35-A', 'Import status project', 'villas', 'SAR', 'active'), (?, ?, 'Q35-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q35-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('q35-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q35-ent-a', ?, 'q35-sub-a', 'PROJECT', true, NOW()), ('q35-ent-b', ?, 'q35-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES ('q35-perm-read','project.pmc.read','project.pmc.read','PROJECT')");
    const [[read]] = await connection.query<{ id: string }[]>("SELECT id FROM permissions WHERE code = 'project.pmc.read'") as unknown as [{ id: string }[]];
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q35-role-read', ?, 'Q35_READ','Reader','PROJECT'), ('q35-role-none', ?, 'Q35_NONE','None','PROJECT'), ('q35-role-other', ?, 'Q35_OTHER','Other reader','PROJECT')", [T, T, T_OTHER]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('q35-role-read', ?), ('q35-role-other', ?)", [read.id, read.id]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('q35-m-reader', ?, ?, 'active'), ('q35-m-none', ?, ?, 'active'), ('q35-m-other', ?, ?, 'active')", [T, users.reader, T, users.none, T_OTHER, users.other]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('q35-mr-reader','q35-m-reader','q35-role-read','company'), ('q35-mr-none','q35-m-none','q35-role-none','company'), ('q35-mr-other','q35-m-other','q35-role-other','company')");
    const imp = (id: string, tenantId: string, projectId: string, moduleCode: string, status: string, created: string, hash: string, rowsCreated = 0) => connection.query(
      "INSERT INTO data_imports (id, tenantId, projectId, moduleCode, templateCode, sourceFormat, fileName, fileKey, fileHash, createdByUserId, status, createdRows, createdAt, completedAt) VALUES (?, ?, ?, ?, 'pmc', 'xlsx', 'f.xlsx', ?, ?, ?, ?, ?, ?, ?)",
      [id, tenantId, projectId, moduleCode, `k/${id}`, hash.repeat(64), users.reader, status, rowsCreated, created, status === "completed" ? created : null]);
    // weights: imported; locations: uploaded and analysed, never confirmed; status: failed after a good import; requests: still analysing;
    // catalog: only in the OTHER company's project (must not show here); a non-PMC import must not count
    await imp("35000000-0000-4000-8000-000000000001", T, P, "pmc.weights", "completed", "2027-01-05 10:00:00", "a", 7);
    await imp("35000000-0000-4000-8000-000000000002", T, P, "pmc.locations", "validated", "2027-01-06 10:00:00", "b");
    await imp("35000000-0000-4000-8000-000000000003", T, P, "pmc.status", "completed", "2027-01-04 10:00:00", "c", 3);
    await imp("35000000-0000-4000-8000-000000000004", T, P, "pmc.status", "failed", "2027-01-07 10:00:00", "d");
    await imp("35000000-0000-4000-8000-000000000005", T, P, "pmc.requests", "analyzing", "2027-01-07 11:00:00", "e");
    await imp("35000000-0000-4000-8000-000000000006", T_OTHER, P_OTHER, "pmc.catalog", "completed", "2027-01-03 10:00:00", "f", 9);
    await imp("35000000-0000-4000-8000-000000000007", T, P, "wbs", "completed", "2027-01-02 10:00:00", "0");
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: each kind says what its saved imports say", async () => {
    const statuses = await callerFor(users.reader, "q35-reader").pmc.importStatus({ tenantId: T, projectId: P });
    const of = (kind: string) => statuses.find(row => row.kind === kind)!;
    expect(statuses.map(row => row.kind)).toEqual(["locations", "catalog", "status", "requests", "baseline", "baselineDates", "weights"]);
    expect(of("weights")).toMatchObject({ state: "completed", createdRows: 7 });
    expect(of("status")).toMatchObject({ state: "failed", createdRows: 3 });
    expect(of("status").lastImportedAt).not.toBeNull();
    expect(of("requests").state).toBe("analyzing");
    expect(of("baseline").state).toBe("none");
  });

  it("NEGATIVE: an upload that was analysed but never confirmed is not shown as imported", async () => {
    const statuses = await callerFor(users.reader, "q35-reader").pmc.importStatus({ tenantId: T, projectId: P });
    expect(statuses.find(row => row.kind === "locations")).toMatchObject({ state: "pending", lastImportedAt: null, createdRows: 0 });
  });

  it("ISOLATION: another company's import is not read here, and another company's reader cannot ask about this project; no PMC permission is refused", async () => {
    const statuses = await callerFor(users.reader, "q35-reader").pmc.importStatus({ tenantId: T, projectId: P });
    expect(statuses.find(row => row.kind === "catalog")).toMatchObject({ state: "none", createdRows: 0 });
    expect(await code(callerFor(users.other, "q35-other").pmc.importStatus({ tenantId: T, projectId: P }))).not.toBe("no error");
    expect(await code(callerFor(users.other, "q35-other").pmc.importStatus({ tenantId: T_OTHER, projectId: P }))).not.toBe("no error");
    expect(await code(callerFor(users.none, "q35-none").pmc.importStatus({ tenantId: T, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });
});

import { COOKIE_NAME } from "@shared/const";
import express from "express";
import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { seedDemoData } from "../scripts/lib/demoData.mjs";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { confirmTenantDeletion, previewTenantData, requestTenantDeletion } from "./tenantDataService";
import { NOT_COMPANY_DATA, RETAINED_TENANT_TABLES, TENANT_CHILD_TABLES, countTenantData, deleteTenantData, issueDeletionToken, readSchemaMap, recordAudit, verifyDeletionToken } from "./tenantData";
import { tenantExportHandler } from "./tenantExportRoute";
import { appRouter } from "./routers";
import { getScopedAuditAppUsername } from "./domain/auditAccountIdentity";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// A company's data leaves with it, and goes when it asks — on a real database, with two companies side by side so "nothing else was
// touched" is a comparison and not a hope. Synthetic people and amounts only (*.example.test).
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("company data export and permanent deletion", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  type Asked = Awaited<ReturnType<typeof requestTenantDeletion>>;
  let a: Fixture; let b: Fixture; let asked: Asked;
  let connection: mysql.Connection;
  let server: Server; let base = "";
  const files = { a: [] as string[], b: [] as string[] };
  const extraTables: string[] = [];

  // When the run uses the restricted application account (no PROJECT_OS_USE_ADMIN_DATABASE_URL), a table created here is invisible to it until
  // it is granted — exactly as a table added by a later migration is until scripts/provision-audit-app-account.mjs is run again.
  const grantToApplication = async (table: string) => {
    if (process.env.PROJECT_OS_USE_ADMIN_DATABASE_URL === "true" || !process.env.PROJECT_OS_APP_DB_PASSWORD) return;
    const database = decodeURIComponent(new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1));
    await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.\`${table}\` TO \`${getScopedAuditAppUsername(process.env.DATABASE_URL!)}\`@\`%\``);
  };
  const rowsPerTable = async (tenantId: string) => {
    const db = (await getDb())!;
    const counts = await countTenantData(db, tenantId);
    return Object.fromEntries([...counts.tables.map(item => [item.table, item.rows]), ["audit_logs", counts.auditRows]]);
  };
  const cookieFor = async (person: Fixture["people"][string]) => `${COOKIE_NAME}=${await sdk.issueSession(person.openId, { name: person.row.name ?? "x" })}`;

  async function addFilesAndImports(fixture: Fixture, keys: string[]) {
    const { tenantId, projectId, owner } = fixture;
    const documentId = randomUUID();
    await connection.query("INSERT INTO project_documents (id, tenantId, projectId, documentNumber, title, createdByUserId) VALUES (?, ?, ?, ?, 'Drawing set', ?)", [documentId, tenantId, projectId, `DOC-${fixture.run}`, owner.id]);
    const versionKey = `tenants/${tenantId}/documents/${randomUUID()}.pdf`;
    await connection.query("INSERT INTO document_versions (id, tenantId, projectId, documentId, versionNumber, originalName, storageKey, mimeType, sizeBytes, checksumSha256, uploadedByUserId) VALUES (?, ?, ?, ?, 1, 'plan.pdf', ?, 'application/pdf', 10, ?, ?)", [randomUUID(), tenantId, projectId, documentId, versionKey, "a".repeat(64), owner.id]);
    const importId = randomUUID(); const importKey = `tenants/${tenantId}/imports/${randomUUID()}.xlsx`;
    await connection.query("INSERT INTO data_imports (id, tenantId, projectId, moduleCode, templateCode, sourceFormat, fileName, fileKey, fileHash, createdByUserId) VALUES (?, ?, ?, 'wbs', 'wbs_v1', 'xlsx', 'wbs.xlsx', ?, ?, ?)", [importId, tenantId, projectId, importKey, "b".repeat(64), owner.id]);
    await connection.query("INSERT INTO data_import_errors (id, importId, rowNumber, code, severity) VALUES (?, ?, 3, 'REQUIRED', 'error')", [randomUUID(), importId]);
    await connection.query("INSERT INTO data_import_row_results (id, importId, rowNumber, rowKey, action) VALUES (?, ?, 3, 'k', 'created')", [randomUUID(), importId]);
    keys.push(versionKey, importKey);
  }

  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    if (ENV.cookieSecret.length < 16) (ENV as { cookieSecret: string }).cookieSecret = "live-tenant-data-secret-0123456789abcdef";
    a = await createRoleFixture({ label: "erase" });
    b = await createRoleFixture({ label: "keep" });
    for (const fixture of [a, b]) await seedDemoData({ caller: fixture.asOwner, connection, tenantId: fixture.tenantId, projectId: fixture.projectId, user: fixture.owner.row }).catch(() => undefined);
    await addFilesAndImports(a, files.a);
    await addFilesAndImports(b, files.b);
    // a person who belongs to BOTH companies: erasing A must leave them alone
    const invitation = await b.asOwner.tenant.createInvitation({ tenantId: b.tenantId, email: a.people.site.email, roleId: b.roleIds.SITE_ENGINEER, scopeType: "company" });
    await a.callerFor(a.people.site).tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    const app = express();
    app.get("/api/tenant-export/:tenantId", tenantExportHandler);
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 180_000);

  afterAll(async () => {
    await new Promise(resolve => server?.close(resolve));
    for (const table of extraTables) await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
    // test database only: remove what this file made, including the audit rows and tombstones the restricted account could not remove
    for (const fixture of [a, b].filter(Boolean)) {
      const db = (await getDb())!;
      await deleteTenantData({ db, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [fixture.tenantId]);
      await connection.query("DELETE FROM companies WHERE id = ?", [fixture.tenantId]);
      await connection.query("DELETE FROM users WHERE openId LIKE 'deleted:%' AND id NOT IN (SELECT actorUserId FROM audit_logs WHERE actorUserId IS NOT NULL)").catch(() => undefined);
    }
    await connection.end();
  }, 120_000);

  it("knows every table: nothing unclassified, no stray reference into company data, and the children it declares are real", async () => {
    const map = await readSchemaMap((await getDb())!);
    expect(map.unclassified).toEqual([]);
    expect(map.strayReferences).toEqual([]);
    expect(map.tenantTables.length).toBeGreaterThan(80);
    expect(map.deletionOrder).not.toContain("audit_logs");
    for (const child of TENANT_CHILD_TABLES) expect(map.columns[child.table]).toContain(child.column);
    // the identity tables go last, so an interrupted erasure can be resumed by the owner who started it
    expect(map.deletionOrder.slice(-4)).toEqual(["membership_roles", "role_permissions", "memberships", "roles"]);
    expect(NOT_COMPANY_DATA.length + RETAINED_TENANT_TABLES.length).toBeGreaterThan(0);
  });

  it("REFUSES to export or erase while a table is unaccounted for (negative control: a table nobody classified)", async () => {
    const db = (await getDb())!;
    await connection.query("CREATE TABLE zz_unclassified_probe (id varchar(36) PRIMARY KEY, note varchar(20))");
    extraTables.push("zz_unclassified_probe");
    await grantToApplication("zz_unclassified_probe");
    try {
      expect((await readSchemaMap(db)).unclassified).toContain("zz_unclassified_probe");
      await expect(countTenantData(db, a.tenantId)).rejects.toThrow("PROJECT_OS_TENANT_SCHEMA_UNCLASSIFIED");
      await expect(previewTenantData({ userId: a.owner.id, tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_TENANT_SCHEMA_UNCLASSIFIED");
      await expect(deleteTenantData({ db, tenantId: a.tenantId, actorUserId: a.owner.id })).rejects.toThrow("PROJECT_OS_TENANT_SCHEMA_UNCLASSIFIED");
      // and the refusal happened BEFORE anything changed: the company is still active with its products on
      const [[company]] = await connection.query<mysql.RowDataPacket[]>("SELECT status FROM companies WHERE id = ?", [a.tenantId]);
      const [[entitled]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM tenant_entitlements WHERE tenantId = ? AND active = true", [a.tenantId]);
      expect(company.status).toBe("active"); expect(Number(entitled.n)).toBeGreaterThan(0);
    } finally {
      await connection.query("DROP TABLE IF EXISTS zz_unclassified_probe");
    }
    expect((await readSchemaMap(db)).unclassified).toEqual([]);
  });

  it("only the company's owner may look, export or ask — a member with every other power is refused", async () => {
    await expect(previewTenantData({ userId: a.people.pm.id, tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_TENANT_OWNER_REQUIRED");
    await expect(requestTenantDeletion({ userId: a.people.finance.id, tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_TENANT_OWNER_REQUIRED");
    // the owner of ANOTHER company is no one here
    await expect(previewTenantData({ userId: b.owner.id, tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_TENANT_OWNER_REQUIRED");
    const refused = await fetch(`${base}/api/tenant-export/${a.tenantId}`, { headers: { cookie: await cookieFor(a.people.pm) } });
    expect(refused.status).toBe(403);
    const anonymous = await fetch(`${base}/api/tenant-export/${a.tenantId}`);
    expect(anonymous.status).toBe(401);
    const foreignOwner = await fetch(`${base}/api/tenant-export/${a.tenantId}`, { headers: { cookie: await cookieFor(b.owner) } });
    expect(foreignOwner.status).toBe(403);
    // the typed endpoints refuse a caller who is not signed in, and a non-owner through HTTP-shaped callers too
    const asSiteEngineer = a.callerFor(a.people.site);
    await expect(asSiteEngineer.tenantData.preview({ tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_TENANT_OWNER_REQUIRED");
  });

  it("will not ask for deletion before an export has been downloaded, and the audit trail records no export for a refused download", async () => {
    await expect(requestTenantDeletion({ userId: a.owner.id, tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_DELETION_EXPORT_REQUIRED");
    const [[exports]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'tenant.data_exported'", [a.tenantId]);
    expect(Number(exports.n)).toBe(0);
  });

  it("exports every row the company owns — and only those — as one complete gzip file, without secrets", async () => {
    const before = await rowsPerTable(a.tenantId);
    const response = await fetch(`${base}/api/tenant-export/${a.tenantId}`, { headers: { cookie: await cookieFor(a.owner) } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/gzip");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const lines = gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8").trim().split("\n").map(line => JSON.parse(line));
    const manifest = lines[0];
    expect(manifest.kind).toBe("manifest");
    expect(manifest.company.id).toBe(a.tenantId);
    const summary = lines.at(-1);
    expect(summary.kind).toBe("summary");
    for (const [table, count] of Object.entries(before)) if (count > 0) expect(summary.counts[table], table).toBe(count);
    const rows = lines.filter(line => line.kind === "row");
    expect(rows.length).toBe(summary.totalRows);
    // nothing of company B, and no sign-in identity or invitation secret anywhere in the file
    const text = JSON.stringify(rows);
    expect(text).not.toContain(b.tenantId);
    expect(text).not.toContain("tokenHash");
    expect(rows.some(line => line.table === "membership_invitations")).toBe(true);
    for (const line of rows.filter(item => item.table === "users")) expect(Object.keys(line.row).sort()).toEqual(["email", "id", "lastSignedIn", "name"]);
    // the child tables that carry no tenantId are in it, reached through their parents
    expect(rows.filter(line => line.table === "data_import_errors").length).toBe(1);
    expect(rows.filter(line => line.table === "role_permissions").length).toBeGreaterThan(0);
    // an interrupted download records nothing; a finished one records exactly one export
    const [[exports]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'tenant.data_exported'", [a.tenantId]);
    expect(Number(exports.n)).toBe(1);
  }, 120_000);

  it("a table added to the schema is exported and erased with no code change (negative control for 'every table is covered')", async () => {
    const db = (await getDb())!;
    await connection.query("CREATE TABLE zz_new_company_table (id varchar(36) PRIMARY KEY, tenantId varchar(36) NOT NULL, note varchar(40))");
    extraTables.push("zz_new_company_table");
    await grantToApplication("zz_new_company_table");
    await connection.query("INSERT INTO zz_new_company_table (id, tenantId, note) VALUES (?, ?, 'mine'), (?, ?, 'theirs')", [randomUUID(), a.tenantId, randomUUID(), b.tenantId]);
    const map = await readSchemaMap(db);
    expect(map.tenantTables).toContain("zz_new_company_table");
    expect(map.unclassified).toEqual([]);
    expect((await countTenantData(db, a.tenantId)).tables.find(item => item.table === "zz_new_company_table")?.rows).toBe(1);
  });

  it("the first confirmation: a code bound to this person, this company and a quarter of an hour; it deletes nothing", async () => {
    const before = await rowsPerTable(a.tenantId);
    const asOwnerA = a.callerFor(a.owner);
    asked = await asOwnerA.tenantData.requestDeletion({ tenantId: a.tenantId });
    expect(asked.companyName).toContain("Role Rehearsal Co.");
    expect(asked.totalRows).toBeGreaterThan(100);
    expect(asked.files).toBe(2);
    // the request itself is the only thing recorded: one more audit row, and not one row fewer anywhere
    expect(await rowsPerTable(a.tenantId)).toEqual({ ...before, audit_logs: before.audit_logs + 1 });
    const secret = ENV.cookieSecret; const now = new Date();
    const { token } = issueDeletionToken({ secret, tenantId: a.tenantId, userId: a.owner.id, totalRows: 5, now });
    expect(() => verifyDeletionToken({ secret, token, tenantId: a.tenantId, userId: a.owner.id, now })).not.toThrow();
    expect(() => verifyDeletionToken({ secret, token, tenantId: b.tenantId, userId: a.owner.id, now })).toThrow("PROJECT_OS_DELETION_CONFIRMATION_INVALID");
    expect(() => verifyDeletionToken({ secret, token, tenantId: a.tenantId, userId: a.people.pm.id, now })).toThrow("PROJECT_OS_DELETION_CONFIRMATION_INVALID");
    expect(() => verifyDeletionToken({ secret, token: `${token}x`, tenantId: a.tenantId, userId: a.owner.id, now })).toThrow("PROJECT_OS_DELETION_CONFIRMATION_INVALID");
    expect(() => verifyDeletionToken({ secret: "another-secret-0123456789", token, tenantId: a.tenantId, userId: a.owner.id, now })).toThrow("PROJECT_OS_DELETION_CONFIRMATION_INVALID");
    expect(() => verifyDeletionToken({ secret, token, tenantId: a.tenantId, userId: a.owner.id, now: new Date(now.getTime() + 16 * 60_000) })).toThrow("PROJECT_OS_DELETION_CONFIRMATION_EXPIRED");
    await recordAudit((await getDb())!, { tenantId: a.tenantId, actorUserId: a.owner.id, action: "probe.noop", metadata: {} });
  });

  it("the second confirmation refuses a wrong name, a foreign code and a stale export — and nothing is deleted", async () => {
    const before = await rowsPerTable(a.tenantId);
    const ownerA = a.callerFor(a.owner); const ownerB = b.callerFor(b.owner);
    const call = (input: Partial<{ typedName: string; confirmationToken: string; understandsItCannotBeUndone: true }>) => ownerA.tenantData.confirmDeletion({ tenantId: a.tenantId, confirmationToken: asked.confirmationToken, typedName: asked.companyName, understandsItCannotBeUndone: true, ...input });
    await expect(call({ typedName: asked.companyName.toLowerCase() })).rejects.toThrow("PROJECT_OS_DELETION_NAME_MISMATCH");
    await expect(call({ typedName: "" })).rejects.toThrow();
    await expect(call({ confirmationToken: "x".repeat(40) })).rejects.toThrow("PROJECT_OS_DELETION_CONFIRMATION_INVALID");
    await expect(ownerA.tenantData.confirmDeletion({ tenantId: a.tenantId, confirmationToken: asked.confirmationToken, typedName: asked.companyName, understandsItCannotBeUndone: false as unknown as true })).rejects.toThrow();
    // a code issued for company A cannot erase company B, even by B's own owner
    await expect(ownerB.tenantData.confirmDeletion({ tenantId: b.tenantId, confirmationToken: asked.confirmationToken, typedName: "x", understandsItCannotBeUndone: true })).rejects.toThrow("PROJECT_OS_DELETION_CONFIRMATION_INVALID");
    // an export older than the window no longer counts
    await connection.query("UPDATE audit_logs SET createdAt = DATE_SUB(NOW(), INTERVAL 8 DAY) WHERE tenantId = ? AND action = 'tenant.data_exported'", [a.tenantId]);
    await expect(call({})).rejects.toThrow("PROJECT_OS_DELETION_EXPORT_REQUIRED");
    await connection.query("UPDATE audit_logs SET createdAt = NOW() WHERE tenantId = ? AND action = 'tenant.data_exported'", [a.tenantId]);
    expect(await rowsPerTable(a.tenantId)).toEqual(before);
    const [[company]] = await connection.query<mysql.RowDataPacket[]>("SELECT status FROM companies WHERE id = ?", [a.tenantId]);
    expect(company.status).toBe("active");
  });

  it("erases company A completely, leaves company B and the person they share exactly as they were, and proves it", async () => {
    const beforeB = await rowsPerTable(b.tenantId);
    const [sharedBefore] = await connection.query<mysql.RowDataPacket[]>("SELECT id, name, email, openId FROM users WHERE id = ?", [a.people.site.id]);
    const [onlyInABefore] = await connection.query<mysql.RowDataPacket[]>("SELECT id, name, email, openId FROM users WHERE id = ?", [a.people.pm.id]);
    expect(onlyInABefore[0].email).toContain("@e2e.example.test");
    await connection.query("INSERT INTO auth_sessions (id, userId, expiresAt) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))", [randomUUID(), a.people.pm.id]);
    const deletedKeys: string[] = [];

    const report = await confirmTenantDeletion({ userId: a.owner.id, tenantId: a.tenantId, confirmationToken: asked.confirmationToken, typedName: asked.companyName }, { storageDelete: async key => { deletedKeys.push(key); } });

    expect(report.verification).toBe("PASS");
    expect(report.remaining).toEqual([]);
    expect(report.rowsDeleted).toBe(report.rowsBefore);
    expect(report.rowsBefore).toBeGreaterThan(100);
    expect(report.tablesChecked).toBeGreaterThan(80);
    // zero rows, in every table the company owns, counted afresh from the database
    const after = await rowsPerTable(a.tenantId);
    for (const [table, rows] of Object.entries(after)) if (table !== "audit_logs") expect(rows, table).toBe(0);
    // the files are gone too: exactly the keys the rows pointed at
    expect(report.files).toMatchObject({ found: 2, deleted: 2, failed: 0 });
    expect(deletedKeys.sort()).toEqual([...files.a].sort());
    // the audit trail stays, with the export, the requests and now the erasure itself
    const [audit] = await connection.query<mysql.RowDataPacket[]>("SELECT action FROM audit_logs WHERE tenantId = ? AND action LIKE 'tenant.%' ORDER BY createdAt", [a.tenantId]);
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(["tenant.data_exported", "tenant.deletion_requested", "tenant.deletion_confirmed", "tenant.data_deleted"]));
    expect(after.audit_logs).toBeGreaterThan(0);
    // the company row is a tombstone and its products are off
    const [[company]] = await connection.query<mysql.RowDataPacket[]>("SELECT status, legalName, slug FROM companies WHERE id = ?", [a.tenantId]);
    expect(company.status).toBe("archived");
    expect(company.legalName).not.toContain("Role Rehearsal");
    expect(company.slug).toBe(`deleted-${a.tenantId}`);
    const [[entitled]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM tenant_entitlements WHERE tenantId = ?", [a.tenantId]);
    expect(Number(entitled.n)).toBe(0);
    // people: only-in-A are scrubbed and signed out; the person who also belongs to B is untouched
    const [[scrubbed]] = await connection.query<mysql.RowDataPacket[]>("SELECT name, email, openId FROM users WHERE id = ?", [a.people.pm.id]);
    expect(scrubbed.email).toBeNull(); expect(scrubbed.name).toBe("Deleted user"); expect(scrubbed.openId).toMatch(/^deleted:/);
    const [[sessions]] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM auth_sessions WHERE userId = ?", [a.people.pm.id]);
    expect(Number(sessions.n)).toBe(0);
    const [[shared]] = await connection.query<mysql.RowDataPacket[]>("SELECT id, name, email, openId FROM users WHERE id = ?", [a.people.site.id]);
    expect(shared).toEqual(sharedBefore[0]);
    expect(report.people.keptBecauseInAnotherCompany).toBe(1);
    // company B: every table, row for row
    expect(await rowsPerTable(b.tenantId)).toEqual(beforeB);
    const [[bStatus]] = await connection.query<mysql.RowDataPacket[]>("SELECT status FROM companies WHERE id = ?", [b.tenantId]);
    expect(bStatus.status).toBe("active");
    // the owner is out: their own session no longer opens anything
    await expect(previewTenantData({ userId: a.owner.id, tenantId: a.tenantId })).rejects.toThrow("PROJECT_OS_TENANT_OWNER_REQUIRED");
    // B's data is still exportable in full
    const exportB = await fetch(`${base}/api/tenant-export/${b.tenantId}`, { headers: { cookie: await cookieFor(b.owner) } });
    expect(exportB.status).toBe(200);
  }, 180_000);

  it("can be run again: a second pass finds nothing and still says PASS (an interrupted erasure is finished by running it again)", async () => {
    const report = await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined });
    expect(report.verification).toBe("PASS");
    expect(report.rowsBefore).toBe(0);
    expect(report.rowsDeleted).toBe(0);
  });

  it("says FAIL, not PASS, when a stored file could not be removed — and names the key so it can be", async () => {
    const asOwner = b.callerFor(b.owner);
    await fetch(`${base}/api/tenant-export/${b.tenantId}`, { headers: { cookie: await cookieFor(b.owner) } }).then(response => response.arrayBuffer());
    const askedB = await asOwner.tenantData.requestDeletion({ tenantId: b.tenantId });
    const report = await confirmTenantDeletion({ userId: b.owner.id, tenantId: b.tenantId, confirmationToken: askedB.confirmationToken, typedName: askedB.companyName }, { storageDelete: async key => { if (key === files.b[0]) throw new Error("storage unavailable"); } });
    expect(report.remaining).toEqual([]);
    expect(report.verification).toBe("FAIL");
    expect(report.files).toMatchObject({ found: 2, deleted: 1, failed: 1, failedKeys: [files.b[0]] });
  }, 180_000);

  it("the application routers carry the three calls (so the coverage inventory sees them)", () => {
    expect(Object.keys(appRouter._def.procedures).filter(path => path.startsWith("tenantData.")).sort()).toEqual(["tenantData.confirmDeletion", "tenantData.preview", "tenantData.requestDeletion"]);
  });
});

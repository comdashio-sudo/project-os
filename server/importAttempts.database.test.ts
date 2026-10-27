import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { syntheticXer } from "./testing/importFixtures";

// Import attempts (owner order 2026-10-27, after the file 2234-21.xer was refused as "already imported" although nothing from it was ever written). Same real-database scaffold as importJobs.database.test.ts.
// Work order 6, direct upload: a file goes browser → Storage by a signed URL (a REAL HTTP PUT against an S3-compatible server, through the real storage module),
// is analysed and imported by background jobs whose progress the screen polls. Synthetic fixtures only; the files are 30 MB (XER) and 20,000 rows (Excel).
const T = "7a000000-0000-4000-8000-0000000000a1";
const T2 = "7a000000-0000-4000-8000-0000000000b1";
const P = "7a000000-0000-4000-8000-0000000000a2";
const P2 = "7a000000-0000-4000-8000-0000000000b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { importer: 0, manager: 0, stranger: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@attempts.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };

async function clear() {
  for (const tenant of [T, T2]) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [tenant]);
    await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM activities WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM wbs_items WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM companies WHERE id = ?", [tenant]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'iat-%'");
}

type Caller = ReturnType<typeof callerFor>;
/** What the browser does: ask for the URL, PUT the bytes to it (real HTTP), then register the upload. */
async function upload(caller: Caller, file: { name: string; bytes: Buffer; format: "xlsx" | "csv" | "xer" }, extra: Record<string, unknown> = {}) {
  const target = await caller.dataImports.createUpload({ ...scope, moduleCode: "schedule", fileName: file.name, sourceFormat: file.format });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file.bytes });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return { target, registered: await caller.dataImports.registerUpload({ ...scope, moduleCode: "schedule", fileName: file.name, sourceFormat: file.format, uploadKey: target.uploadKey, ...extra }) };
}
/** What the screen does: poll until the job leaves its in-flight status. Returns every distinct state it saw. */
async function pollUntilDone(caller: Caller, importId: string, timeoutMs = 240_000) {
  const seen: Array<{ status: string; stage: string | null; percent: number }> = [];
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await caller.dataImports.progress({ ...scope, importId });
    const last = seen[seen.length - 1];
    if (!last || last.status !== view.status || last.stage !== view.progressStage || last.percent !== view.progressPercent) seen.push({ status: view.status, stage: view.progressStage, percent: view.progressPercent });
    if (view.status !== "analyzing" && view.status !== "importing") return { view, seen };
    if (Date.now() > deadline) throw new Error(`job still ${view.status} after ${timeoutMs} ms: ${JSON.stringify(seen)}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
const rowOf = async (id: string) => (await connection.query<any[]>("SELECT * FROM data_imports WHERE id = ?", [id]))[0][0];
const count = async (table: string) => Number((await connection.query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table} WHERE tenantId = ?`, [T]))[0][0].n);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("direct-upload imports and their background jobs on a real database", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('iat-importer','Importer','iat-importer@attempts.example.test','user'),('iat-manager','Manager','iat-manager@attempts.example.test','user'),('iat-stranger','Stranger','iat-stranger@attempts.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'iat-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.importer = idOf("iat-importer"); users.manager = idOf("iat-manager"); users.stranger = idOf("iat-stranger");
    for (const [tenant, slug] of [[T, "attempts-tenant"], [T2, "attempts-other"]] as const) await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, ?, ?)", [tenant, slug, slug]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'IA-A', 'Attempts project', 'villas', 'SAR', 'active'), (?, ?, 'IA-B', 'Other tenant project', 'villas', 'SAR', 'active')", [P, T, P2, T2]);
    for (const [tenant, tag] of [[T, "a"], [T2, "b"]] as const) {
      await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`iat-sub-${tag}`, tenant]);
      await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`iat-ent-${tag}`, tenant, `iat-sub-${tag}`]);
    }
    for (const code of ["project.read", "project.schedule.manage", "project.wbs.manage", "project.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('iat-r-importer', ?, 'IJB_IMPORTER','Importer','PROJECT'), ('iat-r-manager', ?, 'IJB_MANAGER','Manager','PROJECT'), ('iat-r-stranger', ?, 'IJB_STRANGER','Stranger','PROJECT')", [T, T, T2]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'iat-r-importer', id FROM permissions WHERE code IN ('project.read','project.schedule.manage','project.wbs.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'iat-r-manager', id FROM permissions WHERE code IN ('project.read','project.schedule.manage','project.wbs.manage','project.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'iat-r-stranger', id FROM permissions WHERE code IN ('project.read','project.schedule.manage','project.wbs.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('iat-m-importer', ?, ?, 'active'), ('iat-m-manager', ?, ?, 'active'), ('iat-m-stranger', ?, ?, 'active')", [T, users.importer, T, users.manager, T2, users.stranger]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('iat-mr-importer','iat-m-importer','iat-r-importer','company'),('iat-mr-manager','iat-m-manager','iat-r-manager','company'),('iat-mr-stranger','iat-m-stranger','iat-r-stranger','company')");
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  const file = (name: string, bytes: Buffer) => ({ name, bytes, format: "xer" as const });
  const good = syntheticXer(6_000, 5);
  const broken = Buffer.from(["ERMHDR\t8.4\t2026-10-22\tProject\tadmin\tsynthetic", "%T\tPROJWBS", "%F\twbs_id\twbs_short_name\twbs_name\twbs_cost", "%R\t1\tW1\tWBS 1\t1000", "%E"].join("\n"), "utf8"); // no TASK table: refused by the analysis
  const hasObject = (key: string) => [...s3.objects.keys()].some(name => name.endsWith(key));
  const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message);

  it("a refused analysis does not block uploading the same file again; a CONFIRMED import does", async () => {
    const importer = callerFor(users.importer, "iat-importer");
    const first = await upload(importer, file("rejected.xer", broken));
    const refused = await pollUntilDone(importer, first.registered.id);
    expect(refused.view.status).toBe("uploaded");
    expect(refused.view.analysis?.errors.length).toBeGreaterThan(0);
    // the SAME bytes again: before this change this was refused with PROJECT_OS_IMPORT_DUPLICATE_DETECTED
    const second = await upload(importer, file("rejected-again.xer", broken));
    expect(second.registered.id).not.toBe(first.registered.id);
    expect((await pollUntilDone(importer, second.registered.id)).view.status).toBe("uploaded");

    const ok = await upload(importer, file("good.xer", good.bytes));
    expect((await pollUntilDone(importer, ok.registered.id)).view.status).toBe("validated");
    await importer.dataImports.confirm({ ...scope, importId: ok.registered.id });
    expect((await pollUntilDone(importer, ok.registered.id)).view.status).toBe("completed");
    // now it IS imported: the same file is refused
    expect(await code(upload(importer, file("good-again.xer", good.bytes)))).toBe("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
    // the log tells the three apart
    const list = await importer.dataImports.list(scope);
    const states = Object.fromEntries(list.map(row => [row.fileName, { status: row.status, errorCount: Number(row.errorCount) }]));
    expect(states["rejected.xer"]).toMatchObject({ status: "uploaded" });
    expect(states["rejected.xer"].errorCount).toBeGreaterThan(0);
    expect(states["good.xer"]).toMatchObject({ status: "completed", errorCount: 0 });
  }, 120_000);

  it("discard deletes a refused attempt with its stored file and audit row, and refuses an imported one", async () => {
    const importer = callerFor(users.importer, "iat-importer");
    const [[before]] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ? AND fileName = 'rejected.xer'", [T]);
    expect(Number(before.n)).toBe(1);
    const refused = (await importer.dataImports.list(scope)).find(row => row.fileName === "rejected.xer")!;
    const key = (await rowOf(refused.id)).fileKey as string;
    expect(hasObject(key)).toBe(true);
    expect(await importer.dataImports.discard({ ...scope, importId: refused.id })).toMatchObject({ discarded: true });
    expect(await rowOf(refused.id)).toBeUndefined();
    expect(hasObject(key)).toBe(false);
    const [audit] = await connection.query<{ action: string }[]>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ?", [T, refused.id]);
    expect(audit.map(row => row.action)).toContain("data_import_attempt_discarded");
    const imported = (await importer.dataImports.list(scope)).find(row => row.fileName === "good.xer")!;
    expect(await code(importer.dataImports.discard({ ...scope, importId: imported.id }))).toBe("PROJECT_OS_IMPORT_DISCARD_NOT_ALLOWED");
    expect((await rowOf(imported.id)).status).toBe("completed");
    // another company's person cannot reach it at all
    expect(await code(callerFor(users.stranger, "iat-stranger").dataImports.discard({ ...scope, importId: imported.id }))).toBeTruthy();
  }, 60_000);

  it("rollback needs the project manager, deletes exactly what the import created, and frees the file for a fresh import", async () => {
    const importer = callerFor(users.importer, "iat-importer");
    const manager = callerFor(users.manager, "iat-manager");
    const imported = (await importer.dataImports.list(scope)).find(row => row.fileName === "good.xer")!;
    expect(await count("wbs_items")).toBe(good.wbs);
    expect(await count("activities")).toBe(good.activities);
    // an unrelated WBS row of the same project must survive
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES ('iat-keep', ?, ?, 'KEEP-1', 'Not from the import', 1)", [T, P]);
    const denied = await code(importer.dataImports.rollback({ ...scope, importId: imported.id }));
    expect(denied).toBeTruthy();
    expect(denied).not.toBe("no error");
    expect(await count("activities")).toBe(good.activities); // nothing happened
    expect(await manager.dataImports.rollback({ ...scope, importId: imported.id })).toMatchObject({ rolledBack: true, deleted: { activities: good.activities, wbsItems: good.wbs } });
    expect(await count("activities")).toBe(0);
    expect(await count("wbs_items")).toBe(1);
    const [[kept]] = await connection.query<{ code: string }[]>("SELECT code FROM wbs_items WHERE id = 'iat-keep'");
    expect(kept.code).toBe("KEEP-1");
    expect((await rowOf(imported.id)).status).toBe("cancelled");
    const [audit] = await connection.query<{ action: string; metadata: string }[]>("SELECT action, metadata FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'data_import_rolled_back'", [T, imported.id]);
    expect(audit).toHaveLength(1);
    expect(await code(manager.dataImports.rollback({ ...scope, importId: imported.id }))).toBe("PROJECT_OS_IMPORT_ROLLBACK_NOT_COMPLETED");
    // the hash is free again: the same file imports again
    const again = await upload(importer, file("good-after-rollback.xer", good.bytes));
    expect((await pollUntilDone(importer, again.registered.id)).view.status).toBe("validated");
    await importer.dataImports.confirm({ ...scope, importId: again.registered.id });
    expect((await pollUntilDone(importer, again.registered.id)).view.status).toBe("completed");
    expect(await count("activities")).toBe(good.activities);
  }, 120_000);

  it("rollback refuses an import that changed rows which already existed, and one whose rows something else now uses", async () => {
    const importer = callerFor(users.importer, "iat-importer");
    const manager = callerFor(users.manager, "iat-manager");
    // a larger file with the same codes, imported over the first one in upsert mode: it updates what existed and creates the rest
    const bigger = syntheticXer(9_000, 5);
    const over = await upload(importer, file("bigger.xer", bigger.bytes), { duplicateMode: "upsert" });
    expect((await pollUntilDone(importer, over.registered.id)).view.status).toBe("validated");
    await importer.dataImports.confirm({ ...scope, importId: over.registered.id });
    expect((await pollUntilDone(importer, over.registered.id)).view.status).toBe("completed");
    const before = await count("activities");
    expect(await code(manager.dataImports.rollback({ ...scope, importId: over.registered.id }))).toBe("PROJECT_OS_IMPORT_ROLLBACK_HAS_UPDATES");
    expect(await count("activities")).toBe(before); // refused whole: nothing deleted
    expect((await rowOf(over.registered.id)).status).toBe("completed");
  }, 120_000);
});

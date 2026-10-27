import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { IMPORT_JOB_MAX_ATTEMPTS, IMPORT_JOB_STALL_MS, ORPHAN_UPLOAD_MAX_AGE_MS, sweepImportJobs } from "./importJobs";
import { appRouter } from "./routers";
import { MAX_DIRECT_UPLOAD_BYTES } from "./storage";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { syntheticScheduleWorkbook, syntheticXer } from "./testing/importFixtures";

// Work order 6, direct upload: a file goes browser → Storage by a signed URL (a REAL HTTP PUT against an S3-compatible server, through the real storage module),
// is analysed and imported by background jobs whose progress the screen polls. Synthetic fixtures only; the files are 30 MB (XER) and 20,000 rows (Excel).
const T = "79000000-0000-4000-8000-0000000000a1";
const T2 = "79000000-0000-4000-8000-0000000000b1";
const P = "79000000-0000-4000-8000-0000000000a2";
const P2 = "79000000-0000-4000-8000-0000000000b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { importer: 0, reader: 0, stranger: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@jobs.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'ijb-%'");
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
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('ijb-importer','Importer','ijb-importer@jobs.example.test','user'),('ijb-reader','Reader','ijb-reader@jobs.example.test','user'),('ijb-stranger','Stranger','ijb-stranger@jobs.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'ijb-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.importer = idOf("ijb-importer"); users.reader = idOf("ijb-reader"); users.stranger = idOf("ijb-stranger");
    for (const [tenant, slug] of [[T, "jobs-tenant"], [T2, "jobs-other"]] as const) await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, ?, ?)", [tenant, slug, slug]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'JB-A', 'Jobs project', 'villas', 'SAR', 'active'), (?, ?, 'JB-B', 'Other tenant project', 'villas', 'SAR', 'active')", [P, T, P2, T2]);
    for (const [tenant, tag] of [[T, "a"], [T2, "b"]] as const) {
      await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`ijb-sub-${tag}`, tenant]);
      await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`ijb-ent-${tag}`, tenant, `ijb-sub-${tag}`]);
    }
    for (const code of ["project.read", "project.schedule.manage", "project.wbs.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('ijb-r-importer', ?, 'IJB_IMPORTER','Importer','PROJECT'), ('ijb-r-reader', ?, 'IJB_READER','Reader','PROJECT'), ('ijb-r-stranger', ?, 'IJB_STRANGER','Stranger','PROJECT')", [T, T, T2]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'ijb-r-importer', id FROM permissions WHERE code IN ('project.read','project.schedule.manage','project.wbs.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'ijb-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'ijb-r-stranger', id FROM permissions WHERE code IN ('project.read','project.schedule.manage','project.wbs.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('ijb-m-importer', ?, ?, 'active'), ('ijb-m-reader', ?, ?, 'active'), ('ijb-m-stranger', ?, ?, 'active')", [T, users.importer, T, users.reader, T2, users.stranger]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('ijb-mr-importer','ijb-m-importer','ijb-r-importer','company'),('ijb-mr-reader','ijb-m-reader','ijb-r-reader','company'),('ijb-mr-stranger','ijb-m-stranger','ijb-r-stranger','company')");
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("30 MB XER: uploads by signed URL, is analysed in the background with visible progress, then imported by a second job — and every row lands", async () => {
    const importer = callerFor(users.importer, "ijb-importer");
    const xer = syntheticXer(30 * 1024 * 1024);
    expect(xer.bytes.length).toBeGreaterThanOrEqual(30 * 1024 * 1024);
    const started = Date.now();
    s3.hold(1); // the registration reads the file once to hash it; the job's own read waits, so the in-flight state can be seen
    const { target, registered } = await upload(importer, { name: "synthetic-30mb.xer", bytes: xer.bytes, format: "xer" });
    expect(target.maxBytes).toBe(50 * 1024 * 1024);
    expect(registered).toMatchObject({ status: "analyzing" });
    const inFlight = await importer.dataImports.progress({ ...scope, importId: registered.id });
    expect(inFlight).toMatchObject({ status: "analyzing", failureReason: null });
    expect(inFlight.progressPercent).toBeGreaterThan(0);
    expect(inFlight.progressPercent).toBeLessThan(100);
    s3.release();
    const analysed = await pollUntilDone(importer, registered.id);
    const totalRows = xer.wbs + xer.activities;
    expect(analysed.view).toMatchObject({ status: "validated", progressPercent: 100, progressStage: null, failureReason: null, totalRows, validRows: totalRows, invalidRows: 0 });
    expect(analysed.view.analysis).toMatchObject({ errors: [], mapping: { recordType: "Record Type", wbsCode: "WBS Code" } });
    const analysisSeconds = (Date.now() - started) / 1000;

    const confirmStarted = Date.now();
    const confirming = await importer.dataImports.confirm({ ...scope, importId: registered.id });
    expect(confirming).toMatchObject({ id: registered.id, status: "importing" }); // above the synchronous threshold: a job, not an answer
    const imported = await pollUntilDone(importer, registered.id);
    expect(imported.view).toMatchObject({ status: "completed", createdRows: totalRows, updatedRows: 0, skippedRows: 0, failureReason: null });
    expect(imported.seen.map(state => state.status)).toContain("importing");
    expect(await count("wbs_items")).toBe(xer.wbs);
    expect(await count("activities")).toBe(xer.activities);
    const [[results]] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM data_import_row_results WHERE importId = ?", [registered.id]);
    expect(Number(results.n)).toBe(totalRows);
    const [audit] = await connection.query<{ action: string; metadata: string }[]>("SELECT action, metadata FROM audit_logs WHERE tenantId = ? AND entityId = ? ORDER BY createdAt", [T, registered.id]);
    expect(audit.map(row => row.action)).toEqual(["data_import_uploaded", "data_import_completed"]);
    const detail = await importer.dataImports.detail({ ...scope, importId: registered.id });
    expect(detail.rowResults.length).toBe(1000); // the screen lists the first rows only; the counters above are the totals
    console.log(`XER ${(xer.bytes.length / 1048576).toFixed(1)} MB, ${totalRows} rows: upload+analysis ${analysisSeconds.toFixed(1)} s, confirmation ${((Date.now() - confirmStarted) / 1000).toFixed(1)} s; states seen: ${JSON.stringify(analysed.seen.concat(imported.seen).map(state => `${state.status}/${state.stage ?? "-"}/${state.percent}`))}`);
  }, 600_000);

  it("Excel with 20,000 rows: the same path, analysis then import, nothing lost", async () => {
    const importer = callerFor(users.importer, "ijb-importer");
    await connection.query("DELETE FROM activities WHERE tenantId = ?", [T]); await connection.query("DELETE FROM wbs_items WHERE tenantId = ?", [T]);
    const workbook = await syntheticScheduleWorkbook(20_000);
    const started = Date.now();
    const { registered } = await upload(importer, { name: "synthetic-20k.xlsx", bytes: workbook.bytes, format: "xlsx" });
    const analysed = await pollUntilDone(importer, registered.id);
    expect(analysed.view).toMatchObject({ status: "validated", totalRows: 20_000, validRows: 20_000, invalidRows: 0, failureReason: null });
    await expect(importer.dataImports.confirm({ ...scope, importId: registered.id })).resolves.toMatchObject({ status: "importing" });
    const imported = await pollUntilDone(importer, registered.id);
    expect(imported.view).toMatchObject({ status: "completed", createdRows: 20_000 });
    expect(await count("wbs_items")).toBe(workbook.wbs);
    expect(await count("activities")).toBe(workbook.activities);
    console.log(`Excel ${(workbook.bytes.length / 1048576).toFixed(2)} MB, 20000 rows: ${((Date.now() - started) / 1000).toFixed(1)} s in total`);
  }, 600_000);

  it("a REAL-shaped XER (the sixteen tables P6 writes) is analysed and imported: PROJWBS and TASK are read, the other fourteen are named as warnings and stop nothing (the owner's 14-error rejection)", async () => {
    const importer = callerFor(users.importer, "ijb-importer");
    const ignoredTables = ["CURRTYPE", "FINTMPL", "OBS", "UMEASURE", "PROJECT", "CALENDAR", "SCHEDOPTIONS", "RSRC", "ACTVTYPE", "RSRCRATE", "ACTVCODE", "TASKPRED", "TASKRSRC", "TASKACTV"];
    const text = `ERMHDR\t25.12\t2026-10-01\tProject\tadmin\tadmin\tdb\tProject Management\tUSD\n${ignoredTables.map(name => `%T\t${name}\n%F\tid\n%R\t1`).join("\n")}\n%T\tPROJWBS\n%F\twbs_id\twbs_short_name\twbs_name\n%R\t10\tRX-W1\tCivil\n%R\t11\tRX-W2\tMEP\n%T\tTASK\n%F\ttask_code\ttask_name\twbs_id\ttarget_start_date\ttarget_end_date\tstatus_code\n%R\tRX-A100\tExcavate\t10\t2026-09-01 08:00\t2026-09-05 17:00\tTK_NotStart\n%R\tRX-A110\tPipes\t11\t2026-09-06 08:00\t2026-09-09 17:00\tTK_Active\n`;
    const { registered } = await upload(importer, { name: "real-shaped.xer", bytes: Buffer.from(text), format: "xer" });
    const analysed = await pollUntilDone(importer, registered.id);
    expect(analysed.view).toMatchObject({ status: "validated", failureReason: null, totalRows: 4, validRows: 4, invalidRows: 0 });
    expect(analysed.view.analysis!.errors).toEqual([]);
    expect(analysed.view.analysis!.warnings.map(warning => warning.field)).toEqual([...ignoredTables].sort());
    expect(analysed.view.analysis!.warnings.every(warning => warning.code === "XER_TABLE_IGNORED")).toBe(true);
    const confirming = await importer.dataImports.confirm({ ...scope, importId: registered.id });
    const imported = confirming.status === "importing" ? (await pollUntilDone(importer, registered.id)).view : await importer.dataImports.progress({ ...scope, importId: registered.id });
    expect(imported).toMatchObject({ status: "completed", createdRows: 4 });
    expect(await count("wbs_items")).toBeGreaterThanOrEqual(2); expect(await count("activities")).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it("a file that fails shows WHY: the object changes after registration, the job fails with a reason code, and the same file can be sent again", async () => {
    const importer = callerFor(users.importer, "ijb-importer");
    const xer = syntheticXer(64 * 1024, 5);
    s3.hold(1);
    const { target, registered } = await upload(importer, { name: "tampered.xer", bytes: xer.bytes, format: "xer" });
    s3.objects.set(target.uploadKey, { ...s3.objects.get(target.uploadKey)!, body: Buffer.from("something else entirely") });
    s3.release();
    const outcome = await pollUntilDone(importer, registered.id);
    expect(outcome.view).toMatchObject({ status: "failed", failureReason: "PROJECT_OS_IMPORT_FILE_INVALID", progressStage: null });
    const [[audit]] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'data_import_failed'", [T, registered.id]);
    expect(JSON.parse(audit.metadata)).toMatchObject({ reason: "PROJECT_OS_IMPORT_FILE_INVALID" });
    // the dead row released its hash: the genuine file goes through
    const again = await upload(importer, { name: "tampered.xer", bytes: xer.bytes, format: "xer" });
    expect((await pollUntilDone(importer, again.registered.id)).view).toMatchObject({ status: "validated" });
    // an unconfirmed copy never blocks another (2026-10-27): only a CONFIRMED import holds its file's hash, so there is no collision to report here
  }, 120_000);

  it("refuses what must not become an import: a key from another company, a traversal, nothing uploaded, an oversize object, a repeat of the same file", async () => {
    const importer = callerFor(users.importer, "ijb-importer");
    const base = { ...scope, moduleCode: "schedule" as const, fileName: "x.xer", sourceFormat: "xer" as const };
    await expect(importer.dataImports.registerUpload({ ...base, uploadKey: `imports/${T2}/${P2}/pending/abc/x.xer` })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    await expect(importer.dataImports.registerUpload({ ...base, uploadKey: `imports/${T}/${P}/pending/../../${T2}/x.xer` })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    await expect(importer.dataImports.registerUpload({ ...base, uploadKey: `imports/${T}/${P}/pending/never-uploaded/x.xer` })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_MISSING");
    const big = `imports/${T}/${P}/pending/too-big/x.xer`;
    s3.objects.set(big, { body: Buffer.alloc(MAX_DIRECT_UPLOAD_BYTES + 1), type: "text/plain", modified: new Date() });
    await expect(importer.dataImports.registerUpload({ ...base, uploadKey: big })).rejects.toThrow("PROJECT_OS_IMPORT_FILE_TOO_LARGE");
    expect(s3.objects.has(big)).toBe(false); // an oversize object is not kept
    const empty = `imports/${T}/${P}/pending/empty/x.xer`;
    s3.objects.set(empty, { body: Buffer.alloc(0), type: "text/plain", modified: new Date() });
    await expect(importer.dataImports.registerUpload({ ...base, uploadKey: empty })).rejects.toThrow("PROJECT_OS_IMPORT_FILE_INVALID");
    const xer = syntheticXer(32 * 1024, 3);
    const first = await upload(importer, { name: "same.xer", bytes: xer.bytes, format: "xer" }, { duplicateMode: "upsert" }); // upsert: earlier tests of this file already created these codes
    await pollUntilDone(importer, first.registered.id);
    // an unconfirmed copy does not block the same file (owner order 2026-10-27) ...
    const early = await upload(importer, { name: "same-early.xer", bytes: xer.bytes, format: "xer" });
    expect((await pollUntilDone(importer, early.registered.id)).view.status).toBe("validated");
    // ... a CONFIRMED one does
    const confirming = await importer.dataImports.confirm({ ...scope, importId: first.registered.id });
    if (confirming.status === "importing") await pollUntilDone(importer, first.registered.id);
    expect((await rowOf(first.registered.id)).status).toBe("completed");
    await expect(upload(importer, { name: "same-again.xer", bytes: xer.bytes, format: "xer" })).rejects.toThrow("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
    const objectsFor = Array.from(s3.objects.keys()).filter(key => key.startsWith(`imports/${T}/${P}/pending/`) && key.endsWith("same-again.xer"));
    expect(objectsFor).toEqual([]); // the duplicate's object was removed
  }, 120_000);

  it("is closed to people without the import permission, to other companies, and to an expired URL", async () => {
    const reader = callerFor(users.reader, "ijb-reader"); const stranger = callerFor(users.stranger, "ijb-stranger"); const importer = callerFor(users.importer, "ijb-importer");
    const request = { ...scope, moduleCode: "schedule" as const, fileName: "x.xer", sourceFormat: "xer" as const };
    await expect(reader.dataImports.createUpload(request)).rejects.toThrow();
    await expect(stranger.dataImports.createUpload(request)).rejects.toThrow();
    const imported = (await connection.query<{ id: string }[]>("SELECT id FROM data_imports WHERE tenantId = ? AND status = 'validated' LIMIT 1", [T]))[0][0].id;
    await expect(stranger.dataImports.progress({ ...scope, importId: imported })).rejects.toThrow();
    await expect(reader.dataImports.progress({ ...scope, importId: imported })).resolves.toMatchObject({ id: imported }); // a reader may watch
    await expect(reader.dataImports.confirm({ ...scope, importId: imported })).rejects.toThrow();
    const target = await importer.dataImports.createUpload(request);
    s3.clock.now = () => Date.now() + 16 * 60 * 1000; // past the 15-minute life of the URL
    const late = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: "late" });
    s3.clock.now = () => Date.now();
    expect(late.status).toBe(403);
    expect(s3.objects.has(target.uploadKey)).toBe(false);
  }, 60_000);

  it("revives a dead job from a poll, leaves a live one alone, and fails one that has used up its attempts", async () => {
    const importer = callerFor(users.importer, "ijb-importer"); const reader = callerFor(users.reader, "ijb-reader");
    const xer = syntheticXer(48 * 1024, 4);
    s3.hold(1);
    const { registered } = await upload(importer, { name: "stalled.xer", bytes: xer.bytes, format: "xer" });
    // the first job is parked on its read; to the database it looks alive, so a poll must not start a second run
    const live = await importer.dataImports.progress({ ...scope, importId: registered.id });
    expect(live.status).toBe("analyzing");
    expect(s3.requests.filter(request => request.method === "GET" && request.key.endsWith("stalled.xer")).length).toBeLessThanOrEqual(2);
    s3.release();
    expect((await pollUntilDone(importer, registered.id)).view.status).toBe("validated");

    // simulate a function killed at its time limit: in flight, heartbeat older than the stall window, one attempt used
    const killedAnalysis = async (attempts: number) => {
      await connection.query("UPDATE data_imports SET status = 'analyzing', progressStage = 'parsing', progressPercent = 30, attempts = ?, heartbeatAt = NOW() - INTERVAL '10 minutes', updatedAt = NOW() - INTERVAL '10 minutes' WHERE id = ?", [attempts, registered.id]);
    };
    await killedAnalysis(1);
    await expect(reader.dataImports.progress({ ...scope, importId: registered.id })).resolves.toMatchObject({ status: "analyzing" }); // a reader sees it but does not revive it
    expect((await rowOf(registered.id)).attempts).toBe(1);
    const revived = await pollUntilDone(importer, registered.id);
    expect(revived.view.status).toBe("validated");
    expect((await rowOf(registered.id)).attempts).toBeGreaterThanOrEqual(2);

    await killedAnalysis(IMPORT_JOB_MAX_ATTEMPTS);
    const failed = await importer.dataImports.progress({ ...scope, importId: registered.id });
    expect(failed).toMatchObject({ status: "failed", failureReason: "PROJECT_OS_IMPORT_JOB_STALLED" });
    expect(IMPORT_JOB_STALL_MS).toBeGreaterThan(300 * 1000); // longer than any function can live, so a running job is never taken for a dead one
  }, 120_000);

  it("the sweep revives dead jobs, fails exhausted ones, and removes uploads nobody registered — never one that is registered", async () => {
    const importer = callerFor(users.importer, "ijb-importer");
    const xer = syntheticXer(40 * 1024, 4);
    const { registered, target } = await upload(importer, { name: "sweep.xer", bytes: xer.bytes, format: "xer" });
    await pollUntilDone(importer, registered.id);
    const orphan = `imports/${T}/${P}/pending/orphan/old.xer`; const fresh = `imports/${T}/${P}/pending/fresh/new.xer`;
    s3.objects.set(orphan, { body: Buffer.from("x"), type: "text/plain", modified: new Date(Date.now() - ORPHAN_UPLOAD_MAX_AGE_MS - 60_000) });
    s3.objects.set(fresh, { body: Buffer.from("x"), type: "text/plain", modified: new Date() });
    s3.objects.get(target.uploadKey)!.modified = new Date(Date.now() - 3 * ORPHAN_UPLOAD_MAX_AGE_MS); // old, but a row points at it
    await connection.query("UPDATE data_imports SET status = 'importing', attempts = ?, heartbeatAt = NOW() - INTERVAL '10 minutes', updatedAt = NOW() - INTERVAL '10 minutes' WHERE id = ?", [IMPORT_JOB_MAX_ATTEMPTS, registered.id]);
    const outcome = await sweepImportJobs();
    expect(outcome).toMatchObject({ failed: 1, orphansRemoved: 1 });
    expect((await rowOf(registered.id)).status).toBe("failed");
    expect(s3.objects.has(orphan)).toBe(false);
    expect(s3.objects.has(fresh)).toBe(true);
    expect(s3.objects.has(target.uploadKey)).toBe(true);
  }, 120_000);
});

import { deflateSync } from "node:zlib";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { MAX_DIRECT_UPLOAD_BYTES } from "./storage";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// G-139 on a real database: the PMC files and the master-plan files no longer travel inside a request. They go browser → Storage by a signed URL (a REAL HTTP PUT),
// are analysed by a background job whose progress the screen polls, and are written by a second job after the person confirms. Synthetic data only.
const T = "79200000-0000-4000-8000-0000000000a1";
const P = "79200000-0000-4000-8000-0000000000a2";
const T2 = "79200000-0000-4000-8000-0000000000b1";
const P2 = "79200000-0000-4000-8000-0000000000b2";
const MP = "79200000-0000-4000-8000-0000000000c1";
const MPV = "79200000-0000-4000-8000-0000000000c2";
const MPV_OTHER = "79200000-0000-4000-8000-0000000000c3";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { pmc: 0, importer: 0, planner: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@ext.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
type Caller = ReturnType<typeof callerFor>;
const scope = { tenantId: T, projectId: P };

async function clear() {
  for (const tenant of [T, T2]) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [tenant]);
    await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [tenant]);
    for (const table of ["document_versions", "project_documents", "pmc_site_plans", "pmc_unit_activity_history", "pmc_unit_activity_progress", "pmc_units", "pmc_blocks", "pmc_zones", "master_plan_spatial_entities", "master_plan_versions", "master_plans"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [tenant]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM companies WHERE id = ?", [tenant]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'ext-%'");
}

/** What the browser does: ask for the URL, PUT the bytes to it (real HTTP), register the upload. */
async function upload(caller: Caller, moduleCode: "pmc.locations" | "pmc.status" | "masterPlanMapping" | "masterPlanSpatial", file: { name: string; bytes: Buffer; format: "xlsx" | "csv" }, context?: { masterPlanVersionId: string }) {
  const target = await caller.dataImports.createUpload({ ...scope, moduleCode, fileName: file.name, sourceFormat: file.format, context });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file.bytes });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return { target, registered: await caller.dataImports.registerUpload({ ...scope, moduleCode, fileName: file.name, sourceFormat: file.format, uploadKey: target.uploadKey, context }) };
}
/** What the screen does: poll until the job leaves its in-flight status, remembering every distinct state it saw. */
async function pollUntilDone(caller: Caller, importId: string, timeoutMs = 300_000) {
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
function png(width: number, height: number) {
  const table = Array.from({ length: 256 }, (_unused, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer: Buffer) => { let c = 0xffffffff; for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.alloc((width + 1) * height, 200))), chunk("IEND", Buffer.alloc(0))]);
}
/** The browser's half of an attachment / site-plan upload: ask for the URL, PUT the bytes (a real HTTP PUT). */
async function putDirect(caller: Caller, input: { tenantId: string; projectId: string; purpose: "document" | "sitePlan"; fileName: string; contentType: string }, bytes: Buffer) {
  const target = await caller.directUploads.create(input);
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: bytes });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return target;
}
const count = async (table: string) => Number((await connection.query<{ n: number }[]>(`SELECT COUNT(*) AS n FROM ${table} WHERE tenantId = ?`, [T]))[0][0].n);

/** A unit-locations CSV of at least `targetBytes`. The zone / block NAMES are read only the first time a code appears, so padding them on later rows makes the file big without changing what it means. */
function locationsCsv(rows: number, targetBytes: number) {
  const padding = "x".repeat(Math.max(0, Math.ceil((targetBytes / rows - 40) / 2))); // two padded names per row: ASCII, so the size in bytes is the size in characters
  const lines = ["Zone Code,Zone Name,Block Code,Block Name,Unit Number,Model Code"];
  for (let unit = 1; unit <= rows; unit += 1) {
    const block = `B${Math.ceil(unit / 500)}`;
    lines.push(`Z1,${unit === 1 ? "Zone 1" : padding},${block},${unit % 500 === 1 ? `Block ${block}` : padding},${unit},A`);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("PMC and master-plan imports through the direct-upload path (G-139)", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('ext-pmc','Pmc','ext-pmc@ext.example.test','user'),('ext-importer','Importer','ext-importer@ext.example.test','user'),('ext-planner','Planner','ext-planner@ext.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'ext-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.pmc = idOf("ext-pmc"); users.importer = idOf("ext-importer"); users.planner = idOf("ext-planner");
    for (const [tenant, slug] of [[T, "ext-tenant"], [T2, "ext-other"]] as const) await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, ?, ?)", [tenant, slug, slug]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'EX-A', 'Ext project', 'villas', 'SAR', 'active'), (?, ?, 'EX-B', 'Other tenant project', 'villas', 'SAR', 'active')", [P, T, P2, T2]);
    for (const [tenant, tag] of [[T, "a"], [T2, "b"]] as const) {
      await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`ext-sub-${tag}`, tenant]);
      await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`ext-ent-${tag}`, tenant, `ext-sub-${tag}`]);
    }
    for (const code of ["project.read", "project.pmc.manage", "project.wbs.manage", "project.write"]) await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT') ON CONFLICT DO NOTHING", [code, code]);
    // pmc: PMC manager only. importer: general importer only (WBS). planner: master-plan writer only.
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('ext-r-pmc', ?, 'EXT_PMC','Pmc','PROJECT'), ('ext-r-importer', ?, 'EXT_IMPORTER','Importer','PROJECT'), ('ext-r-planner', ?, 'EXT_PLANNER','Planner','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'ext-r-pmc', id FROM permissions WHERE code IN ('project.read','project.pmc.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'ext-r-importer', id FROM permissions WHERE code IN ('project.read','project.wbs.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'ext-r-planner', id FROM permissions WHERE code IN ('project.read','project.write')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('ext-m-pmc', ?, ?, 'active'), ('ext-m-importer', ?, ?, 'active'), ('ext-m-planner', ?, ?, 'active')", [T, users.pmc, T, users.importer, T, users.planner]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('ext-mr-pmc','ext-m-pmc','ext-r-pmc','company'),('ext-mr-importer','ext-m-importer','ext-r-importer','company'),('ext-mr-planner','ext-m-planner','ext-r-planner','company')");
    await connection.query("INSERT INTO master_plans (id, tenantId, projectId, code, title, createdByUserId) VALUES (?, ?, ?, 'MP-1', 'Master plan', ?)", [MP, T, P, users.planner]);
    await connection.query("INSERT INTO master_plan_versions (id, tenantId, projectId, masterPlanId, versionNumber, versionKind, uploadedByUserId) VALUES (?, ?, ?, ?, 1, 'original', ?)", [MPV, T, P, MP, users.planner]);
    await connection.query("INSERT INTO master_plan_spatial_entities (id, tenantId, projectId, masterPlanVersionId, code, name, entityType, geometry) VALUES ('ext-e1', ?, ?, ?, 'V-1', 'Villa 1', 'unit', '{}'), ('ext-e2', ?, ?, ?, 'V-2', 'Villa 2', 'unit', '{}')", [T, P, MPV, T, P, MPV]);
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("a 30 MB PMC file: signed-URL upload, background analysis with visible progress, then a background write — every unit lands", async () => {
    const pmc = callerFor(users.pmc, "ext-pmc");
    const file = locationsCsv(60_000, 33 * 1024 * 1024);
    expect(file.length).toBeGreaterThanOrEqual(30 * 1024 * 1024);
    s3.hold(1); // registration reads the file once to hash it; the job's own read waits, so the in-flight state can be seen
    const { target, registered } = await upload(pmc, "pmc.locations", { name: "units-30mb.csv", bytes: file, format: "csv" });
    expect(target.maxBytes).toBe(MAX_DIRECT_UPLOAD_BYTES);
    expect(registered).toMatchObject({ status: "analyzing" });
    const inFlight = await pmc.dataImports.progress({ ...scope, importId: registered.id });
    expect(inFlight).toMatchObject({ status: "analyzing", failureReason: null });
    expect(inFlight.progressPercent).toBeGreaterThan(0); expect(inFlight.progressPercent).toBeLessThan(100);
    s3.release();
    const analysed = await pollUntilDone(pmc, registered.id);
    expect(analysed.view).toMatchObject({ status: "validated", progressPercent: 100, failureReason: null, totalRows: 60_000, validRows: 60_000, invalidRows: 0 });
    expect(analysed.view.external).toMatchObject({ canConfirm: true, report: { pmc: { kind: "locations", errorCount: 0, counts: { create: 60_000, update: 0, unchanged: 0 } } } });
    expect(await count("pmc_units")).toBe(0); // the analysis wrote nothing

    const confirming = await pmc.dataImports.confirm({ ...scope, importId: registered.id });
    expect(confirming).toMatchObject({ id: registered.id, status: "importing" }); // above the synchronous threshold: a job, not an answer
    const imported = await pollUntilDone(pmc, registered.id);
    expect(imported.view).toMatchObject({ status: "completed", createdRows: 60_000, updatedRows: 0, skippedRows: 0, failureReason: null });
    expect(imported.seen.map(state => state.status)).toContain("importing");
    expect(await count("pmc_units")).toBe(60_000);
    expect(await count("pmc_blocks")).toBe(120);
    const [audit] = await connection.query<{ action: string }[]>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ? ORDER BY createdAt", [T, registered.id]);
    expect(audit.map(row => row.action)).toEqual(["data_import_uploaded", "data_import_completed"]);
  }, 600_000);

  it("a file that fails the importer's own rules is shown with its errors and cannot be confirmed; nothing is written", async () => {
    const pmc = callerFor(users.pmc, "ext-pmc");
    const bad = Buffer.from("Unit Number,Activity Code,Status\n1,NO-SUCH-ACTIVITY,COMPLETE\n9999,NO-SUCH-ACTIVITY,COMPLETE\n", "utf8");
    const { registered } = await upload(pmc, "pmc.status", { name: "status-bad.csv", bytes: bad, format: "csv" });
    const { view } = await pollUntilDone(pmc, registered.id);
    expect(view).toMatchObject({ status: "uploaded" });
    expect(view.analysis!.errorsTotal).toBeGreaterThan(0);
    await expect(pmc.dataImports.confirm({ ...scope, importId: registered.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_CONFIRMABLE");
    expect(await count("pmc_unit_activity_progress")).toBe(0);
  }, 60_000);

  it("each module keeps its OWN gate: the general importer cannot upload or confirm a PMC file, and the PMC manager needs no import permission", async () => {
    const importer = callerFor(users.importer, "ext-importer");
    const pmc = callerFor(users.pmc, "ext-pmc");
    await expect(importer.dataImports.createUpload({ ...scope, moduleCode: "pmc.locations", fileName: "u.csv", sourceFormat: "csv" })).rejects.toThrow();
    // an upload made by the PMC manager is visible to, but not actionable by, a person who only holds the general import permission
    const { registered } = await upload(pmc, "pmc.locations", { name: "units-small.csv", bytes: locationsCsv(3, 400), format: "csv" });
    await pollUntilDone(pmc, registered.id);
    await expect(importer.dataImports.confirm({ ...scope, importId: registered.id })).rejects.toThrow();
    await expect(importer.dataImports.reanalyze({ ...scope, importId: registered.id, mappingOverride: {} })).rejects.toThrow();
    expect(await count("pmc_units")).toBe(60_000); // still only the first test's units: the small file was never confirmed
    // …and the general module still works for the general importer (the old path is untouched)
    const wbs = await importer.dataImports.createUpload({ ...scope, moduleCode: "wbs", fileName: "w.csv", sourceFormat: "csv" });
    expect(wbs.maxBytes).toBe(MAX_DIRECT_UPLOAD_BYTES);
    // a PMC import cannot be uploaded in the XER format
    await expect(pmc.dataImports.createUpload({ ...scope, moduleCode: "pmc.locations", fileName: "u.xer", sourceFormat: "xer" })).rejects.toThrow();
  }, 60_000);

  it("a small file is written inside the confirm request, and re-confirming a file the project already holds changes nothing", async () => {
    const pmc = callerFor(users.pmc, "ext-pmc");
    const csv = Buffer.from("Zone Code,Zone Name,Block Code,Block Name,Unit Number,Model Code\nZ9,Zone 9,BX1,Block X1,70001,A\nZ9,,BX1,,70002,A\n", "utf8");
    const { registered } = await upload(pmc, "pmc.locations", { name: "units-two.csv", bytes: csv, format: "csv" });
    const analysed = await pollUntilDone(pmc, registered.id);
    expect(analysed.view.analysis?.errors).toEqual([]);
    expect(analysed.view).toMatchObject({ status: "validated", totalRows: 2 });
    const done = await pmc.dataImports.confirm({ ...scope, importId: registered.id });
    expect(done).toMatchObject({ status: "completed", createdRows: 2 });
    expect(await count("pmc_units")).toBe(60_002);
    // the same rows in a different file: valid, but the project already holds them → nothing to confirm
    const again = await upload(pmc, "pmc.locations", { name: "units-two-again.csv", bytes: Buffer.from(`${csv.toString("utf8")}\n`, "utf8"), format: "csv" });
    const second = await pollUntilDone(pmc, again.registered.id);
    expect(second.view.external).toMatchObject({ canConfirm: false });
    await expect(pmc.dataImports.confirm({ ...scope, importId: again.registered.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOTHING_TO_CONFIRM");
    expect(await count("pmc_units")).toBe(60_002);
  }, 120_000);

  it("the master-plan mapping rides the same path: the version it belongs to is kept with the import, and another company's version is refused", async () => {
    const planner = callerFor(users.planner, "ext-planner");
    const csv = Buffer.from("Code,Status,Progress\nV-1,in_progress,40\nV-2,completed,100\n", "utf8");
    await expect(planner.dataImports.createUpload({ ...scope, moduleCode: "masterPlanMapping", fileName: "m.csv", sourceFormat: "csv" })).rejects.toThrow("PROJECT_OS_IMPORT_CONTEXT_REQUIRED");
    await expect(planner.dataImports.createUpload({ ...scope, moduleCode: "masterPlanMapping", fileName: "m.csv", sourceFormat: "csv", context: { masterPlanVersionId: MPV_OTHER } })).rejects.toThrow("PROJECT_OS_MASTER_PLAN_VERSION_NOT_FOUND");
    const { registered } = await upload(planner, "masterPlanMapping", { name: "mapping.csv", bytes: csv, format: "csv" }, { masterPlanVersionId: MPV });
    const analysed = await pollUntilDone(planner, registered.id);
    expect(analysed.view).toMatchObject({ status: "validated", totalRows: 2, validRows: 2 });
    const done = await planner.dataImports.confirm({ ...scope, importId: registered.id });
    expect(done).toMatchObject({ status: "completed", updatedRows: 2 });
    const [entities] = await connection.query<{ code: string; status: string; progressPercent: string }[]>("SELECT code, status, progressPercent FROM master_plan_spatial_entities WHERE tenantId = ? ORDER BY code", [T]);
    expect(entities.map(entity => [entity.code, entity.status, Number(entity.progressPercent)])).toEqual([["V-1", "in_progress", 40], ["V-2", "completed", 100]]);
    // a person without the master-plan permission cannot use it (the PMC manager holds a different permission)
    await expect(callerFor(users.pmc, "ext-pmc").dataImports.createUpload({ ...scope, moduleCode: "masterPlanMapping", fileName: "m.csv", sourceFormat: "csv", context: { masterPlanVersionId: MPV } })).rejects.toThrow();
  }, 60_000);

  it("the master-plan entities file rides the same path and creates the entities in the version it was uploaded for", async () => {
    const planner = callerFor(users.planner, "ext-planner");
    const csv = Buffer.from("Code,Name,Type,X,Y,Width,Height\nV-10,Villa 10,unit,1,1,5,5\nV-11,Villa 11,unit,10,1,5,5\n", "utf8");
    const { registered } = await upload(planner, "masterPlanSpatial", { name: "entities.csv", bytes: csv, format: "csv" }, { masterPlanVersionId: MPV });
    const analysed = await pollUntilDone(planner, registered.id);
    expect(analysed.view.analysis?.errors).toEqual([]);
    expect(analysed.view).toMatchObject({ status: "validated", totalRows: 2, validRows: 2 });
    expect(await planner.dataImports.confirm({ ...scope, importId: registered.id })).toMatchObject({ status: "completed", createdRows: 2 });
    const [codes] = await connection.query<{ code: string }[]>("SELECT code FROM master_plan_spatial_entities WHERE tenantId = ? AND masterPlanVersionId = ? ORDER BY code", [T, MPV]);
    expect(codes.map(row => row.code)).toEqual(["V-1", "V-10", "V-11", "V-2"]);
  }, 60_000);

  it("a 20 MB document attachment goes straight to storage; the document keeps its content, and the pending object is removed", async () => {
    const planner = callerFor(users.planner, "ext-planner");
    const bytes = Buffer.alloc(20 * 1024 * 1024, 7);
    const target = await putDirect(planner, { ...scope, purpose: "document", fileName: "specification.pdf", contentType: "application/pdf" }, bytes);
    expect(target.maxBytes).toBe(MAX_DIRECT_UPLOAD_BYTES);
    const created = await planner.documents.createWithVersion({ ...scope, documentNumber: "SPEC-001", title: "Specification", category: "specification", originalName: "specification.pdf", mimeType: "application/pdf", uploadKey: target.uploadKey });
    expect(created).toMatchObject({ versionNumber: 1 });
    const [versions] = await connection.query<{ sizeBytes: string; storageKey: string; checksumSha256: string }[]>("SELECT sizeBytes, storageKey, checksumSha256 FROM document_versions WHERE tenantId = ? AND documentId = ?", [T, created.id]);
    expect(Number(versions[0].sizeBytes)).toBe(20 * 1024 * 1024);
    expect(versions[0].storageKey).toContain(`/documents/${created.id}/v1/`);
    expect(versions[0].storageKey).not.toContain("/pending/");
    // the same attachment cannot be used twice: the pending object is gone, so a second use finds nothing
    await expect(planner.documents.addVersion({ ...scope, documentId: created.id, originalName: "again.pdf", mimeType: "application/pdf", uploadKey: target.uploadKey })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_MISSING");
    // a new version can ride the same path
    const second = await putDirect(planner, { ...scope, purpose: "document", fileName: "specification-v2.pdf", contentType: "application/pdf" }, Buffer.alloc(11 * 1024 * 1024, 9));
    await expect(planner.documents.addVersion({ ...scope, documentId: created.id, originalName: "specification-v2.pdf", mimeType: "application/pdf", uploadKey: second.uploadKey })).resolves.toMatchObject({ versionNumber: 2 });
  }, 120_000);

  it("an upload key is good only for the company, project and purpose it was issued for, and only to someone allowed to attach", async () => {
    const planner = callerFor(users.planner, "ext-planner");
    const importer = callerFor(users.importer, "ext-importer"); // holds project.wbs.manage, not project.write
    await expect(importer.directUploads.create({ ...scope, purpose: "document", fileName: "a.pdf", contentType: "application/pdf" })).rejects.toThrow();
    const target = await putDirect(planner, { ...scope, purpose: "document", fileName: "a.pdf", contentType: "application/pdf" }, Buffer.alloc(2048, 1));
    // a key made for a document is not a site plan, and a made-up key under another project is refused before anything is read
    const pmc = callerFor(users.pmc, "ext-pmc");
    await expect(pmc.pmc.uploadSitePlan({ ...scope, fileName: "p.png", uploadKey: target.uploadKey })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    await expect(planner.documents.createWithVersion({ ...scope, documentNumber: "X-1", title: "Stolen", category: "other", originalName: "a.pdf", mimeType: "application/pdf", uploadKey: `uploads/${T2}/${P2}/document/pending/x/a.pdf` })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    await expect(planner.documents.createWithVersion({ ...scope, documentNumber: "X-2", title: "Traversal", category: "other", originalName: "a.pdf", mimeType: "application/pdf", uploadKey: `${target.uploadKey}/../../../x` })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    await expect(planner.directUploads.create({ ...scope, purpose: "sitePlan", fileName: "p.png", contentType: "image/png" })).rejects.toThrow(); // the planner has no PMC permission
    await expect(pmc.directUploads.create({ ...scope, purpose: "sitePlan", fileName: "p.svg", contentType: "image/svg+xml" })).rejects.toThrow("PROJECT_OS_UPLOAD_TYPE_INVALID");
  }, 60_000);

  it("a site plan image rides the same path and keeps its size, format and dimension rules", async () => {
    const pmc = callerFor(users.pmc, "ext-pmc");
    const good = await putDirect(pmc, { ...scope, purpose: "sitePlan", fileName: "site plan.png", contentType: "image/png" }, png(400, 300));
    await expect(pmc.pmc.uploadSitePlan({ ...scope, fileName: "site plan.png", uploadKey: good.uploadKey })).resolves.toMatchObject({ widthPx: 400, heightPx: 300, mimeType: "image/png" });
    const tiny = await putDirect(pmc, { ...scope, purpose: "sitePlan", fileName: "tiny.png", contentType: "image/png" }, png(40, 40));
    await expect(pmc.pmc.uploadSitePlan({ ...scope, fileName: "tiny.png", uploadKey: tiny.uploadKey })).rejects.toThrow("PROJECT_OS_PMC_PLAN_DIMENSIONS_INVALID");
    const huge = await putDirect(pmc, { ...scope, purpose: "sitePlan", fileName: "huge.png", contentType: "image/png" }, Buffer.concat([png(400, 300), Buffer.alloc(9 * 1024 * 1024)]));
    await expect(pmc.pmc.uploadSitePlan({ ...scope, fileName: "huge.png", uploadKey: huge.uploadKey })).rejects.toThrow("PROJECT_OS_PMC_PLAN_FILE_INVALID");
  }, 60_000);
});

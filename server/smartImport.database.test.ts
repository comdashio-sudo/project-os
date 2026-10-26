import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { createServer, type Server } from "node:http";
import { buildSamples, type Sample } from "./domain/smartImport/fixtures";

// Work order 20, smart import: the whole path on a real database and a real HTTP upload — the original file goes to Storage by a signed URL, is understood,
// the person's approval writes it in the existing importer's template, the importer's own job validates it, and the original stays linked to what it wrote.
// Synthetic files only (server/domain/smartImport/fixtures.ts); nothing here is a real company's data.
const T = "79000000-0000-4000-8000-0000000000c1";
const T2 = "79000000-0000-4000-8000-0000000000d1";
const P = "79000000-0000-4000-8000-0000000000c2";
const P2 = "79000000-0000-4000-8000-0000000000d2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
let samples: Sample[];
const users = { importer: 0, reader: 0, stranger: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@smart.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const sample = (id: string) => samples.find(item => item.id === id)!;

async function clear() {
  for (const tenant of [T, T2]) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM smart_reading_usage WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM import_source_profiles WHERE tenantId = ?", [tenant]);
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'smi-%'");
}

type Caller = ReturnType<typeof callerFor>;
/** What the browser does: ask for the URL, then PUT the bytes to it (real HTTP). */
async function upload(caller: Caller, file: { fileName: string; bytes: Uint8Array }, where = scope) {
  const target = await caller.smartImport.createUpload({ ...where, fileName: file.fileName });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(file.bytes) });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return target;
}
/** What the person's corrections look like on the wire: the analysis's own column map, index -> field key. */
const forcedOf = (columns: Array<{ index: number; fieldKey: string | null }>) => Object.fromEntries(columns.map(column => [String(column.index), column.fieldKey]));
async function pollUntilDone(caller: Caller, importId: string) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const view = await caller.dataImports.progress({ ...scope, importId });
    if (view.status !== "analyzing" && view.status !== "importing") return view;
    if (Date.now() > deadline) throw new Error(`job still ${view.status}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const one = async <T,>(sql: string, params: unknown[]) => (await connection.query<any[]>(sql, params))[0] as T[];

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("smart import on a real database", () => {
  beforeAll(async () => {
    samples = await buildSamples();
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket, llmEnabled: false });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('smi-importer','Importer','smi-importer@smart.example.test','user'),('smi-reader','Reader','smi-reader@smart.example.test','user'),('smi-stranger','Stranger','smi-stranger@smart.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'smi-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.importer = idOf("smi-importer"); users.reader = idOf("smi-reader"); users.stranger = idOf("smi-stranger");
    for (const [tenant, slug] of [[T, "smart-tenant"], [T2, "smart-other"]] as const) await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, ?, ?)", [tenant, slug, slug]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'SM-A', 'Smart project', 'villas', 'SAR', 'active'), (?, ?, 'SM-B', 'Other tenant project', 'villas', 'SAR', 'active')", [P, T, P2, T2]);
    for (const [tenant, tag] of [[T, "a"], [T2, "b"]] as const) {
      await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`smi-sub-${tag}`, tenant]);
      await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`smi-ent-${tag}`, tenant, `smi-sub-${tag}`]);
    }
    for (const code of ["project.read", "project.schedule.manage", "project.wbs.manage", "project.budget.manage", "project.commitment.manage", "project.procurement.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('smi-r-importer', ?, 'SMI_IMPORTER','Importer','PROJECT'), ('smi-r-reader', ?, 'SMI_READER','Reader','PROJECT'), ('smi-r-stranger', ?, 'SMI_STRANGER','Stranger','PROJECT')", [T, T, T2]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'smi-r-importer', id FROM permissions WHERE code IN ('project.read','project.schedule.manage','project.wbs.manage','project.budget.manage','project.commitment.manage','project.procurement.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'smi-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'smi-r-stranger', id FROM permissions WHERE code IN ('project.read','project.schedule.manage','project.wbs.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('smi-m-importer', ?, ?, 'active'), ('smi-m-reader', ?, ?, 'active'), ('smi-m-stranger', ?, ?, 'active')", [T, users.importer, T, users.reader, T2, users.stranger]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('smi-mr-importer','smi-m-importer','smi-r-importer','company'),('smi-mr-reader','smi-m-reader','smi-r-reader','company'),('smi-mr-stranger','smi-m-stranger','smi-r-stranger','company')");
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("a contractor's BOQ (logo, merged cells, Indic digits): analysed, corrected-by-approval, imported by the existing importer, the original linked, the profile remembered and applied to the next file", async () => {
    const importer = callerFor(users.importer, "smi-importer");
    const file = sample("boq-ar-contractor");
    const target = await upload(importer, file);
    const analysis = await importer.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName });
    expect(analysis.understanding.kind).toBe("boq");
    expect(analysis.profile).toBeNull();
    expect(analysis.understanding.table!.mergedFilled).toBeGreaterThanOrEqual(file.minMergedFilled ?? 0);
    expect(analysis.understanding.table!.rows).toBe(file.expectedRows);

    const confirmed = await importer.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName, kind: "boq", sheet: analysis.understanding.sheet ?? undefined, forced: forcedOf(analysis.understanding.columns) as never, profileName: "جدول كميات مقاول المثال" });
    expect(confirmed).toMatchObject({ module: "wbs", status: "analyzing" });
    expect(confirmed.rowsSent + confirmed.rowsExcluded).toBe(file.expectedRows);
    expect(confirmed.notes).toContain("BOQ_QUANTITY_AND_RATE_NOT_CARRIED");
    const view = await pollUntilDone(importer, confirmed.importId);
    expect(view).toMatchObject({ status: "validated", failureReason: null, validRows: confirmed.rowsSent, invalidRows: 0 });

    const [source] = await one<{ sourceKey: string; sourceName: string; detectedKind: string; profileId: string; mergedCellsFilled: number }>("SELECT * FROM data_import_sources WHERE importId = ?", [confirmed.importId]);
    expect(source).toMatchObject({ sourceKey: target.uploadKey, sourceName: file.fileName, detectedKind: "boq" });
    expect(Number(source.mergedCellsFilled)).toBeGreaterThanOrEqual(file.minMergedFilled ?? 0);
    const audit = await one<{ action: string }>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ? ORDER BY createdAt", [T, confirmed.importId]);
    expect(audit.map(row => row.action)).toContain("smart_import_confirmed");

    // the same source sent again is recognised by its headers and read with the saved map, without anyone correcting anything
    const again = await upload(importer, file);
    const second = await importer.smartImport.analyze({ ...scope, uploadKey: again.uploadKey, fileName: file.fileName });
    expect(second.profile).toMatchObject({ name: "جدول كميات مقاول المثال", timesUsed: 1 });
    expect(second.understanding.columns.map(column => column.fieldKey)).toEqual(analysis.understanding.columns.map(column => column.fieldKey));

    // approved import → the original is reachable from what the import wrote (a short-lived signed link to the original, not the translated file)
    await importer.dataImports.confirm({ ...scope, importId: confirmed.importId });
    const done = await pollUntilDone(importer, confirmed.importId);
    expect(done.status).toBe("completed");
    const [written] = await one<{ entityId: string }>("SELECT entityId FROM data_import_row_results WHERE importId = ? AND entityId IS NOT NULL LIMIT 1", [confirmed.importId]);
    const link = await importer.smartImport.source({ ...scope, entityId: written.entityId });
    expect(link).toMatchObject({ found: true, importId: confirmed.importId, fileName: file.fileName, kind: "boq" });
    if (!link.found) throw new Error("unreachable");
    const fetched = await fetch(link.url);
    expect(fetched.ok).toBe(true);
    expect(Buffer.from(await fetched.arrayBuffer()).equals(Buffer.from(file.bytes))).toBe(true); // byte for byte the file that was uploaded
    expect((await importer.smartImport.profiles(scope)).map(profile => profile.name)).toContain("جدول كميات مقاول المثال");
  }, 120_000);

  it("a Primavera XER is written in full by the P6 importer; a schedule, a materials CSV (Windows-1256), a budget and contracts each reach their importer", async () => {
    const importer = callerFor(users.importer, "smi-importer");
    const expectations: Array<[string, string, string]> = [["xer", "xer", "p6"], ["schedule-ar-hijri", "schedule", "schedule"], ["contracts-ar", "contracts", "contracts"], ["budget-ar", "budget", "budget"], ["materials-csv-1256", "materials", "materials"]];
    for (const [id, kind, module] of expectations) {
      const file = sample(id);
      const target = await upload(importer, file);
      const analysis = await importer.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName });
      expect(analysis.understanding.kind, id).toBe(kind);
      const confirmed = await importer.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName, kind: kind as never, sheet: analysis.understanding.sheet ?? undefined, forced: forcedOf(analysis.understanding.columns) as never });
      expect(confirmed.module, id).toBe(module);
      if (id === "xer") { expect(confirmed.status).toBe("completed"); console.log(`SMART IMPORT xer: written in full by the P6 importer (${confirmed.rowsSent} activity)`); continue; } // a P6 export is written in one transaction, not by a job
      const view = await pollUntilDone(importer, confirmed.importId);
      // the importer's own verdict is the truth: what it accepted is `validated`, and every row that failed says why
      console.log(`SMART IMPORT ${id}: kind=${kind} → ${module}; sent ${confirmed.rowsSent}, excluded ${confirmed.rowsExcluded}; importer: ${view.status} valid=${view.validRows} invalid=${view.invalidRows} notes=${confirmed.notes.join(",") || "-"}`);
      expect(view.status, id).toBe("validated");
      expect(view.invalidRows, id).toBe(0);
      expect(view.failureReason, id).toBeNull();
    }
  }, 240_000);

  it("a payment certificate is recognised but has no importer: refused with a clear code, nothing written; a PDF needs smart reading, which is off", async () => {
    const importer = callerFor(users.importer, "smi-importer");
    const before = Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [T]))[0].n);
    const file = sample("valuation-ar");
    const target = await upload(importer, file);
    const analysis = await importer.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName });
    expect(analysis.understanding.kind).toBe("valuation");
    await expect(importer.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName, kind: "valuation", forced: forcedOf(analysis.understanding.columns) as never })).rejects.toThrow("PROJECT_OS_SMART_IMPORT_NO_IMPORTER");
    expect(Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [T]))[0].n)).toBe(before);

    const pdf = await upload(importer, { fileName: "scan.pdf", bytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n") });
    const scanned = await importer.smartImport.analyze({ ...scope, uploadKey: pdf.uploadKey, fileName: "scan.pdf" });
    expect(scanned.understanding.kind).toBe("needsSmartReading");
    expect(scanned.smartReading).toEqual({ enabled: false });
    await expect(importer.smartImport.analyze({ ...scope, uploadKey: pdf.uploadKey, fileName: "scan.pdf", useAi: true })).rejects.toThrow("PROJECT_OS_SMART_READING_DISABLED");
  }, 60_000);

  it("the AI reading is built but OFF: when a provider is configured it quotes the cost first, reads a PDF into a table the ordinary reader understands, records the usage, and stops at the company's monthly cap", async () => {
    const importer = callerFor(users.importer, "smi-importer");
    const table = { headers: ["رقم البند", "الوصف", "الوحدة", "الكمية", "السعر", "الإجمالي"], rows: [["1", "حفر", "م3", "10", "5", "50"], ["2", "ردم", "م3", "20", "4", "80"]] };
    let calls = 0;
    const provider: Server = createServer((request, response) => { request.resume(); request.on("end", () => { calls += 1; response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ id: "x", created: 0, model: "fake", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(table) }, finish_reason: "stop" }] })); }); });
    await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
    const { port } = provider.address() as { port: number };
    const saved = { llmEnabled: ENV.llmEnabled, llmApiKey: ENV.llmApiKey, llmBaseUrl: ENV.llmBaseUrl, cap: ENV.smartReadingMonthlyCapUsd };
    try {
      Object.assign(ENV, { llmEnabled: true, llmApiKey: "test-only-key", llmBaseUrl: `http://127.0.0.1:${port}`, smartReadingMonthlyCapUsd: 0.05 });
      const pdf = await upload(importer, { fileName: "boq-scan.pdf", bytes: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n") });
      const quote = await importer.smartImport.analyze({ ...scope, uploadKey: pdf.uploadKey, fileName: "boq-scan.pdf" });
      expect(quote.understanding.kind).toBe("needsSmartReading");
      expect(quote.smartReading).toMatchObject({ enabled: true, withinCap: true, usedMicroUsd: 0, capMicroUsd: 50_000 });
      expect(calls).toBe(0); // the quote costs nothing
      const read = await importer.smartImport.analyze({ ...scope, uploadKey: pdf.uploadKey, fileName: "boq-scan.pdf", useAi: true });
      expect(calls).toBe(1);
      expect(read.understanding.kind).toBe("boq");
      expect(read.understanding.table!.rows).toBe(2);
      const [usage] = await one<{ calls: number; estimated_micro_usd: number }>("SELECT calls, estimated_micro_usd FROM smart_reading_usage WHERE tenantId = ?", [T]);
      expect(Number(usage.calls)).toBe(1);
      // 0.035 USD spent of 0.05: another file would cross the cap, so it is refused BEFORE any call to the provider
      await expect(importer.smartImport.analyze({ ...scope, uploadKey: pdf.uploadKey, fileName: "boq-scan.pdf", useAi: true })).rejects.toThrow("PROJECT_OS_SMART_READING_CAP_REACHED");
      expect(calls).toBe(1);
    } finally { Object.assign(ENV, { llmEnabled: saved.llmEnabled, llmApiKey: saved.llmApiKey, llmBaseUrl: saved.llmBaseUrl, smartReadingMonthlyCapUsd: saved.cap }); await new Promise(resolve => provider.close(resolve)); }
  }, 60_000);

  it("refuses: a reader without import permission, another company's object, a traversal, an unsupported extension, a required column left unmapped", async () => {
    const importer = callerFor(users.importer, "smi-importer");
    await expect(callerFor(users.reader, "smi-reader").smartImport.createUpload({ ...scope, fileName: "x.xlsx" })).rejects.toThrow();
    const file = sample("boq-ar-contractor");
    const target = await upload(importer, file);
    const analysis = await importer.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName });
    const stranger = callerFor(users.stranger, "smi-stranger");
    await expect(stranger.smartImport.analyze({ tenantId: T2, projectId: P2, uploadKey: target.uploadKey, fileName: file.fileName })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    await expect(importer.smartImport.analyze({ ...scope, uploadKey: target.uploadKey.replace("/smart/", "/smart/../smart/"), fileName: file.fileName })).rejects.toThrow("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    await expect(importer.smartImport.createUpload({ ...scope, fileName: "malware.exe" })).rejects.toThrow("PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED");
    await expect(importer.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: file.fileName, kind: "boq", forced: { ...forcedOf(analysis.understanding.columns), [String(analysis.understanding.columns.find(column => column.fieldKey === "code")!.index)]: null } as never })).rejects.toThrow("PROJECT_OS_SMART_IMPORT_REQUIRED_UNMAPPED");
    // an import nobody wrote is "not found" (said, not an empty answer); another company's real import is refused by tenant access, not leaked
    await expect(importer.smartImport.source({ ...scope, importId: "79000000-0000-4000-8000-00000000ffff" })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_FOUND");
    const [real] = await one<{ id: string }>("SELECT id FROM data_imports WHERE tenantId = ? LIMIT 1", [T]);
    await expect(stranger.smartImport.source({ tenantId: T, projectId: P, importId: real.id })).rejects.toThrow();
    await expect(stranger.smartImport.source({ tenantId: T2, projectId: P2, importId: real.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_FOUND");
  }, 60_000);
});

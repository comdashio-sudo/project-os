import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { ownerEditedWeights, ownerOriginalWeights } from "./testing/ownerWeightsFixtures";

// Q-56 (5): the owner's two weights files — (a) the original and (b) the edited copy, in the SHAPE of his real file (Q-48; synthetic, ownerWeightsFixtures) —
// through the path the screen uses (direct upload to storage → background analysis → confirm), on a real database, as the restricted role. Both are read
// with 0 rejected rows and saved; the report says, per model, how many activities and their total. Synthetic data only.
const SLUG = "q56-owner-files";
const P = "56a00000-0000-4000-8000-000000000001";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection; let s3: FakeS3; let tenantId = ""; let ownerId = 0;
const owner = () => appRouter.createCaller({ user: { id: ownerId, openId: "q56-owner", name: "Q56 Owner", email: "q56-owner@q56.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [id]);
    await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [id]);
    for (const table of ["data_imports", "audit_logs", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_stages", "pmc_groups", "pmc_units", "pmc_blocks", "pmc_zones", "import_templates"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId = 'q56-owner'");
}

type View = Awaited<ReturnType<ReturnType<typeof owner>["dataImports"]["progress"]>>;
type PmcReport = { errorCount: number; errors: Array<{ rowNumber: number; code: string; detail?: string }>; counts: { create: number; update: number; unchanged: number } };
const reportOf = (view: View) => (view.external?.report as { pmc?: PmcReport } | undefined)?.pmc;
async function settle(importId: string): Promise<View> {
  for (const deadline = Date.now() + 60_000; ;) {
    const view = await owner().dataImports.progress({ tenantId, projectId: P, importId });
    if (view.status !== "analyzing" && view.status !== "importing") return view;
    if (Date.now() > deadline) throw new Error(`still ${view.status}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
async function directImport(moduleCode: "pmc.locations" | "pmc.weights", name: string, bytes: Uint8Array) {
  const at = { tenantId, projectId: P };
  const target = await owner().dataImports.createUpload({ ...at, moduleCode, fileName: name, sourceFormat: "xlsx" });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(bytes) });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  const registered = await owner().dataImports.registerUpload({ ...at, moduleCode, fileName: name, sourceFormat: "xlsx", uploadKey: target.uploadKey });
  const analysed = await settle(registered.id);
  return { analysed, confirm: async () => { await owner().dataImports.confirm({ ...at, importId: registered.id }); return settle(registered.id); } };
}
async function villaList() {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Villas");
  for (const row of [["البلوك", "الفيلا", "النموذج"], ["B1", 1, "A"], ["B2", 2, "B"]]) sheet.addRow(row);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const activitiesOf = async () => (await connection.query<{ modelCode: string; n: number; total: string }[]>("SELECT modelCode, count(*)::int AS n, sum(weightPercent)::text AS total FROM pmc_activity_definitions WHERE tenantId = ? AND projectId = ? GROUP BY modelCode ORDER BY modelCode", [tenantId, P]))[0].map(row => `${row.modelCode}:${row.n}:${Number(row.total)}`);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-56 (5): the owner's two weights files through the screen's direct-upload path", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q56-owner', 'Q56 Owner', 'q56-owner@q56.example.test', 'user')");
    ownerId = (await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'q56-owner'"))[0][0].id;
    ({ tenantId } = await owner().tenant.create({ legalName: "Q56 Owner Files Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q56-A', 'Owner files', 'villas', 'SAR', 'active')", [P, tenantId]);
    const list = await directImport("pmc.locations", "villas.xlsx", await villaList());
    expect(reportOf(list.analysed)?.errorCount).toBe(0);
    expect((await list.confirm()).status).toBe("completed");
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } await s3?.close(); });

  it("(a) the original, with the owner's real totals line («الإجمالي» in the serial cell, 0.99999): 0 rejected, saved — 5 activities × 2 models at 100", async () => {
    const run = await directImport("pmc.weights", "original.xlsx", await ownerOriginalWeights({ totalIn: "serial" }));
    expect(run.analysed.status).toBe("validated");
    expect(reportOf(run.analysed)?.errors).toEqual([]);
    expect((await run.confirm()).status).toBe("completed");
    expect(await activitiesOf()).toEqual(["A:5:100", "B:5:100"]);
  });

  it("(b) the edited copy («القسم» twice, weights in %), with and without its totals line: 0 rejected, read as the same 5 × 2 activities (a) saved — nothing omitted, nothing duplicated", async () => {
    for (const withTotal of [false, true]) {
      const run = await directImport("pmc.weights", `edited-${withTotal}.xlsx`, await ownerEditedWeights({ withTotal }));
      expect(run.analysed.status, `withTotal=${withTotal}`).toBe("validated");
      expect(reportOf(run.analysed)?.errors, `withTotal=${withTotal}`).toEqual([]);
      // the same five activities with the same weights, matched to the codes (a) saved by their names: nothing to create, change or drop — the
      // screen says «the file matches what is stored» (before the fix every one of them was «omitted» and the file refused)
      expect(reportOf(run.analysed)?.counts, `withTotal=${withTotal}`).toEqual({ create: 0, update: 0, unchanged: 10 });
      expect(await activitiesOf()).toEqual(["A:5:100", "B:5:100"]);
    }
    // NEGATIVE: the rule that a file is the whole model still holds — a copy of (b) that leaves an activity out is refused with the activity it drops
    const short = await ownerEditedWeights();
    const book = new ExcelJS.Workbook(); await book.xlsx.load(short as unknown as ArrayBuffer);
    const sheet = book.worksheets[0]; sheet.spliceRows(6, 1); sheet.getCell("H5").value = 30; // «دهان خارجي» (10) left out, «دهان داخلي» 20 → 30: still 100
    const run = await directImport("pmc.weights", "edited-short.xlsx", new Uint8Array(await book.xlsx.writeBuffer()));
    expect(reportOf(run.analysed)?.errors.map(error => error.code)).toEqual(["PMC_MODEL_ACTIVITY_OMITTED", "PMC_MODEL_ACTIVITY_OMITTED"]);
    expect(await activitiesOf()).toEqual(["A:5:100", "B:5:100"]);
  });
});

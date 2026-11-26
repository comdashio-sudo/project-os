import ExcelJS from "exceljs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-60 batch 2b on a real database, through the platform's own PMC import: a register shaped like the owner's (row 1 empty, «Villa» twice, Package, Phase,
// «Mock-up villa», a #REF! column) is imported, the phase / package / mock-up mark are stored, and the same villas uploaded again create no duplicate.
async function register(rows: unknown[][]) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Villas");
  sheet.addRow([]);
  sheet.addRow(["Villa", "Villa", "Type", "Package", "Block", "Phase", "Mock-up villa", "WBS code (villa)"]);
  rows.forEach((row, index) => { sheet.addRow(row); sheet.getCell(index + 3, 8).value = { formula: "#REF!", result: { error: "#REF!" } } as never; });
  return Buffer.from(await book.xlsx.writeBuffer()).toString("base64");
}
const villas = (phase702: string) => [
  ["Villa 700", 700, "A-End", "Gold", "BLK 33", "PH1", "Yes"], ["Villa 701", 701, "B", "Gold", "BLK 33", "PH1", ""],
  ["Villa 702", 702, "C+", "Diamond", "BLK 34", phase702, "No"], ["Villa 703", 703, "D", "Diamond", "BLK 34", "PH2", ""],
];

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-60: the owner's villa register shape, imported", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let client: pg.Client;
  const scope = () => ({ tenantId: a.tenantId, projectId: a.projectId });
  const stored = async () => (await client.query("SELECT unit_number, model_code, phase, package, is_mockup FROM pmc_units WHERE tenant_id = $1 ORDER BY unit_number", [a.tenantId])).rows;
  const importRegister = async (base64: string) => {
    const report = await a.asOwner.pmc.analyzeImport({ ...scope(), kind: "locations", format: "xlsx", base64 });
    expect(report.errorCount).toBe(0);
    await a.asOwner.pmc.confirmImport({ ...scope(), kind: "locations", format: "xlsx", base64, approvedHash: report.fileHash });
    return report;
  };

  beforeAll(async () => { client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect(); a = await createRoleFixture({ label: "q60v" }); });
  afterAll(async () => {
    if (a) {
      await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [a.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [a.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: imported with nothing refused — the numeric «Villa», the phase, the package and the mock-up mark stored", async () => {
    const report = await importRegister(await register(villas("PH2")));
    expect(report.counts).toMatchObject({ create: 4, update: 0 });
    expect(await stored()).toEqual([
      { unit_number: 700, model_code: "A-End", phase: "PH1", package: "Gold", is_mockup: true }, { unit_number: 701, model_code: "B", phase: "PH1", package: "Gold", is_mockup: null },
      { unit_number: 702, model_code: "C+", phase: "PH2", package: "Diamond", is_mockup: false }, { unit_number: 703, model_code: "D", phase: "PH2", package: "Diamond", is_mockup: null },
    ]);
  });

  it("uploading the villas again (one phase corrected) creates no duplicate: one update, three unchanged, still four villas", async () => {
    const report = await importRegister(await register(villas("PH3")));
    expect(report.counts).toMatchObject({ create: 0, update: 1, unchanged: 3 });
    const rows = await stored();
    expect(rows).toHaveLength(4);
    expect(rows.find(row => row.unit_number === 702)?.phase).toBe("PH3");
  });

  it("the same villas again change nothing (all unchanged, still four); NEGATIVE: a mock-up mark that is neither yes nor no is refused and nothing is written", async () => {
    expect((await importRegister(await register(villas("PH3")))).counts).toMatchObject({ create: 0, update: 0, unchanged: 4 });
    expect(await stored()).toHaveLength(4);
    const bad = await register([["Villa 704", 704, "D", "Diamond", "BLK 34", "PH2", "maybe"]]);
    const report = await a.asOwner.pmc.analyzeImport({ ...scope(), kind: "locations", format: "xlsx", base64: bad });
    expect(report.errorCount).toBeGreaterThan(0);
    await expect(a.asOwner.pmc.confirmImport({ ...scope(), kind: "locations", format: "xlsx", base64: bad, approvedHash: report.fileHash })).rejects.toThrow();
    expect(await stored()).toHaveLength(4);
  });
});

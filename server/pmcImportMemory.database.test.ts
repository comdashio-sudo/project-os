import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";
import { analyzePmcImport, confirmPmcImport } from "./pmcImportService";

// Q-66 (6): the PMC import remembers, for each company, the columns a person chose for a file of a given shape, and reads the company's next file of that
// shape with them. Synthetic data only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-66 (6): the PMC import's remembered columns", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let b: Fixture; let client: pg.Client;
  const csv = (text: string) => Buffer.from(text, "utf8");
  const OWN = "Plot Block,House,Kind\n";
  const CHOICE = { blockCode: "Plot Block", unitNumber: "House", modelCode: "Kind" };
  const call = (fixture: Fixture, bytes: Buffer, mappingOverride?: Record<string, string>) => ({ userId: fixture.owner.id, tenantId: fixture.tenantId, projectId: fixture.projectId, kind: "locations" as const, format: "csv" as const, bytes, ...(mappingOverride ? { mappingOverride } : {}) });
  const profiles = async (tenantId: string) => (await client.query("SELECT kind, column_map_json, times_used FROM import_source_profiles WHERE tenant_id = $1 ORDER BY name", [tenantId])).rows;
  const units = async (tenantId: string) => (await client.query("SELECT unit_number FROM pmc_units WHERE tenant_id = $1 ORDER BY unit_number", [tenantId])).rows.map(row => row.unit_number);

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q66ma" }); b = await createRoleFixture({ label: "q66mb" });
  });
  afterAll(async () => {
    for (const fixture of [a, b]) if (fixture) {
      await deleteTenantData({ db: (await getDb())!, tenantId: fixture.tenantId, actorUserId: fixture.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM import_source_profiles WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [fixture.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [fixture.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: a confirmed import whose columns a person chose is remembered for the company; its next file of the same shape is read with that choice — said in the report — and confirmed without choosing again", async () => {
    const first = csv(`${OWN}BQ1,71001,A\nBQ1,71002,A\n`);
    expect((await analyzePmcImport(call(a, first))).errorCount).toBeGreaterThan(0); // the reader cannot settle these headers by name
    const chosen = await analyzePmcImport(call(a, first, CHOICE));
    expect(chosen.errorCount).toBe(0);
    await confirmPmcImport({ ...call(a, first, CHOICE), approvedHash: chosen.fileHash });
    expect(await profiles(a.tenantId)).toEqual([{ kind: "pmc_locations", column_map_json: JSON.stringify(CHOICE), times_used: 1 }]);

    const next = csv(`${OWN}BQ1,71003,A\nBQ2,71004,B\n`);
    const read = await analyzePmcImport(call(a, next));
    expect(read.errorCount).toBe(0);
    expect((read.details as { rememberedMapping?: { fields: string[] } }).rememberedMapping?.fields.sort()).toEqual(["blockCode", "modelCode", "unitNumber"]);
    await confirmPmcImport({ ...call(a, next), approvedHash: read.fileHash });
    expect(await units(a.tenantId)).toEqual([71001, 71002, 71003, 71004]);
    expect((await profiles(a.tenantId))[0].times_used).toBe(2);
  });

  it("NEGATIVE: another company's file of the same shape is not read with this company's choice, and a file the reader understands by itself is never read differently", async () => {
    const other = await analyzePmcImport(call(b, csv(`${OWN}BQ9,81001,A\n`)));
    expect(other.errorCount).toBeGreaterThan(0);
    expect((other.details as { rememberedMapping?: unknown }).rememberedMapping).toBeUndefined();
    expect(await profiles(b.tenantId)).toEqual([]);
    const plain = await analyzePmcImport(call(a, csv("Block Code,Unit Number,Model Code\nBQ3,71005,A\n")));
    expect(plain.errorCount).toBe(0);
    expect((plain.details as { rememberedMapping?: unknown }).rememberedMapping).toBeUndefined();
  });
});

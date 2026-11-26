import pg from "pg";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 });
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));
import { createRoleFixture } from "../scripts/lib/roleFixture.mjs";
import { getDb } from "./db";
import * as storage from "./storage";
import { deleteTenantData } from "./tenantData";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Q-62 (the owner, 26-11, on production): the villa file imported through the PMC villa list was refused by the master plan's «update units from Excel» with
// «this file was already imported», because the guard was company-wide. It is now per company, project and kind of import, and says when. Synthetic data only.
const FILE = Buffer.from("unitNumber,blockCode,modelCode\n700,BLK 33,C\n701,BLK 33,D\n", "utf8");
const hash = createHash("sha256").update(FILE).digest("hex");

describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("Q-62: «already imported» is per kind of import and per project", () => {
  type Fixture = Awaited<ReturnType<typeof createRoleFixture>>;
  let a: Fixture; let client: pg.Client; let versionId = ""; const otherProject = randomUUID();
  const register = async (moduleCode: string, projectId = a.projectId, context?: { masterPlanVersionId: string }) => {
    const target = await a.asOwner.dataImports.createUpload({ tenantId: a.tenantId, projectId, moduleCode: moduleCode as never, fileName: "villas.csv", sourceFormat: "csv", ...(context ? { context } : {}) });
    storage.simulateBrowserUpload(target.uploadKey, FILE, "text/csv");
    return a.asOwner.dataImports.registerUpload({ tenantId: a.tenantId, projectId, moduleCode: moduleCode as never, fileName: "villas.csv", sourceFormat: "csv", uploadKey: target.uploadKey, ...(context ? { context } : {}) });
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    a = await createRoleFixture({ label: "q62g" });
    await client.query("INSERT INTO projects (id, tenant_id, code, name, project_type, currency, status) VALUES ($1, $2, 'Q62-B', 'Second project (synthetic)', 'villas', 'SAR', 'active')", [otherProject, a.tenantId]);
    // the villa list, imported and completed through the PMC import (as on production)
    await client.query("INSERT INTO data_imports (id, tenant_id, project_id, module_code, template_code, source_format, file_name, file_key, file_hash, status, duplicate_mode, created_by_user_id, completed_at) VALUES ($1, $2, $3, 'pmc.locations', 'pmc.locations_v1', 'csv', 'villas.csv', 'imports/q62/villas.csv', $4, 'completed', 'fail_on_duplicate', $5, '2026-11-26 08:10:00+00')", [randomUUID(), a.tenantId, a.projectId, hash, a.owner.id]);
    versionId = (await a.asOwner.masterPlans.create({ tenantId: a.tenantId, projectId: a.projectId, code: "Q62-G", title: "Synthetic plan" })).versionId;
  });
  afterAll(async () => {
    if (a) {
      await deleteTenantData({ db: (await getDb())!, tenantId: a.tenantId, actorUserId: a.owner.id, storageDelete: async () => undefined }).catch(() => undefined);
      await client.query("DELETE FROM audit_logs WHERE tenant_id = $1", [a.tenantId]).catch(() => undefined);
      await client.query("DELETE FROM companies WHERE id = $1", [a.tenantId]).catch(() => undefined);
    }
    await client?.end();
  });

  it("POSITIVE: the same file goes through the master plan's units import, and into another project, after the PMC villa list took it", async () => {
    await expect(register("masterPlanMapping", a.projectId, { masterPlanVersionId: versionId })).resolves.toMatchObject({ id: expect.any(String) });
    await expect(register("pmc.locations", otherProject)).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("NEGATIVE: the same file, same kind, same project is still refused — and the refusal says when and under which name", async () => {
    // the router's own error (the HTTP formatter turns `cause.issues` into `data.issues` for the screen: server/_core/trpc.ts)
    const refusal = await register("pmc.locations").then(() => null, (error: { message: string; cause?: { issues?: Array<{ code: string; detail?: string }> } }) => error);
    expect(refusal?.message).toBe("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
    expect(refusal?.cause?.issues).toEqual([{ code: "ALREADY_IMPORTED", detail: "2026-11-26 08:10 UTC · villas.csv" }]);
    // the database keeps the final guard: a second confirmed row of the same file, kind and project is refused by the unique index
    await expect(client.query("INSERT INTO data_imports (id, tenant_id, project_id, module_code, template_code, source_format, file_name, file_key, file_hash, status, duplicate_mode, created_by_user_id) VALUES ($1, $2, $3, 'pmc.locations', 'pmc.locations_v1', 'csv', 'again.csv', 'imports/q62/again.csv', $4, 'completed', 'fail_on_duplicate', $5)", [randomUUID(), a.tenantId, a.projectId, hash, a.owner.id])).rejects.toThrow(/data_imports_tenant_file_hash_unique/);
  });
});

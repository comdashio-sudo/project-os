import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { dayOf } from "./quickSearch";

// Q-59 (3): the project's quick search, on a real database, through the real router, as the restricted application role; synthetic data only.
// Proven: a villa by number and by label, a daily report by its date, an activity by code; each source only for whoever its own screen's gate admits
// (a procurement officer holds no PMC read and finds no villa nor activity); nothing of another company's project; a query that is a pattern is read as text.
const SLUG = "q59-search"; const SLUG_B = "q59-search-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "buyer", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q59s-${key}`, name: `Q59 ${key}`, email: `q59s-${key}@q59.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const P = "59aa0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "site_daily_reports", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q59s-%'");
}
const search = (key: Key, query: string) => callerFor(key).search.quick({ tenantId, projectId: P, query }).then(result => result.hits.map(hit => `${hit.kind}:${hit.label}`));

describe("dayOf", () => {
  it("reads a calendar day and nothing else", () => {
    expect([dayOf("2026-11-20"), dayOf("2026/11/2"), dayOf("2026-02-30"), dayOf("20-11-2026"), dayOf("101")]).toEqual(["2026-11-20", "2026-11-02", null, null, null]);
  });
});

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-59 (3): the project's quick search", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q59s-${key}`, `Q59 ${key}`, `q59s-${key}@q59.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q59s-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q59s-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q59 Search Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callerFor("ownerB").tenant.create({ legalName: "Q59 Search Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q59-1', 'Search one', 'villas', 'SAR', 'active')", [P, tenantId]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES ('q59-z', ?, ?, 'Z1', 'Zone 1')", [tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES ('q59-b', ?, ?, 'q59-z', 'B1', 'Block 1')", [tenantId, P]);
    for (const [number, label] of [[101, null], [102, null], [1101, null], [7, "V-7A"]] as const) await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, villaLabel, modelCode, saleStatus, unitWeight) VALUES (?, ?, ?, 'q59-b', ?, ?, 'MDL-A', 'available', 1)", [`59aa0000-0000-4000-8000-0000000${String(number).padStart(5, "0")}`, tenantId, P, number, label]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES ('q59-g', ?, ?, 'G01', 'Finishes')", [tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES ('q59-s', ?, ?, 'q59-g', 'S01', 'Finishes')", [tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES ('q59-a1', ?, ?, 'q59-g', 'q59-s', 'MDL-A', 'PLASTER', 'Synthetic plaster', 50), ('q59-a2', ?, ?, 'q59-g', 'q59-s', 'MDL-A', 'PAINT_100', 'Synthetic paint', 50)", [tenantId, P, tenantId, P]);
    await connection.query("INSERT INTO site_daily_reports (id, tenantId, projectId, reportDate, status, preparedByUserId) VALUES ('q59-r1', ?, ?, '2026-11-20', 'approved', ?)", [tenantId, P, ids.owner]);
    const role = (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = 'PROCUREMENT_OFFICER'", [tenantId]))[0][0]!.id;
    await callerFor("owner").tenant.assignMember({ tenantId, targetUserId: ids.buyer, roleId: role, scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: a villa by its number (exactly) and by its label, a report by its date, an activity by code or name — each with the page that opens it", async () => {
    expect(await search("owner", "101")).toEqual(["villa:101"]);
    expect(await search("owner", "v-7")).toEqual(["villa:V-7A"]);
    expect(await search("owner", "٧")).toEqual(["villa:V-7A"]); // Arabic-Indic digits read as digits
    expect(await search("owner", "2026-11-20")).toEqual(["report:2026-11-20"]);
    expect(await search("owner", "plaster")).toEqual(["activity:PLASTER"]);
    const hits = (await callerFor("owner").search.quick({ tenantId, projectId: P, query: "101" })).hits;
    expect(hits[0].href).toBe(`/m/${tenantId}/${P}/unit/101`);
    expect((await callerFor("owner").search.quick({ tenantId, projectId: P, query: "2026-11-20" })).hits[0].href).toBe(`/m/${tenantId}/${P}/report?date=2026-11-20`);
  });

  it("NEGATIVE: a person without the PMC read finds no villa and no activity (the gate of their screens), and the search does not fail", async () => {
    expect(await search("buyer", "101")).toEqual([]);
    expect(await search("buyer", "plaster")).toEqual([]);
  });

  it("NEGATIVE: nothing of another company's project, whatever is typed", async () => {
    expect(await search("ownerB", "101")).toEqual([]);
    expect(await search("ownerB", "2026-11-20")).toEqual([]);
  });

  it("NEGATIVE: a project of another company, asked inside one's own company, answers nothing and does not say whether it exists", async () => {
    const [[other]] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG_B]);
    const foreign = "59aa0000-0000-4000-8000-0000000000ff";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q59-B', 'Other', 'villas', 'SAR', 'active')", [foreign, other.id]);
    const missing = "59aa0000-0000-4000-8000-0000000000fe";
    const answer = async (projectId: string) => callerFor("owner").search.quick({ tenantId, projectId, query: "101" }).then(result => JSON.stringify(result.hits), (error: Error) => error.message);
    // the other company's project and a project that does not exist answer the same way
    expect(await answer(foreign)).toBe(await answer(missing));
    expect(await answer(foreign)).not.toContain("101");
    await connection.query("DELETE FROM projects WHERE id = ?", [foreign]);
  });

  it("NEGATIVE: «%» and «_» are searched as themselves, never as a pattern that matches everything", async () => {
    expect(await search("owner", "%")).toEqual([]);
    expect(await search("owner", "_")).toEqual(["activity:PAINT_100"]);
  });
});

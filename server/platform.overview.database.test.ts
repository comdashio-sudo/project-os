import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";

// The platform owner's overview: every company with its licence, and the plan catalogue. Only the platform administrator (users.role = 'admin') may read it; a company owner
// who is not the administrator is refused with the explicit licensing-admin error, never an empty list. Run as the restricted application role. Synthetic data only.
const SLUGS = ["pov-alpha", "pov-beta"];
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string, role: "user" | "admin") => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@platform.example.test`, loginMethod: "email", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as never, res: {} as never } as never);

let connection: fixtureDb.Connection;
const ids: Record<string, number> = {};

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", SLUGS);
  for (const { id } of companies) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'pov-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("platform owner overview", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    for (const [openId, role] of [["pov-admin", "admin"], ["pov-owner-a", "user"], ["pov-owner-b", "user"]] as const) {
      await connection.query("INSERT INTO users (openId, name, email, role, loginMethod) VALUES (?, ?, ?, ?, 'email')", [openId, openId, `${openId}@platform.example.test`, role]);
      const [rows] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = ?", [openId]);
      ids[openId] = rows[0].id;
    }
    await callerFor(ids["pov-owner-a"], "pov-owner-a", "user").tenant.create({ legalName: "Overview Company Alpha", slug: SLUGS[0], packageCode: "ALL-IN-ONE" });
    await callerFor(ids["pov-owner-b"], "pov-owner-b", "user").tenant.create({ legalName: "Overview Company Beta", slug: SLUGS[1], packageCode: "PROJECT" });
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("the administrator sees every company (other people's too), each with its licence, and the whole plan catalogue", async () => {
    const overview = await callerFor(ids["pov-admin"], "pov-admin", "admin").platform.overview();
    const mine = overview.companies.filter(company => SLUGS.includes(company.slug));
    expect(mine.map(company => company.slug).sort()).toEqual(SLUGS);
    expect(overview.totalCompanies).toBeGreaterThanOrEqual(2);
    expect(overview.plans.length).toBeGreaterThanOrEqual(7);
    expect(overview.plans.every(plan => typeof plan.active === "boolean")).toBe(true);
    expect(overview.truncated).toBe(overview.totalCompanies > overview.shownCompanies);
  });

  it("NEGATIVE: a company owner who is not the platform administrator is refused, with the licensing-admin error and not an empty list", async () => {
    await expect(callerFor(ids["pov-owner-a"], "pov-owner-a", "user").platform.overview()).rejects.toMatchObject({ code: "FORBIDDEN", message: "PROJECT_OS_LICENSING_ADMIN_REQUIRED" });
  });

  it("NEGATIVE: the caller's own role in the request is not trusted -- the stored role decides (a user row that says 'user' stays refused even when the request claims admin)", async () => {
    await expect(callerFor(ids["pov-owner-b"], "pov-owner-b", "admin").platform.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("the sign-up plan list is a READ: with plans in the catalogue it returns them and writes nothing (before, every call began with seven upserts)", async () => {
    await callerFor(ids["pov-admin"], "pov-admin", "admin").licensing.catalog(); // make sure the catalogue is whole
    const stamp = async () => (await connection.query<{ n: string }[]>("SELECT max(updatedAt)::text AS n FROM commercial_plans"))[0][0].n;
    const before = await stamp();
    const plans = await callerFor(ids["pov-owner-a"], "pov-owner-a", "user").selfService.plans();
    expect(plans.length).toBeGreaterThanOrEqual(7);
    expect(await stamp()).toBe(before);
  });

  it("the plan list names the standard plans a company can start on", async () => {
    const plans = await callerFor(ids["pov-owner-a"], "pov-owner-a", "user").selfService.plans();
    expect(plans.map(plan => plan.code)).toEqual(expect.arrayContaining(["ALL_IN_ONE_STANDARD", "PROJECT_STANDARD"]));
  });
});

import fixtureDb from "./testing/pgCompat";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// D-17: the procedures no other database test called, each called here through the real router as the restricted application role — once by the company
// owner (it answers) and once by another company's owner (refused) — plus the submittal's close after a real send and reply. Synthetic data only.
const SLUG = "d17-cover";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@cover.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const KEYS = ["owner", "coord", "outsider"] as const;
const ids = {} as Record<(typeof KEYS)[number], number>;
const callers = {} as Record<(typeof KEYS)[number], ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection; let tenantId = ""; let otherTenantId = ""; let projectId = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["consultant_submittals", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'd17-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("D-17: every procedure is called by a database test", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`d17-${key}`, `D17 ${key}`, `d17-${key}@cover.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'd17-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `d17-${key}`)!.id; callers[key] = callerFor(ids[key], `d17-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Coverage Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.outsider.tenant.create({ legalName: "Other Coverage Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await callers.owner.tenant.administration({ tenantId });
    ({ id: projectId } = await callers.owner.projects.create({ tenantId, code: "D17-1", name: "Coverage project", projectType: "villas", currency: "SAR" }));
    const [roleRows] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM roles WHERE tenantId = ? AND code = 'PROJECT_COORDINATOR'", [tenantId]);
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.coord, roleId: (roleRows as Array<{ id: string }>)[0].id, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  }, 60_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  const scope = () => ({ tenantId, projectId });

  it("the project reads answer the owner and refuse another company's owner", async () => {
    expect(Array.isArray(await callers.owner.pmcSite.catalog(scope()))).toBe(true);
    expect(await callers.owner.policy.effective(scope())).toBeTruthy();
    expect(await callers.owner.siteReports.options(scope())).toBeTruthy();
    expect(await callers.owner.warehouses.cellOptions(scope())).toBeTruthy();
    for (const locale of ["ar", "en"] as const) {
      expect(await callers.owner.projects.baseline.boqTemplate({ ...scope(), locale })).toBeTruthy();
      expect(await callers.owner.projects.baseline.labourTemplate({ ...scope(), locale })).toBeTruthy();
    }
    for (const call of [
      () => callers.outsider.pmcSite.catalog(scope()), () => callers.outsider.policy.effective(scope()), () => callers.outsider.siteReports.options(scope()),
      () => callers.outsider.warehouses.cellOptions(scope()), () => callers.outsider.projects.baseline.boqTemplate({ ...scope(), locale: "ar" }), () => callers.outsider.projects.baseline.labourTemplate({ ...scope(), locale: "ar" }),
    ]) expect(await code(call())).not.toBe("no error");
  });

  it("the integration mappings answer the company's manager only; the scopes are the same static catalogue for anyone signed in", async () => {
    expect(Array.isArray(await callers.owner.integrations.mappings({ tenantId }))).toBe(true);
    expect(await code(callers.outsider.integrations.mappings({ tenantId }))).not.toBe("no error");
    expect(await code(callers.coord.integrations.mappings({ tenantId }))).not.toBe("no error");
    const catalogue = await callers.outsider.integrations.scopes();
    expect(catalogue.scopes.length).toBeGreaterThan(0);
    expect(await callers.owner.integrations.scopes()).toEqual(catalogue);
  });

  it("a submittal is closed only once replied: closing a draft is refused, after send and reply it closes; another company cannot close it", async () => {
    const { id } = await callers.coord.submittals.create({ ...scope(), submittalType: "shop_drawing", submittalNumber: "SD-001", title: "Synthetic drawing" });
    expect(await code(callers.owner.submittals.close({ ...scope(), submittalId: id }))).toBe("PROJECT_OS_SUBMITTAL_TRANSITION_INVALID");
    await callers.coord.submittals.send({ ...scope(), submittalId: id });
    await callers.owner.submittals.reply({ ...scope(), submittalId: id, replyCode: "A" });
    expect(await code(callers.outsider.submittals.close({ ...scope(), submittalId: id }))).not.toBe("no error");
    expect(await callers.owner.submittals.close({ ...scope(), submittalId: id })).toEqual({ id, status: "closed" });
    const [audit] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'submittal.closed'", [tenantId, id]);
    expect(Number(audit[0].n)).toBe(1);
  });
});

describe("D-17: the coverage check itself", () => {
  it("fails on a procedure no database test calls (a made-up one), and names it", () => {
    let failed = false; let output = "";
    try { execFileSync(process.execPath, ["--import", "tsx", "scripts/inventory-trpc-procedures.mjs", "--validate"], { env: { ...process.env, TRPC_COVERAGE_EXTRA_PROCEDURE: "made.upProcedure" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { failed = true; output = String((error as { stdout?: string }).stdout ?? ""); }
    expect(failed).toBe(true);
    expect(output).toContain("made.upProcedure");
  }, 120_000);
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { governedActionPermissions } from "./domain/operationalPermissions";
import { appRouter } from "./routers";

// G-110 (Gate 6), the live half. For EVERY server function a router calls with a tenant (writes and reads, not a sample), on a real database:
//   1. a member of another company is refused;                       (cross-tenant)
//   2. a person who belongs to no company is refused;                (no membership)
//   3. a company whose product licence is off is refused;            (no entitlement)
//   4. a project of another company, named by a full-power member of this one, is refused;       (cross-tenant project)
//   5. for every governed write that takes a project: a role limited to project Q is refused on project P and not refused on Q.   (cross-project, with its allowed control)
// "Refused" means an authorization error, never a validation error or a crash: a function that validates first is listed with the input that makes it reach the check.
// The audit half is `gate6.test.ts` (every mutation writes an audit row) plus the live tests of each record; docs/GATE6_RECORDS.md says which.
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@matrix.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

const dir = __dirname;
const sources = Object.fromEntries(readdirSync(dir).filter(name => /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)).map(name => [name, readFileSync(join(dir, name), "utf8")]));
const routers = sources["routers.ts"];
const calledNames = new Set(Array.from(routers.matchAll(/\b([a-zA-Z]+)\(\{/g)).map(match => match[1]));

type Target = { name: string; file: string; takesProject: boolean };

// A few functions check the shape of their input before they look at who is asking (nothing is read or written by that). They are given a well-formed
// input so the test reaches the authorization check, and the list is closed: a function that is not here must refuse a bare identity.
const WELL_FORMED: Record<string, Record<string, unknown>> = {
  createGoodsReceiptNoteForTenant: { receivedQuantity: 1, rejectedQuantity: 0, unitCost: 1 },
  createFieldReportForTenant: { workforceCount: 1 },
  createEmployeeTimeEntryForTenant: { actualHours: 1 },
  createEmployeePerformanceObjectionForTenant: { statement: "x".repeat(30) },
  createEmployeePerformanceExclusionForTenant: { reason: "x".repeat(30), sourceType: "activity", sourceId: "x", employeeId: "x" },
  allocateApprovedPayrollCostForTenant: { amount: 1 },
  adjustPayrollAllocationForTenant: { newAmount: 1, reason: "matrix test" },
};

/** Every exported function a router calls whose first line takes a tenant: the same population `entitlementGate.test.ts` guards. */
function targets(): Target[] {
  const found: Target[] = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const match of source.matchAll(/export (?:async )?function (\w+)\b([^\n]*)/g)) {
      if (!calledNames.has(match[1]) || !match[2].includes("tenantId") || match[1] === "getTenantAccessSnapshot") continue; // the primitive every gate is built on answers "no membership" with null
      found.push({ name: match[1], file: file.replace(/\.ts$/, ""), takesProject: /\bprojectId\b/.test(match[2]) });
    }
  }
  return found;
}

// Functions that deliberately do not check the product licence (support must stay reachable, billing must stay payable, ...): the no-entitlement behaviour is not asked of them.
const WITHOUT_PRODUCT_LICENCE = new Set(["getTenantNavigationForUser", "acknowledgeInternalNotification", "getInternalNotificationsForTenant", "getEmailNotificationPreferences", "setEmailNotificationPreference", "getPayrollCapabilitiesForTenant", "claimSupportTicket", "transitionSupportTicket", "createSupportTicketForTenant", "getSupportTicketForTenant", "listSupportTicketsForTenant", "replyToSupportTicket", "createKnowledgeArticleForTenant", "listKnowledgeArticlesForTenant", "listApprovedSupportSourceDocuments", "createTenantPayment", "getTenantBillingForManager", "issueTenantInvoice", "confirmManualTenantPayment", "provisionTenantLicense", "setTenantLicenseFeatureOverride", "transitionTenantLicenseStatus"]);

const REFUSALS = ["Tenant scope is invalid.", "Active tenant membership is required.", "product is not licensed for this tenant.", "Required permission is not granted.", "Role scope does not cover the requested resource.", "PROJECT_OS_TENANT_ACCESS_DENIED", "PROJECT_OS_PROJECT_NOT_FOUND", "PROJECT_OS_LICENSING_ADMIN_REQUIRED", "PROJECT_OS_SUPPORT_ACCESS_DENIED"];
const isRefusal = (error: unknown) => error instanceof Error && REFUSALS.some(text => error.message.includes(text));
const describeError = (error: unknown) => (error instanceof Error ? error.message.split("\n")[0].slice(0, 90) : String(error).slice(0, 90));

let connection: mysql.Connection;
const ids = { ownerA: 0, ownerB: 0, ownerC: 0, stranger: 0, scoped: 0 };
let tenantA = ""; let tenantB = ""; let tenantC = "";
const P = "7b000000-0000-4000-8000-000000000001"; const Q = "7b000000-0000-4000-8000-000000000002"; const R = "7b000000-0000-4000-8000-000000000003"; const PC = "7b000000-0000-4000-8000-000000000004";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN ('g110-a','g110-b','g110-c')");
  for (const { id } of companies) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM employees WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM membership_invitations WHERE tenantId = ?", [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'g110-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Gate 6 live matrix for every tenant function", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    const keys = ["ownerA", "ownerB", "ownerC", "stranger", "scoped"] as const;
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${keys.map(() => "(?, ?, ?, 'user')").join(",")}`, keys.flatMap(key => [`g110-${key}`, `Matrix ${key}`, `g110-${key}@matrix.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'g110-%'");
    for (const key of keys) ids[key] = rows.find(row => row.openId === `g110-${key}`)!.id;
    ({ tenantId: tenantA } = await callerFor(ids.ownerA, "g110-ownerA").tenant.create({ legalName: "Matrix A", slug: "g110-a", packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor(ids.ownerB, "g110-ownerB").tenant.create({ legalName: "Matrix B", slug: "g110-b", packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantC } = await callerFor(ids.ownerC, "g110-ownerC").tenant.create({ legalName: "Matrix C", slug: "g110-c", packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'MX-P', 'Matrix P', 'villas', 'SAR', 'active'), (?, ?, 'MX-Q', 'Matrix Q', 'villas', 'SAR', 'active'), (?, ?, 'MX-R', 'Matrix R', 'villas', 'SAR', 'active'), (?, ?, 'MX-C', 'Matrix C', 'villas', 'SAR', 'active')", [P, tenantA, Q, tenantA, R, tenantB, PC, tenantC]);
    await connection.query("UPDATE tenant_entitlements SET active = false WHERE tenantId = ?", [tenantC]);
    // The performance functions first ask which employee the caller is, so the two callers that must reach the licence and project checks are employees of their companies.
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, linkedUserId, createdByUserId) VALUES ('g110-e-a', ?, 'MX-A', 'Matrix A', 'Owner', 'Office', '2024-01-01', 'active', ?, ?), ('g110-e-c', ?, 'MX-C', 'Matrix C', 'Owner', 'Office', '2024-01-01', 'active', ?, ?)", [tenantA, ids.ownerA, ids.ownerA, tenantC, ids.ownerC, ids.ownerC]);
    // A role holding every governed permission (the separation-of-duties pairs are enforced by the role API, so the fixture writes it directly), given to one person for project Q only.
    const codes = Array.from(new Set(["project.read", ...Object.values(governedActionPermissions).flat()]));
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('g110-r-all', ?, 'G110_ALL', 'All governed powers', 'PROJECT')", [tenantA]);
    await connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT 'g110-r-all', id FROM permissions WHERE code IN (${codes.map(() => "?").join(",")})`, codes);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('g110-m-scoped', ?, ?, 'active')", [tenantA, ids.scoped]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES ('g110-mr-scoped', 'g110-m-scoped', 'g110-r-all', 'project', ?)", [Q]);
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  const all = targets();
  const modules = new Map<string, Record<string, (input: unknown) => Promise<unknown>>>();
  const run = async (target: Target, input: Record<string, unknown>) => {
    if (!modules.has(target.file)) modules.set(target.file, await import(/* @vite-ignore */ `./${target.file}`));
    const fn = modules.get(target.file)![target.name];
    try { await fn({ ...(WELL_FORMED[target.name] ?? {}), ...input }); return { refused: false as const, note: "completed" }; } catch (error) { return isRefusal(error) ? { refused: true as const, note: describeError(error) } : { refused: false as const, note: describeError(error) }; }
  };
  /** A refusal expected of every function: names the ones that did something else (a validation error, a crash, or success). */
  const expectRefused = async (label: string, list: Target[], input: (target: Target) => Record<string, unknown>) => {
    const failures: string[] = [];
    for (const target of list) { const result = await run(target, input(target)); if (!result.refused) failures.push(`${target.name}: ${result.note}`); }
    expect(failures, label).toEqual([]);
  };

  it("finds the functions it is meant to cover (the matrix is not a sample)", () => {
    expect(all.length).toBeGreaterThanOrEqual(175); // 175 functions today, 118 of them take a project
    expect(all.filter(target => target.takesProject).length).toBeGreaterThanOrEqual(118);
    expect(all.map(target => target.name)).toEqual(expect.arrayContaining(["createProgressEntry", "getPayrollRunsForTenant", "allocatePayrollEntryByHoursForTenant", "createGoodsReceiptNoteForTenant"]));
  });

  it("1. a member of another company is refused by every function (cross-tenant)", async () => {
    await expectRefused("cross-tenant", all, () => ({ userId: ids.ownerB, tenantId: tenantA, projectId: P }));
  }, 300_000);

  it("2. a person who belongs to no company is refused by every function (no membership)", async () => {
    await expectRefused("no membership", all, () => ({ userId: ids.stranger, tenantId: tenantA, projectId: P }));
  }, 300_000);

  it("3. a company whose product licence is off is refused, except the few functions that must stay reachable on purpose (no entitlement)", async () => {
    await expectRefused("no entitlement", all.filter(target => !WITHOUT_PRODUCT_LICENCE.has(target.name)), () => ({ userId: ids.ownerC, tenantId: tenantC, projectId: PC }));
  }, 300_000);

  it("4. another company's project, named by a full-power member of this one, is refused by every function that takes a project (cross-tenant project)", async () => {
    await expectRefused("foreign project", all.filter(target => target.takesProject), () => ({ userId: ids.ownerA, tenantId: tenantA, projectId: R }));
  }, 300_000);

  it("5. a role limited to project Q is refused on project P by every governed write that takes a project, and not refused on Q (cross-project, with its allowed control)", async () => {
    const governed = all.filter(target => target.takesProject && target.name in governedActionPermissions);
    expect(governed.length).toBeGreaterThan(25);
    await expectRefused("scoped elsewhere", governed, () => ({ userId: ids.scoped, tenantId: tenantA, projectId: P }));
    const stillRefused: string[] = [];
    for (const target of governed) { const result = await run(target, { userId: ids.scoped, tenantId: tenantA, projectId: Q }); if (result.refused) stillRefused.push(`${target.name}: ${result.note}`); }
    expect(stillRefused, "the same role must get past the check on its own project").toEqual([]);
  }, 300_000);
});

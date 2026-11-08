import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import * as storage from "./storage";

// Work order 23, P-17 (D-42 a) on a real database, through the real router, as the restricted application role: the project profile with its logos and the companies on the
// project. Positive and negative paths, the two CHECK/UNIQUE rules held by the database itself, and isolation between companies and between projects of one company.
// Synthetic data only (*.example.test, made-up names); storage is the in-memory stand-in (the live upload needs the S3 key, O-7).
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));

const SLUG = "proj-profile";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pp.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0a6a1a20000000049454e44ae426082", "hex");
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#0a7"/></svg>');
const SVG_SCRIPT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const SVG_HANDLER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>');

let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const projectA = "a2000000-0000-4000-8000-000000000001";
const projectB = "a2000000-0000-4000-8000-000000000002";
const projectC = "a2000000-0000-4000-8000-000000000003"; // in the other company
const KEYS = ["owner", "manager", "engineer", "otherOwner"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const audits = (action: string) => count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = ?", [tenantId, action]);
const profile = (overrides: Record<string, unknown> = {}) => ({
  tenantId, projectId: projectA, location: "Synthetic district, plot 7", contractNumber: "CN-0001", clientName: "Example Client Co.", consultantName: "Example Consultant Co.", contractorName: "Example Contractor Co.",
  workDays: [0, 1, 2, 3, 4], workStart: "07:00", workEnd: "17:00", reportPrefix: "PRJ-A", ...overrides,
});

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["project_companies", "project_profiles", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'pp-%'");
}

/** The browser's half of a logo upload: the signed URL (the gate of directUploads.create), the PUT, then the key the profile procedure takes. */
async function uploadLogo(who: Key, bytes: Buffer, contentType = "image/png", project = projectA, tenant = tenantId) {
  const target = await callers[who].directUploads.create({ tenantId: tenant, projectId: project, purpose: "logo", fileName: "logo.bin", contentType });
  storage.simulateBrowserUpload(target.uploadKey, bytes, contentType);
  return target.uploadKey;
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("project profile and companies on a real database (D-42 a)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`pp-${key}`, `PP ${key}`, `pp-${key}@pp.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pp-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `pp-${key}`)!.id; callers[key] = callerFor(ids[key], `pp-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Profile Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Profile Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PP-A', 'Profile A', 'villas', 'SAR', 'active'), (?, ?, 'PP-B', 'Profile B', 'villas', 'SAR', 'active'), (?, ?, 'PP-C', 'Profile C', 'villas', 'SAR', 'active')", [projectA, tenantId, projectB, tenantId, projectC, otherTenantId]);
    // the project manager holds project.manage on project A only; the site engineer reads A and records field work there, but does not manage the project
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "PP_MANAGER", name: "Project manager (A)", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    const engineer = await callers.owner.tenant.createRole({ tenantId, code: "PP_ENGINEER", name: "Site engineer (A)", productCode: "PROJECT", permissionCodes: ["project.read", "project.field.manage"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: projectA });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: engineer.id, scopeType: "project", scopeId: projectA });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("the project manager saves the profile with two logos and reads it back; one audit row", async () => {
    const empty = await callers.manager.projects.profile.get({ tenantId, projectId: projectA });
    expect(empty).toMatchObject({ clientName: null, workDays: [0, 1, 2, 3, 4], logos: { client: null, consultant: null, contractor: null } });
    const client = await uploadLogo("manager", PNG);
    const consultant = await uploadLogo("manager", SVG, "image/svg+xml");
    const saved = await callers.manager.projects.profile.save({ ...profile(), logos: { client: { uploadKey: client }, consultant: { uploadKey: consultant } } });
    expect(saved).toMatchObject({ location: "Synthetic district, plot 7", contractNumber: "CN-0001", clientName: "Example Client Co.", workDays: [0, 1, 2, 3, 4], workStart: "07:00", workEnd: "17:00", reportPrefix: "PRJ-A" });
    expect(saved.logos.client?.key).toMatch(new RegExp(`^uploads/${tenantId}/${projectA}/logo/.+\\.png$`));
    expect(saved.logos.consultant?.key).toMatch(new RegExp(`^uploads/${tenantId}/${projectA}/logo/.+\\.svg$`));
    expect(saved.logos.client?.url).toMatch(/^data:image\/png;base64,/);
    expect(saved.logos.contractor).toBeNull();
    expect(await audits("project.profile_saved")).toBe(1);
    // a second save keeps the logos it does not mention and removes the one set to null
    const again = await callers.manager.projects.profile.save({ ...profile({ workDays: [6, 0, 1, 2, 3], reportPrefix: null }), logos: { consultant: null } });
    expect(again).toMatchObject({ workDays: [0, 1, 2, 3, 6], reportPrefix: null, logos: { consultant: null } });
    expect(again.logos.client?.key).toBe(saved.logos.client?.key);
    expect(await count("SELECT COUNT(*) AS n FROM project_profiles WHERE tenantId = ? AND projectId = ?", [tenantId, projectA])).toBe(1);
    expect(await audits("project.profile_saved")).toBe(2);
    // the site engineer may read it
    expect((await callers.engineer.projects.profile.get({ tenantId, projectId: projectA })).clientName).toBe("Example Client Co.");
  });

  it("a site engineer (no project.manage) is refused: no row changes, no audit row", async () => {
    const before = await audits("project.profile_saved");
    expect(await code(callers.engineer.projects.profile.save(profile({ clientName: "Changed by engineer" })))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.engineer.projects.companies.save({ tenantId, projectId: projectA, name: "Engineer Co.", role: "sub" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.engineer.directUploads.create({ tenantId, projectId: projectA, purpose: "logo", fileName: "x.png", contentType: "image/png" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM project_profiles WHERE tenantId = ? AND clientName = ?", [tenantId, "Changed by engineer"])).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM project_companies WHERE tenantId = ?", [tenantId])).toBe(0);
    expect(await audits("project.profile_saved")).toBe(before);
    expect(await audits("project.company_added")).toBe(0);
  });

  it("reversed hours, half-given hours, a bad prefix or bad days are refused with one translated code; the table's CHECKs refuse them too", async () => {
    for (const bad of [{ workStart: "17:00", workEnd: "07:00" }, { workStart: "07:00", workEnd: "07:00" }, { workStart: "07:00", workEnd: null }, { reportPrefix: "ab" }, { reportPrefix: "-AB" }, { workDays: [1, 1] }, { workDays: [7] }]) {
      expect(await code(callers.manager.projects.profile.save(profile(bad)))).toBe("PROJECT_OS_PROJECT_PROFILE_INVALID");
    }
    expect((await callers.manager.projects.profile.get({ tenantId, projectId: projectA })).workStart).toBe("07:00");
    // the database itself, written by the fixture owner (no server code in the way)
    for (const [column, value] of [["workStart", "18:00"], ["reportPrefix", "lower"], ["workDays", "10"]] as const) {
      await expect(connection.query(`UPDATE project_profiles SET ${column} = ? WHERE tenantId = ? AND projectId = ?`, [value, tenantId, projectA])).rejects.toThrow(/check constraint/);
    }
  });

  it("one active main contractor per project, held by the partial unique index; deactivating frees the place", async () => {
    const main = await callers.manager.projects.companies.save({ tenantId, projectId: projectA, name: "Example Main Contractor", role: "main" });
    await callers.manager.projects.companies.save({ tenantId, projectId: projectA, name: "Example Sub One", role: "sub" });
    const sub = await callers.manager.projects.companies.save({ tenantId, projectId: projectA, name: "Example Sub Two", role: "sub" });
    expect(await code(callers.manager.projects.companies.save({ tenantId, projectId: projectA, name: "Second Main", role: "main" }))).toBe("PROJECT_OS_PROJECT_MAIN_CONTRACTOR_EXISTS");
    expect(await code(callers.manager.projects.companies.save({ tenantId, projectId: projectA, id: sub.id, name: "Example Sub Two", role: "main" }))).toBe("PROJECT_OS_PROJECT_MAIN_CONTRACTOR_EXISTS");
    expect(await count("SELECT COUNT(*) AS n FROM project_companies WHERE tenantId = ? AND role = 'main'", [tenantId])).toBe(1);
    // and with no server code in the way, the index refuses a second active main itself
    await expect(connection.query("INSERT INTO project_companies (id, tenantId, projectId, name, role) VALUES (UUID(), ?, ?, 'Direct Main', 'main')", [tenantId, projectA])).rejects.toThrow(/project_companies_one_active_main/);
    await callers.manager.projects.companies.deactivate({ tenantId, projectId: projectA, id: main.id });
    await callers.manager.projects.companies.save({ tenantId, projectId: projectA, name: "New Main Contractor", role: "main" });
    const list = await callers.engineer.projects.companies.list({ tenantId, projectId: projectA });
    expect(list.map(item => `${item.role}:${item.name}:${item.active}`)).toEqual(["main:Example Main Contractor:false", "main:New Main Contractor:true", "sub:Example Sub One:true", "sub:Example Sub Two:true"]);
    expect(await audits("project.company_added")).toBe(4);
    expect(await audits("project.company_deactivated")).toBe(1);
    expect(await code(callers.manager.projects.companies.deactivate({ tenantId, projectId: projectA, id: "a2000000-0000-4000-8000-0000000000ff" }))).toBe("PROJECT_OS_PROJECT_COMPANY_NOT_FOUND");
  });

  it("a logo uploaded for another company or another project is refused, and so are an SVG with script, an unknown type and a file over 2 MB", async () => {
    const before = (await callers.manager.projects.profile.get({ tenantId, projectId: projectA })).logos.client?.key;
    const foreign = await uploadLogo("otherOwner", PNG, "image/png", projectC, otherTenantId);
    const sibling = await uploadLogo("owner", PNG, "image/png", projectB);
    for (const uploadKey of [foreign, sibling]) expect(await code(callers.manager.projects.profile.save({ ...profile(), logos: { contractor: { uploadKey } } }))).toBe("PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID");
    for (const [bytes, type] of [[SVG_SCRIPT, "image/svg+xml"], [SVG_HANDLER, "image/svg+xml"]] as const) expect(await code(callers.manager.projects.profile.save({ ...profile(), logos: { contractor: { uploadKey: await uploadLogo("manager", bytes, type) } } }))).toBe("PROJECT_OS_PROJECT_LOGO_UNSAFE");
    expect(await code(callers.manager.projects.profile.save({ ...profile(), logos: { contractor: { uploadKey: await uploadLogo("manager", Buffer.from("GIF89a not a logo")) } } }))).toBe("PROJECT_OS_PROJECT_LOGO_TYPE_INVALID");
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect(await code(callers.manager.projects.profile.save({ ...profile(), logos: { contractor: { uploadKey: await uploadLogo("manager", big) } } }))).toBe("PROJECT_OS_PROJECT_LOGO_TOO_LARGE");
    expect(await code(callers.manager.directUploads.create({ tenantId, projectId: projectA, purpose: "logo", fileName: "x.gif", contentType: "image/gif" }))).toBe("PROJECT_OS_UPLOAD_TYPE_INVALID");
    const after = await callers.manager.projects.profile.get({ tenantId, projectId: projectA });
    expect(after.logos.contractor).toBeNull();
    expect(after.logos.client?.key).toBe(before);
  });

  it("isolation: another company neither reads nor writes this profile; the manager of A neither reads nor writes project B", async () => {
    expect(await code(callers.otherOwner.projects.profile.get({ tenantId, projectId: projectA }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.projects.profile.save(profile({ clientName: "Foreign" })))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.projects.companies.list({ tenantId, projectId: projectA }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    // the other company's owner, in their own company, naming this company's project: not found there
    expect(await code(callers.otherOwner.projects.profile.save(profile({ tenantId: otherTenantId, clientName: "Foreign" })))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.manager.projects.profile.save(profile({ projectId: projectB })))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.manager.projects.profile.get({ tenantId, projectId: projectB }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.manager.projects.companies.save({ tenantId, projectId: projectB, name: "Leak", role: "sub" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM project_profiles WHERE clientName = 'Foreign' OR projectId IN (?, ?)", [projectB, projectC])).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM project_companies WHERE projectId IN (?, ?)", [projectB, projectC])).toBe(0);
    // the company owner (company scope) reads A
    expect((await callers.owner.projects.profile.get({ tenantId, projectId: projectA })).contractNumber).toBe("CN-0001");
  });
});

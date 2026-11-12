import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { DEFAULT_LABOUR_ROLES } from "../shared/defaultLabourRoles";

// D-44 (a), P-35 on a real database, through the real router, as the restricted application role: labour roles (with the idempotent copy of the default list), the
// equipment with its owner on the same project, and the activity's unit and whole quantity. Positive, negative, what the database itself refuses, and isolation between
// companies and between projects of one company. Synthetic data only (*.example.test).
const SLUG = "proj-ref-lists";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@rl.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "a5000000-0000-4000-8000-000000000001";
const B = "a5000000-0000-4000-8000-000000000002";
const C = "a5000000-0000-4000-8000-000000000003";
const ACT = "a5000000-0000-4000-8000-0000000000a1";
const KEYS = ["owner", "manager", "engineer", "otherOwner"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const audits = (action: string) => count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action LIKE ?", [tenantId, action]);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["project_equipment", "project_labour_roles", "project_companies", "pmc_site_activities", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'rl-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("project reference lists on a real database (D-44 a)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`rl-${key}`, `RL ${key}`, `rl-${key}@rl.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'rl-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `rl-${key}`)!.id; callers[key] = callerFor(ids[key], `rl-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Reference Lists Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Lists Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'RL-A', 'Lists A', 'villas', 'SAR', 'active'), (?, ?, 'RL-B', 'Lists B', 'villas', 'SAR', 'active'), (?, ?, 'RL-C', 'Lists C', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId, C, otherTenantId]);
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "RL_MANAGER", name: "Project manager", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    // like the SITE_ENGINEER template: project.field.manage without project.read
    const field = await callers.owner.tenant.createRole({ tenantId, code: "RL_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.field.manage"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: field.id, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    await connection.query("INSERT INTO pmc_site_activities (id, tenantId, projectId, code, csiName, name, weight) VALUES (?, ?, ?, 'BLK-01', 'Masonry', 'Block work', 0.1)", [ACT, tenantId, A]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("the default list is unique by key and by name in each language, and has direct and indirect roles", () => {
    expect(new Set(DEFAULT_LABOUR_ROLES.map(role => role.key)).size).toBe(DEFAULT_LABOUR_ROLES.length);
    for (const language of ["ar", "en", "ur"] as const) expect(new Set(DEFAULT_LABOUR_ROLES.map(role => role[language].toLowerCase())).size).toBe(DEFAULT_LABOUR_ROLES.length);
    expect(DEFAULT_LABOUR_ROLES.filter(role => role.category === "direct").length).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_LABOUR_ROLES.filter(role => role.category === "indirect").length).toBeGreaterThanOrEqual(60);
  });

  it("copying the default roles twice (and after a rename) adds no row; the engineer reads them; edit and deactivate leave one audit row each", async () => {
    const total = DEFAULT_LABOUR_ROLES.length;
    expect(await callers.manager.projects.labourRoles.seedDefaults({ tenantId, projectId: A, language: "ar" })).toEqual({ added: total, offered: total });
    expect(await callers.manager.projects.labourRoles.seedDefaults({ tenantId, projectId: A, language: "ar" })).toEqual({ added: 0, offered: total });
    const list = await callers.engineer.projects.labourRoles.list({ tenantId, projectId: A });
    expect(list).toHaveLength(total);
    const mason = list.find(role => role.defaultKey === "mason")!;
    expect(mason).toMatchObject({ name: "بنّاء", category: "direct", active: true });
    await callers.manager.projects.labourRoles.save({ tenantId, projectId: A, id: mason.id, name: "بنّاء طوب", category: "direct" });
    expect(await callers.manager.projects.labourRoles.seedDefaults({ tenantId, projectId: A, language: "en" })).toEqual({ added: 0, offered: total });
    await callers.manager.projects.labourRoles.setActive({ tenantId, projectId: A, id: mason.id, active: false });
    const added = await callers.manager.projects.labourRoles.save({ tenantId, projectId: A, name: "Curtain wall installer", category: "direct" });
    expect(await count("SELECT COUNT(*) AS n FROM project_labour_roles WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(total + 1);
    expect((await callers.engineer.projects.labourRoles.list({ tenantId, projectId: A })).find(role => role.id === mason.id)).toMatchObject({ name: "بنّاء طوب", active: false });
    expect(await audits("project.labour_roles_seeded")).toBe(3);
    expect(await audits("project.labour_role_updated")).toBe(1);
    expect(await audits("project.labour_role_deactivated")).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'project.labour_role_added' AND entityId = ?", [tenantId, added.id])).toBe(1);
  });

  it("a duplicate name (any letter case), an unknown role and the site engineer's writes are refused; nothing is written", async () => {
    const before = await audits("project.labour_role%");
    const rows = await count("SELECT COUNT(*) AS n FROM project_labour_roles WHERE tenantId = ?", [tenantId]);
    expect(await code(callers.manager.projects.labourRoles.save({ tenantId, projectId: A, name: "CURTAIN WALL INSTALLER", category: "indirect" }))).toBe("PROJECT_OS_LABOUR_ROLE_EXISTS");
    expect(await code(callers.manager.projects.labourRoles.setActive({ tenantId, projectId: A, id: "a5000000-0000-4000-8000-0000000000ff", active: true }))).toBe("PROJECT_OS_LABOUR_ROLE_NOT_FOUND");
    expect(await code(callers.engineer.projects.labourRoles.save({ tenantId, projectId: A, name: "Engineer's role", category: "direct" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.engineer.projects.labourRoles.seedDefaults({ tenantId, projectId: A, language: "ar" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const [target] = (await connection.query<{ id: string; active: number }[]>("SELECT id, active FROM project_labour_roles WHERE tenantId = ? AND projectId = ? AND defaultKey = 'tiler'", [tenantId, A]))[0];
    expect(await code(callers.engineer.projects.labourRoles.setActive({ tenantId, projectId: A, id: target.id, active: false }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await connection.query<{ active: number }[]>("SELECT active FROM project_labour_roles WHERE id = ?", [target.id]))[0][0].active).toBe(target.active);
    expect(await count("SELECT COUNT(*) AS n FROM project_labour_roles WHERE tenantId = ?", [tenantId])).toBe(rows);
    expect(await audits("project.labour_role%")).toBe(before);
    await expect(connection.query("INSERT INTO project_labour_roles (id, tenantId, projectId, name, category) VALUES (UUID(), ?, ?, 'Odd', 'casual')", [tenantId, A])).rejects.toThrow(/project_labour_roles_category_check/);
  });

  it("equipment: the owner is a company on this project; another project's company, a duplicate plate and the engineer's write are refused (the key holds it too)", async () => {
    const main = await callers.manager.projects.companies.save({ tenantId, projectId: A, name: "Main Contractor (example)", role: "main" });
    const onB = await callers.owner.projects.companies.save({ tenantId, projectId: B, name: "Sub on B (example)", role: "sub" });
    const crane = await callers.manager.projects.equipment.save({ tenantId, projectId: A, equipmentType: "Mobile crane", model: "50T", plateOrSize: "abc-1234", ownerCompanyId: main.id });
    await callers.manager.projects.equipment.save({ tenantId, projectId: A, equipmentType: "Generator", model: null, plateOrSize: null, ownerCompanyId: null });
    expect(await callers.engineer.projects.equipment.list({ tenantId, projectId: A })).toEqual(expect.arrayContaining([expect.objectContaining({ id: crane.id, ownerName: "Main Contractor (example)", plateOrSize: "abc-1234", active: true })]));
    const before = await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ?", [tenantId]);
    expect(await code(callers.manager.projects.equipment.save({ tenantId, projectId: A, equipmentType: "Loader", model: null, plateOrSize: "X-1", ownerCompanyId: onB.id }))).toBe("PROJECT_OS_EQUIPMENT_OWNER_NOT_ON_PROJECT");
    expect(await code(callers.manager.projects.equipment.save({ tenantId, projectId: A, equipmentType: "Loader", model: null, plateOrSize: "ABC-1234", ownerCompanyId: null }))).toBe("PROJECT_OS_EQUIPMENT_PLATE_EXISTS");
    expect(await code(callers.engineer.projects.equipment.save({ tenantId, projectId: A, equipmentType: "Loader", model: null, plateOrSize: null, ownerCompanyId: null }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.engineer.projects.equipment.setActive({ tenantId, projectId: A, id: crane.id, active: false }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM project_equipment WHERE tenantId = ?", [tenantId])).toBe(before);
    await expect(connection.query("INSERT INTO project_equipment (id, tenantId, projectId, equipmentType, ownerCompanyId) VALUES (UUID(), ?, ?, 'Direct', ?)", [tenantId, A, onB.id])).rejects.toThrow(/project_equipment_owner_same_project_fk/);
    await callers.manager.projects.equipment.setActive({ tenantId, projectId: A, id: crane.id, active: false });
    expect(await audits("project.equipment_added")).toBe(2);
    expect(await audits("project.equipment_deactivated")).toBe(1);
  });

  it("an activity in linear metres needs its whole quantity; a villa keeps none; the CHECK refuses the same directly", async () => {
    expect(await code(callers.manager.projects.siteActivities.setMeasure({ tenantId, projectId: A, siteActivityId: ACT, measureUnit: "lm", totalQuantity: null }))).toBe("PROJECT_OS_SITE_ACTIVITY_QUANTITY_REQUIRED");
    expect(await code(callers.engineer.projects.siteActivities.setMeasure({ tenantId, projectId: A, siteActivityId: ACT, measureUnit: "lm", totalQuantity: 10 }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await audits("project.site_activity_measure_set")).toBe(0);
    expect((await callers.engineer.projects.siteActivities.list({ tenantId, projectId: A }))[0]).toMatchObject({ id: ACT, measureUnit: "villa", totalQuantity: null });
    await callers.manager.projects.siteActivities.setMeasure({ tenantId, projectId: A, siteActivityId: ACT, measureUnit: "lm", totalQuantity: 1250.5 });
    expect((await callers.engineer.projects.siteActivities.list({ tenantId, projectId: A }))[0]).toMatchObject({ measureUnit: "lm", totalQuantity: 1250.5 });
    expect(await callers.manager.projects.siteActivities.setMeasure({ tenantId, projectId: A, siteActivityId: ACT, measureUnit: "villa", totalQuantity: 99 })).toMatchObject({ measureUnit: "villa", totalQuantity: null });
    expect(await audits("project.site_activity_measure_set")).toBe(2);
    await expect(connection.query("UPDATE pmc_site_activities SET measureUnit = 'm2', totalQuantity = NULL WHERE id = ?", [ACT])).rejects.toThrow(/pmc_site_activities_measure_check/);
    await expect(connection.query("UPDATE pmc_site_activities SET measureUnit = 'ton' WHERE id = ?", [ACT])).rejects.toThrow(/pmc_site_activities_measure_check/);
  });

  it("isolation: another company neither reads nor writes A's lists; A's manager does not reach project B; B's lists stay separate", async () => {
    expect(await code(callers.otherOwner.projects.labourRoles.list({ tenantId, projectId: A }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.projects.equipment.list({ tenantId: otherTenantId, projectId: A }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.otherOwner.projects.siteActivities.setMeasure({ tenantId: otherTenantId, projectId: C, siteActivityId: ACT, measureUnit: "piece", totalQuantity: 5 }))).toBe("PROJECT_OS_PMC_SITE_ACTIVITY_NOT_FOUND");
    const [crane] = await connection.query<{ id: string }[]>("SELECT id FROM project_equipment WHERE tenantId = ? AND equipmentType = 'Mobile crane'", [tenantId]);
    expect(await code(callers.otherOwner.projects.equipment.setActive({ tenantId: otherTenantId, projectId: C, id: crane[0].id, active: true }))).toBe("PROJECT_OS_EQUIPMENT_NOT_FOUND");
    expect(await code(callers.manager.projects.labourRoles.list({ tenantId, projectId: B }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.manager.projects.labourRoles.seedDefaults({ tenantId, projectId: B, language: "ar" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await callers.owner.projects.labourRoles.list({ tenantId, projectId: B })).toEqual([]);
    expect(await callers.owner.projects.labourRoles.seedDefaults({ tenantId, projectId: B, language: "ur" })).toMatchObject({ added: DEFAULT_LABOUR_ROLES.length });
    expect(await callers.otherOwner.projects.labourRoles.list({ tenantId: otherTenantId, projectId: C })).toEqual([]);
    expect(await count("SELECT COUNT(*) AS n FROM project_labour_roles WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(DEFAULT_LABOUR_ROLES.length + 1);
    expect((await connection.query<{ active: number }[]>("SELECT active FROM project_equipment WHERE id = ?", [crane[0].id]))[0][0].active).toBe(0);
  });
});

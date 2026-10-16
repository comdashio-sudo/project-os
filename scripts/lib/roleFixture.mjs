// One synthetic company with the twelve operating roles, each held by a different synthetic person.
//
// Everything is invented (*.example.test). The people are created the way the e-mail sign-in creates them
// (openId = email:<40 hex of SHA-256(address)>), so signing in through the real screen finds the same account.
//
// How a role is built here is how an administrator builds it in the product:
//   - the operational roles (project manager, planning engineer, procurement, warehouse, accountant, finance, HR, site engineer)
//     are the system roles every company gets;
//   - "project.read" (open the project at all) is a separate viewer role, because the system roles carry only what they DO;
//   - the roles the product does not ship (executive viewer, PMO lead, cost controller) are created through tenant.createRole.
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { roles as rolesTable, users } from "../../drizzle/schema.ts";
import { createProjectForTenant, createTenantForUser, createWbsItem, getDb, upsertUser } from "../../server/db.ts";
import { appRouter } from "../../server/routers.ts";

export const emailOpenId = email => `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;

/** key, Arabic name, system role code (null = custom), custom role definition, scope, and whether the person also gets the project viewer role. */
export const ROLE_DEFINITIONS = [
  { key: "owner", ar: "المالك", system: "TENANT_OWNER", scope: "company" },
  { key: "executive", ar: "التنفيذي", custom: { code: "EXECUTIVE_VIEWER", name: "المدير التنفيذي", productCode: "EXECUTIVE", permissionCodes: ["executive.read"] }, scope: "company" },
  { key: "pmo", ar: "PMO", custom: { code: "PMO_LEAD", name: "مسؤول مكتب إدارة المشاريع", productCode: "PMO", permissionCodes: ["pmo.read", "pmo.write"] }, scope: "company" },
  { key: "pm", ar: "مدير المشروع", system: "PROJECT_MANAGER", scope: "project", viewer: true },
  { key: "planner", ar: "التخطيط", system: "PLANNING_ENGINEER", scope: "project", viewer: true },
  { key: "costControl", ar: "الكوست كنترول", custom: { code: "COST_CONTROLLER", name: "مراقب التكلفة", productCode: "PROJECT", permissionCodes: ["project.pmc.read", "project.budget.manage", "project.cost.enter", "project.cashflow.read", "project.commitment.manage", "project.evm.manage", "project.performance.read_own"] }, scope: "company", viewer: true },
  { key: "procurement", ar: "المشتريات", system: "PROCUREMENT_OFFICER", scope: "company", viewer: true },
  { key: "warehouse", ar: "المستودع", system: "WAREHOUSE_CUSTODIAN", scope: "project", viewer: true },
  { key: "accountant", ar: "المحاسب", system: "ACCOUNTANT", scope: "company", viewer: true },
  { key: "finance", ar: "المدير المالي", system: "FINANCE_MANAGER", scope: "company", viewer: true },
  { key: "hr", ar: "الموارد البشرية", system: "HR_MANAGER", scope: "company", viewer: true },
  { key: "site", ar: "الموقع", system: "SITE_ENGINEER", scope: "project", viewer: true },
];

export async function createRoleFixture({ label = "e2e" } = {}) {
  const run = randomBytes(3).toString("hex");
  const db = await getDb();
  const emails = Object.fromEntries(ROLE_DEFINITIONS.map(role => [role.key, `${role.key.toLowerCase()}.${run}@e2e.example.test`]));
  const people = {};
  for (const role of ROLE_DEFINITIONS) {
    const openId = emailOpenId(emails[role.key]);
    await upsertUser({ openId, name: `${label} ${role.key} ${run}`, email: emails[role.key], loginMethod: "email" });
    const [row] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    people[role.key] = { ...role, id: row.id, openId, email: emails[role.key], row };
  }
  const owner = people.owner;
  const { tenantId } = await createTenantForUser({ userId: owner.id, legalName: `Role Rehearsal Co. ${run}`, slug: `role-rehearsal-${run}`, packageCode: "ALL-IN-ONE" });
  const { id: projectId } = await createProjectForTenant({ userId: owner.id, tenantId, code: `RR-${run.toUpperCase()}`, name: `Role Rehearsal Villas ${run}`, projectType: "residential", currency: "SAR" });
  const foundation = await createWbsItem({ userId: owner.id, tenantId, projectId, code: "1", name: "Foundations", plannedValue: 400000 });
  await createWbsItem({ userId: owner.id, tenantId, projectId, code: "2", name: "Structure", plannedValue: 900000 });
  await createWbsItem({ userId: owner.id, tenantId, projectId, code: "1.1", name: "Excavation", parentId: foundation.id, plannedValue: 150000 });

  const callerFor = person => appRouter.createCaller({ user: person.row, req: { protocol: "https", headers: {} }, res: {} });
  const asOwner = callerFor(owner);
  // The system roles are installed into a company the first time its administrator opens the administration screen.
  await asOwner.tenant.administration({ tenantId });
  const viewer = await asOwner.tenant.createRole({ tenantId, code: "PROJECT_VIEWER", name: "مطّلع على المشروع", productCode: "PROJECT", permissionCodes: ["project.read"] });
  const roleIds = {};
  const systemRoles = await db.select({ id: rolesTable.id, code: rolesTable.code }).from(rolesTable).where(eq(rolesTable.tenantId, tenantId));
  for (const row of systemRoles) roleIds[row.code] = row.id;
  for (const role of ROLE_DEFINITIONS) {
    if (role.custom) roleIds[role.custom.code] = (await asOwner.tenant.createRole({ tenantId, ...role.custom })).id;
  }
  roleIds.PROJECT_VIEWER = viewer.id;
  for (const role of ROLE_DEFINITIONS) {
    if (role.key === "owner") continue;
    const roleId = roleIds[role.system ?? role.custom.code];
    const scope = role.scope === "project" ? { scopeType: "project", scopeId: projectId } : { scopeType: "company" };
    // Exactly the administrator's path: invite by e-mail with the role, the person accepts, then a second role is added to the membership.
    const invitation = await asOwner.tenant.createInvitation({ tenantId, email: people[role.key].email, roleId, ...scope });
    const accepted = await callerFor(people[role.key]).tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    if (role.viewer) await asOwner.tenant.assignMembershipRole({ tenantId, membershipId: accepted.membershipId, roleId: roleIds.PROJECT_VIEWER, ...scope });
  }
  return { run, tenantId, projectId, people, roleIds, callerFor, asOwner, owner };
}

// Prepares the all-roles visit inside the synthetic demo tenant: one synthetic user per operating role, each attached with the product's own
// server functions (the demo administrator invites the person with the role, the person accepts, the viewer role is added where the role needs
// it), then one browser session per person. Every token goes to its own file in ROLE_SESSION_DIR (mode 600); the manifest there (roles.json)
// names the files and holds no token. Nothing secret is printed.
//
// It refuses any database except project_os_integration_test, and it needs the demo tenant that scripts/seed-demo-tenant.mjs creates.
//
//   DATABASE_URL=postgres://<owner>@127.0.0.1:5433/project_os_integration_test
//   JWT_SECRET=<the secret the server under test will use>   ROLE_SESSION_DIR=<protected directory outside the repository>
//   node --import tsx tests/ui/prepareRoleUsers.mjs
//
// It is called by tests/ui/runRoleVisits.mjs, which also starts the server and runs the visit.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { companies, memberships, projects, roles as rolesTable, users } from "../../drizzle/schema.ts";
import { sdk } from "../../server/_core/sdk.ts";
import { getDb, upsertUser } from "../../server/db.ts";
import { appRouter } from "../../server/routers.ts";
import { DEMO_PROJECT_CODE, DEMO_TENANT_SLUG } from "../../scripts/lib/demoTenant.mjs";
import { DEMO_EMAIL, TEST_DATABASE, VIEWER_ROLE, emailOpenId, visitPeople } from "./roleUsers.mjs";

const fail = message => { console.error(message); process.exit(2); };
if (!process.env.DATABASE_URL) fail("DATABASE_URL is required (the owner of the test database).");
const dbUrl = new URL(process.env.DATABASE_URL);
if (dbUrl.pathname !== `/${TEST_DATABASE}`) fail(`Refusing to run: DATABASE_URL must name ${TEST_DATABASE}.`);
if (!process.env.JWT_SECRET) fail("JWT_SECRET is required (the same value the server under test uses).");
const sessionDir = process.env.ROLE_SESSION_DIR;
if (!sessionDir) fail("ROLE_SESSION_DIR is required (a protected directory outside the repository).");
mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
chmodSync(sessionDir, 0o700);

const db = await getDb();
if (!db) fail("the database is not available");
const [demo] = await db.select().from(users).where(eq(users.openId, emailOpenId(DEMO_EMAIL))).limit(1);
if (!demo) fail("the demo administrator is not seeded: run scripts/seed-demo-tenant.mjs first.");
const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.slug, DEMO_TENANT_SLUG)).limit(1);
if (!company) fail("the demo tenant is not seeded: run scripts/seed-demo-tenant.mjs first.");
const tenantId = company.id;
const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.code, DEMO_PROJECT_CODE))).limit(1);
if (!project) fail(`the demo project ${DEMO_PROJECT_CODE} is not seeded.`);

const callerFor = user => appRouter.createCaller({ user, req: { protocol: "https", headers: {} }, res: {} });
const asAdmin = callerFor(demo);
// The system roles of a company are installed by the administration read (idempotent), exactly as the role rehearsal does.
await asAdmin.tenant.administration({ tenantId });

let [viewer] = await db.select({ id: rolesTable.id }).from(rolesTable).where(and(eq(rolesTable.tenantId, tenantId), eq(rolesTable.code, VIEWER_ROLE.code))).limit(1);
if (!viewer) viewer = await asAdmin.tenant.createRole({ tenantId, ...VIEWER_ROLE });
const roleRows = await db.select({ id: rolesTable.id, code: rolesTable.code }).from(rolesTable).where(eq(rolesTable.tenantId, tenantId));
const roleIdByCode = Object.fromEntries(roleRows.map(row => [row.code, row.id]));

const manifest = [];
const counts = { invited: 0, alreadyMember: 0, demo: 0 };
for (const person of visitPeople()) {
  const openId = emailOpenId(person.email);
  const sessionFile = path.join(sessionDir, `${person.code.toLowerCase().replaceAll("_", "-")}.session`);
  let userRow;
  if (person.demo) {
    userRow = demo;
    counts.demo += 1;
  } else {
    await upsertUser({ openId, name: `UI visit: ${person.name}`, email: person.email, loginMethod: "email" });
    [userRow] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
    const [member] = await db.select({ id: memberships.id, status: memberships.status }).from(memberships).where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userRow.id))).limit(1);
    if (member) {
      counts.alreadyMember += 1;
    } else {
      const roleId = roleIdByCode[person.code];
      if (!roleId) fail(`the company has no role ${person.code}`);
      const scope = person.scope === "project" ? { scopeType: "project", scopeId: project.id } : { scopeType: "company" };
      const invitation = await asAdmin.tenant.createInvitation({ tenantId, email: person.email, roleId, ...scope });
      const accepted = await callerFor(userRow).tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
      if (person.viewer) await asAdmin.tenant.assignMembershipRole({ tenantId, membershipId: accepted.membershipId, roleId: viewer.id, ...scope });
      counts.invited += 1;
    }
  }
  const token = await sdk.issueSession(openId, { name: userRow.name ?? person.name });
  writeFileSync(sessionFile, token, { mode: 0o600 });
  chmodSync(sessionFile, 0o600);
  manifest.push({ code: person.code, name: person.name, scope: person.scope, viewer: person.viewer, sessionFile });
}

writeFileSync(path.join(sessionDir, "roles.json"), JSON.stringify({ tenantId, projectId: project.id, roles: manifest }, null, 2));
console.log(JSON.stringify({ prepared: manifest.length, ...counts, sessionDir }));
process.exit(0);

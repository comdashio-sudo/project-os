import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-17 (205-4): recording the consultant's reply to a submittal is its own power, project.consultant.respond. A holder of it replies; a holder of
// project.manage alone (who still writes submittals) is refused; the power held on another project does not answer this one; a second company is
// never reached. On a real database, through the real router, as the restricted application role. Synthetic data only.
const SLUG = "q17-respond";
const SLUG_B = "q17-respond-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "writer", "responder", "manager", "elsewhere", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q17r-${key}`, name: `Q17 ${key}`, email: `q17r-${key}@q17.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = ["17c00000-0000-4000-8000-000000000001", "17c00000-0000-4000-8000-000000000002"];
const PB = "17d00000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "webhook_deliveries", "integration_events", "consultant_submittals", "submittal_reply_codes"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q17r-%'");
}

/** A submittal written and sent by the writer on the given project, ready for a reply. */
async function sentSubmittal(projectId: string, number: string) {
  const writer = callerFor("writer");
  const created = await writer.submittals.create({ tenantId, projectId, submittalType: "shop_drawing", submittalNumber: number, title: "Synthetic facade shop drawing" });
  await writer.submittals.send({ tenantId, projectId, submittalId: created.id });
  return created.id;
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-17 (205-4): the consultant's reply needs project.consultant.respond (or design approval), not project.manage", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q17r-${key}`, `Q17 ${key}`, `q17r-${key}@q17.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q17r-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q17r-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q17 Respond Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q17 Respond Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q17R-1', 'Respond one', 'villas', 'SAR', 'active'), (?, ?, 'Q17R-2', 'Respond two', 'villas', 'SAR', 'active'), (?, ?, 'Q17R-B', 'Other company', 'villas', 'SAR', 'active')", [P[0], tenantId, P[1], tenantId, PB, tenantB]);
    const owner = callerFor("owner");
    const role = (roleCode: string, permissionCodes: string[]) => owner.tenant.createRole({ tenantId, code: roleCode, name: roleCode, productCode: "PROJECT", permissionCodes });
    const writer = await role("Q17R_WRITER", ["project.read", "project.field.manage"]);
    const responder = await role("Q17R_RESPOND", ["project.read", "project.consultant.respond"]);
    const manager = await role("Q17R_MANAGE", ["project.read", "project.manage"]);
    const assign = (key: Key, roleId: string, projectId: string) => owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId, scopeType: "project", scopeId: projectId });
    for (const projectId of P) {
      const [[member]] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, ids.writer]);
      if (member) await owner.tenant.assignMembershipRole({ tenantId, membershipId: member.id, roleId: writer.id, scopeType: "project", scopeId: projectId });
      else await assign("writer", writer.id, projectId);
    }
    await assign("responder", responder.id, P[0]);
    await assign("manager", manager.id, P[0]);
    // the same power, held on the SECOND project only
    await assign("elsewhere", responder.id, P[1]);
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the holder of project.consultant.respond records the reply", async () => {
    const submittalId = await sentSubmittal(P[0], "SUB-Q17-1");
    expect(await code(callerFor("responder").submittals.reply({ tenantId, projectId: P[0], submittalId, replyCode: "A" }))).toBe("no error");
    const [[row]] = await connection.query<{ status: string; repliedByUserId: number }[]>("SELECT status, repliedByUserId FROM consultant_submittals WHERE id = ?", [submittalId]);
    expect(row).toMatchObject({ status: "replied", repliedByUserId: ids.responder });
  });

  it("NEGATIVE: project.manage alone no longer records the reply, and the submittal stays sent", async () => {
    const submittalId = await sentSubmittal(P[0], "SUB-Q17-2");
    expect(await code(callerFor("manager").submittals.reply({ tenantId, projectId: P[0], submittalId, replyCode: "A" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const [[row]] = await connection.query<{ status: string }[]>("SELECT status FROM consultant_submittals WHERE id = ?", [submittalId]);
    expect(row.status).toBe("sent");
  });

  it("SCOPE: the power held on another project does not answer this one", async () => {
    const submittalId = await sentSubmittal(P[0], "SUB-Q17-3");
    expect(await code(callerFor("elsewhere").submittals.reply({ tenantId, projectId: P[0], submittalId, replyCode: "A" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("ISOLATION: the responder of one company reaches nothing of another", async () => {
    expect(await code(callerFor("responder").submittals.list({ tenantId: tenantB, projectId: PB }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});

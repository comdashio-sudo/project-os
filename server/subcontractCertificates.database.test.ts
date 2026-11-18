import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// G-214 (found while mapping Q-43, adviser 18-11: fix first, high priority): no code moved a subcontract certificate out of «draft», and «previous quantity»
// counted approved certificates only — so two certificates could claim the same quantity, and once a certificate was paid its quantity dropped out of
// «previous» again. Now: the certificate moves draft → submitted → approved → paid under project.commitment.manage with an audit row; «previous» is every
// certified quantity (approved and paid); a new certificate waits while an earlier one is still a draft or submitted; and the subcontract must be of the
// project the certificate is written on. On a real database, through the real router, as the restricted application role. Synthetic data only.
const SLUG = "g214-cert";
const SLUG_B = "g214-cert-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "finance", "site", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `g214-${key}`, name: `G214 ${key}`, email: `g214-${key}@g214.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "21400000-0000-4000-8000-000000000001";
const P2 = "21400000-0000-4000-8000-000000000002";
const PB = "21410000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let subcontractId = ""; let otherSubcontractId = ""; let boqId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      await connection.query("DELETE FROM subcontract_certificate_lines WHERE certificateId IN (SELECT id FROM subcontract_certificates WHERE tenantId = ?)", [id]);
      for (const table of ["audit_logs", "subcontract_certificates", "subcontract_contracts", "boq_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'g214-%'");
}
const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
const scope = () => ({ tenantId, projectId: P });
const certificate = (number: string, quantity: number, subcontract = subcontractId) => callerFor("finance").subcontracts.createCertificate({ ...scope(), subcontractId: subcontract, certificateNumber: number, periodStart: new Date("2026-11-01T00:00:00Z"), periodEnd: new Date("2026-11-30T00:00:00Z"), lines: [{ boqItemId: boqId, currentQuantity: quantity }] });
// read as the owner: the certificate list asks for project.read, which the finance manager template does not carry (recorded in STATE, not widened here)
const certificates = () => callerFor("owner").subcontracts.listCertificates({ ...scope(), subcontractId });
const listed = async () => (await certificates()).map(item => ({ number: item.certificateNumber, status: item.status, previous: Number(item.lines[0].previousQuantity), current: Number(item.lines[0].currentQuantity) }));
const byNumber = async (number: string) => (await certificates()).find(item => item.certificateNumber === number)!;
const move = (id: string, nextStatus: "submitted" | "approved" | "paid" | "cancelled", key: Key = "finance") => callerFor(key).subcontracts.transitionCertificate({ ...scope(), certificateId: id, nextStatus });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("G-214: a subcontract certificate cannot claim a quantity twice", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`g214-${key}`, `G214 ${key}`, `g214-${key}@g214.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'g214-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `g214-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "G214 Cert Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "G214 Cert Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'G214-1', 'Cert one', 'villas', 'SAR', 'active'), (?, ?, 'G214-2', 'Cert two', 'villas', 'SAR', 'active'), (?, ?, 'G214-B', 'Other company', 'villas', 'SAR', 'active')", [P, tenantId, P2, tenantId, PB, tenantB]);
    const owner = callerFor("owner");
    for (const [key, roleCode] of [["finance", "FINANCE_MANAGER"], ["site", "SITE_ENGINEER"]] as const) await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: await templateRole(roleCode), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    await owner.boq.create({ ...scope(), code: "G214-BOQ", description: "Synthetic excavation", unitOfMeasure: "m3", quantity: 1000, unitRate: 50 });
    boqId = (await owner.boq.list(scope()))[0].id;
    await owner.subcontracts.create({ ...scope(), code: "G214-SUB", title: "Synthetic earthworks", subcontractorName: "Synthetic Excavators", contractValue: 50000, retentionPercent: 10 });
    await owner.subcontracts.create({ tenantId, projectId: P2, code: "G214-SUB2", title: "Other project's subcontract", subcontractorName: "Synthetic Two", contractValue: 1000 });
    subcontractId = (await owner.subcontracts.list(scope()))[0].id;
    otherSubcontractId = (await owner.subcontracts.list({ tenantId, projectId: P2 }))[0].id;
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("REPRODUCED → FIXED: a second certificate while the first is still a draft is refused, so 200 m3 is not claimed twice", async () => {
    await certificate("G214-C1", 200);
    expect(await code(certificate("G214-C2", 200))).toBe("PROJECT_OS_CERTIFICATE_OPEN_EXISTS");
    expect((await listed()).map(item => item.number)).toEqual(["G214-C1"]);
  });

  it("POSITIVE: draft → submitted → approved → paid, each with an audit row, and the approval names its approver", async () => {
    const first = await byNumber("G214-C1");
    expect((await move(first.id, "submitted")).status).toBe("submitted");
    // separation of duties (adviser 19-11): the finance manager prepared and submitted it, so the owner approves it
    expect(await code(move(first.id, "approved"))).toBe("PROJECT_OS_CERTIFICATE_SELF_APPROVAL");
    expect((await move(first.id, "approved", "owner")).status).toBe("approved");
    expect((await move(first.id, "paid")).status).toBe("paid");
    const [row] = (await connection.query<{ approvedByUserId: number | null; approvedAt: Date | null }[]>("SELECT approvedByUserId, approvedAt FROM subcontract_certificates WHERE id = ?", [first.id]))[0];
    expect([row.approvedByUserId, row.approvedAt !== null]).toEqual([ids.owner, true]);
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'project.subcontract_certificate_transitioned' ORDER BY createdAt", [tenantId]);
    expect(audit.map(item => (JSON.parse(item.metadata) as { nextStatus: string }).nextStatus)).toEqual(["submitted", "approved", "paid"]);
  });

  it("FIXED: a paid certificate stays certified — the next certificate's «previous» is 200, not 0", async () => {
    await certificate("G214-C2", 300);
    const second = await byNumber("G214-C2");
    expect([second.status, Number(second.lines[0].previousQuantity), Number(second.lines[0].cumulativeQuantity)]).toEqual(["draft", 200, 500]);
  });

  it("NEGATIVE: no going back — a paid certificate is not cancelled, a draft is not paid; the site engineer moves nothing", async () => {
    expect(await code(move((await byNumber("G214-C1")).id, "cancelled"))).toBe("PROJECT_OS_CERTIFICATE_TRANSITION_INVALID");
    expect(await code(move((await byNumber("G214-C2")).id, "paid"))).toBe("PROJECT_OS_CERTIFICATE_TRANSITION_INVALID");
    expect(await code(move((await byNumber("G214-C2")).id, "submitted", "site"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect([(await byNumber("G214-C1")).status, (await byNumber("G214-C2")).status]).toEqual(["paid", "draft"]);
  });

  it("a cancelled draft frees the subcontract, and its quantity never counts as certified", async () => {
    await move((await byNumber("G214-C2")).id, "cancelled");
    await certificate("G214-C3", 100);
    expect(Number((await byNumber("G214-C3")).lines[0].previousQuantity)).toBe(200);
  });

  it("CONCURRENCY: two certificates sent at the same moment — exactly one is written", async () => {
    const third = await byNumber("G214-C3");
    await move(third.id, "submitted"); await move(third.id, "approved", "owner");
    const results = await Promise.all([code(certificate("G214-C4", 50)), code(certificate("G214-C5", 50))]);
    expect(results.sort()).toEqual(["PROJECT_OS_CERTIFICATE_OPEN_EXISTS", "no error"]);
  });

  it("SEPARATION OF DUTIES: neither who prepared a certificate nor who submitted it approves it", async () => {
    // the owner prepares C6, the finance manager submits it: both are refused the approval, and it stays submitted
    const [approvedOpen] = (await certificates()).filter(item => item.status === "draft");
    if (approvedOpen) await move(approvedOpen.id, "cancelled");
    await callerFor("owner").subcontracts.createCertificate({ ...scope(), subcontractId, certificateNumber: "G214-C6", periodStart: new Date("2026-11-01T00:00:00Z"), periodEnd: new Date("2026-11-30T00:00:00Z"), lines: [{ boqItemId: boqId, currentQuantity: 10 }] });
    const sixth = await byNumber("G214-C6");
    await move(sixth.id, "submitted");
    expect(await code(move(sixth.id, "approved", "owner"))).toBe("PROJECT_OS_CERTIFICATE_SELF_APPROVAL"); // prepared it
    expect(await code(move(sixth.id, "approved"))).toBe("PROJECT_OS_CERTIFICATE_SELF_APPROVAL"); // submitted it
    expect((await byNumber("G214-C6")).status).toBe("submitted");
  });

  it("SCOPE: a certificate on this project cannot use another project's subcontract; ISOLATION: another company reaches nothing", async () => {
    expect(await code(certificate("G214-X", 10, otherSubcontractId))).toBe("PROJECT_OS_SUBCONTRACT_NOT_FOUND");
    const any = await byNumber("G214-C1");
    expect(await code(callerFor("ownerB").subcontracts.transitionCertificate({ tenantId, projectId: P, certificateId: any.id, nextStatus: "cancelled" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("finance").subcontracts.transitionCertificate({ tenantId: tenantB, projectId: PB, certificateId: any.id, nextStatus: "cancelled" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});

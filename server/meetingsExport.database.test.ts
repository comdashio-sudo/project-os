import JSZip from "jszip";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// Q-25 batch 2 (P-113/P-114), on a real database, through the real router, as the restricted role, with the real storage module against a local S3:
//   (a) whoever records the minutes reads them: a PMO lead (pmo.read + pmo.write, no project.read) records a meeting and can now list it, open it and export it
//       (review of #413 by programmer B); someone holding neither a project read nor a recorder's permission is still refused;
//   (b) the minutes as Word and PDF: fetched and opened, the attendees, the items with their decisions, the raised actions with their owner and the open actions
//       brought forward are all in the file, a draft says so and issued minutes say «issued»; one audit row per export; a refused export writes nothing.
// Synthetic data only.
const SLUG = "q25-export"; const SLUG_B = "q25-export-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P1 = "25ee0000-0000-4000-8000-000000000001"; const P2 = "25ee0000-0000-4000-8000-000000000002";
const KEYS = ["owner", "pm", "pmo", "site", "outsider", "ownerB"] as const; type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q25x-${key}`, name: `Q25X ${key}`, email: `q25x-${key}@q25x.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const fetchBytes = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());
let connection: fixtureDb.Connection; let s3: FakeS3; let tenantId = ""; const memberships = {} as Record<"pm" | "site", string>;

async function docxText(url: string) { const zip = await JSZip.loadAsync(await fetchBytes(url)); return (await zip.file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, ""); }
async function pdfText(bytes: Buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  let text = "";
  for (let p = 1; p <= pdf.numPages; p++) for (const item of (await (await pdf.getPage(p)).getTextContent()).items as Array<{ str: string; hasEOL: boolean }>) text += item.str.normalize("NFKC") + (item.hasEOL ? "\n" : "");
  return text.replace(/\s+/g, " "); // a table cell wraps its text over lines: compare the words in order, not the line breaks
}
const exportsOf = async (meetingId: string) => Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'project.meeting_exported' AND entityId = ?", [tenantId, meetingId]))[0][0].n);

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["actions", "project_meeting_items", "project_meeting_attendees", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("UPDATE project_meetings SET previousMeetingId = NULL WHERE tenantId = ?", [id]).catch(() => undefined);
      await connection.query("DELETE FROM project_meetings WHERE tenantId = ?", [id]).catch(() => undefined);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q25x-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-25 batch 2: who records the minutes reads them, and the minutes as Word and PDF", () => {
  let draftId = ""; let issuedId = "";
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q25x-${key}`, `Q25X ${key}`, `q25x-${key}@q25x.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q25x-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q25x-${key}`)!.id;
    const owner = callerFor("owner");
    ({ tenantId } = await owner.tenant.create({ legalName: "Q25X Minutes Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callerFor("ownerB").tenant.create({ legalName: "Q25X Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q25X-1', 'Minutes one', 'villas', 'SAR', 'active'), (?, ?, 'Q25X-2', 'Minutes two', 'villas', 'SAR', 'active')", [P1, tenantId, P2, tenantId]);
    await owner.tenant.administration({ tenantId });
    await owner.tenant.createRole({ tenantId, code: "Q25X_PMO_READER", name: "PMO reader only", productCode: "PMO", permissionCodes: ["pmo.read"] });
    const role = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pm, roleId: await role("PROJECT_MANAGER"), scopeType: "project", scopeId: P1 });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pmo, roleId: await role("PMO_LEAD"), scopeType: "project", scopeId: P1 });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await role("SITE_ENGINEER"), scopeType: "project", scopeId: P1 });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.outsider, roleId: await role("Q25X_PMO_READER"), scopeType: "project", scopeId: P1 });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const [members] = await connection.query<{ id: string; userId: number }[]>("SELECT id, userId FROM memberships WHERE tenantId = ?", [tenantId]);
    memberships.pm = members.find(row => row.userId === ids.pm)!.id; memberships.site = members.find(row => row.userId === ids.site)!.id;

    // an earlier meeting with one open action, issued; then the draft whose minutes are exported (it brings that action forward)
    const pm = callerFor("pm");
    ({ id: issuedId } = await pm.meetings.create({ tenantId, projectId: P1, meetingType: "progress", title: "Weekly progress 7", heldAt: new Date("2026-11-03T07:00:00Z"), attendees: [] }));
    await pm.meetings.addItem({ tenantId, projectId: P1, meetingId: issuedId, topic: "Façade mock-up", decision: "Approve sample C" });
    await pm.meetings.addAction({ tenantId, projectId: P1, meetingId: issuedId, title: "Order the façade panels", ownerMembershipId: memberships.site, dueAt: new Date("2026-11-20T00:00:00Z"), priority: "high" });
    await pm.meetings.issue({ tenantId, projectId: P1, meetingId: issuedId });
    ({ id: draftId } = await pm.meetings.create({ tenantId, projectId: P1, meetingType: "coordination", title: "Weekly progress 8", heldAt: new Date("2026-11-10T07:00:00Z"), location: "Site office", previousMeetingId: issuedId,
      attendees: [{ membershipId: memberships.pm, name: "Q25X pm" }, { name: "Synthetic Consultant Rep", organisation: "Consultant (example)", present: false }] }));
    await pm.meetings.addItem({ tenantId, projectId: P1, meetingId: draftId, topic: "Block C slab pour", discussion: "Pump availability on Thursday", decision: "Pour on Thursday 06:00" });
    await pm.meetings.addAction({ tenantId, projectId: P1, meetingId: draftId, title: "Book the concrete pump", ownerMembershipId: memberships.site, priority: "critical" });
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } if (s3) await s3.close(); });

  it("(a) the PMO lead (pmo.write, no project.read) records a meeting and reads it back — list, open, export; one holding neither is refused", async () => {
    const pmo = callerFor("pmo");
    const { id } = await pmo.meetings.create({ tenantId, projectId: P1, meetingType: "other", title: "PMO portfolio review", heldAt: new Date("2026-11-12T09:00:00Z"), attendees: [] });
    await pmo.meetings.addItem({ tenantId, projectId: P1, meetingId: id, topic: "Synthetic portfolio item" });
    expect((await pmo.meetings.list({ tenantId, projectId: P1 })).map(row => row.title)).toContain("PMO portfolio review");
    expect((await pmo.meetings.get({ tenantId, projectId: P1, meetingId: id })).items.map(item => item.topic)).toEqual(["Synthetic portfolio item"]);
    expect((await pmo.meetings.export({ tenantId, projectId: P1, meetingId: id, format: "docx", locale: "en" })).fileName).toMatch(/\.docx$/);
    // pmo.read alone is neither a project read nor a recorder: still refused, nothing exported
    expect(await code(callerFor("outsider").meetings.list({ tenantId, projectId: P1 }))).toMatch(/PERMISSION_DENIED|SCOPE/);
    expect(await code(callerFor("outsider").meetings.export({ tenantId, projectId: P1, meetingId: draftId, format: "pdf", locale: "en" }))).toMatch(/PERMISSION_DENIED|SCOPE/);
    // and the PMO lead still writes nothing on a project it holds no assignment for
    expect(await code(pmo.meetings.list({ tenantId, projectId: P2 }))).toMatch(/PERMISSION_DENIED|SCOPE/);
  });

  it("(b) Word, in Arabic: the attendees, the item with its decision, the raised action with its owner, the action brought forward — and «draft» while it is one", async () => {
    const before = await exportsOf(draftId);
    const file = await callerFor("site").meetings.export({ tenantId, projectId: P1, meetingId: draftId, format: "docx", locale: "ar" }); // a reader exports
    expect(file.fileName).toBe(`minutes-2026-11-10-${draftId.slice(0, 8)}.docx`);
    const text = await docxText(file.url);
    for (const expected of ["محضر اجتماع", "Minutes one", "Weekly progress 8", "تنسيق", "Site office", "Synthetic Consultant Rep", "Consultant (example)", "Block C slab pour", "Pump availability on Thursday", "Pour on Thursday 06:00",
      "Book the concrete pump", "Q25X site", "حرجة", "Order the façade panels", "2026-11-20", "مسودة — غير صادر"]) expect(text, expected).toContain(expected);
    expect(text).not.toContain("Façade mock-up"); // the earlier meeting's minutes are its own, only its open action is brought forward
    expect(await exportsOf(draftId)).toBe(before + 1);
  });

  it("(b) PDF, in English, once issued: «issued», the same lines; one audit row per export", async () => {
    await callerFor("pm").meetings.issue({ tenantId, projectId: P1, meetingId: draftId });
    const before = await exportsOf(draftId);
    const file = await callerFor("pm").meetings.export({ tenantId, projectId: P1, meetingId: draftId, format: "pdf", locale: "en" });
    const bytes = await fetchBytes(file.url);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const text = await pdfText(bytes);
    for (const expected of ["Minutes of meeting", "Weekly progress 8", "Coordination", "Issued", "Block C slab pour", "Pour on Thursday 06:00", "Book the concrete pump", "Critical", "Order the façade panels", "Brought forward"]) expect(text, expected).toMatch(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    expect(text).not.toMatch(/Draft — not issued/);
    expect(await exportsOf(draftId)).toBe(before + 1);
  });

  it("ISOLATION: another company is refused, a meeting asked for under another project is not found — and a refused export stores nothing and writes no audit row", async () => {
    const objects = s3.objects.size; const before = await exportsOf(draftId);
    expect(await code(callerFor("ownerB").meetings.export({ tenantId, projectId: P1, meetingId: draftId, format: "docx", locale: "en" }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("owner").meetings.export({ tenantId, projectId: P2, meetingId: draftId, format: "docx", locale: "en" }))).toBe("PROJECT_OS_MEETING_NOT_FOUND");
    expect([s3.objects.size, await exportsOf(draftId)]).toEqual([objects, before]);
  });
});

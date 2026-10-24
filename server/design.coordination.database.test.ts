import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 5, item 7, on a real database and through the real router: the drawing register with revisions, transmittals, design comments,
// consultant submittals A/B/C/D and the board. Who may do what is proved with real roles built through the role API (so the separation-of-duties
// rule of the role API is in play), and the rules about PEOPLE (whoever issued a revision does not approve it, whoever answered a comment does
// not close it, whoever sent a submittal does not record its reply) are proved with the one person who holds every power: the company owner.
// Synthetic data only.
const SLUG = "design-coordination";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@design.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const DENIED = "PROJECT_OS_PERMISSION_DENIED";

let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = ""; let projectId = ""; let otherProjectId = "";
const ids: Record<string, number> = {};
const KEYS = ["owner", "arch", "tech", "approver", "reader", "stranger", "otherOwner", "scoped"] as const;
type Key = (typeof KEYS)[number];
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
const input = (extra: Record<string, unknown> = {}) => ({ tenantId, projectId, ...extra });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["design_transmittal_items", "design_comments", "consultant_submittals", "design_transmittals", "design_drawing_revisions", "design_drawings"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'dsg-%'");
}

const ROLES: Array<{ key: Key; code: string; permissions: string[]; scope?: "project" }> = [
  { key: "arch", code: "DSG_ARCH", permissions: ["project.read", "project.design.manage", "project.design.architectural"] },
  { key: "tech", code: "DSG_TECH", permissions: ["project.read", "project.design.manage", "project.design.technical"] },
  { key: "approver", code: "DSG_APPROVER", permissions: ["project.read", "project.design.approve"] },
  { key: "reader", code: "DSG_READER", permissions: ["project.read"] },
  { key: "scoped", code: "DSG_SCOPED", permissions: ["project.read", "project.design.manage", "project.design.architectural", "project.design.technical"], scope: "project" },
];

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("technical and architectural coordination on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`dsg-${key}`, `Design ${key}`, `dsg-${key}@design.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'dsg-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `dsg-${key}`)!.id; callers[key] = callerFor(ids[key], `dsg-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Design Coordination Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Design Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    projectId = "d5000000-0000-4000-8000-000000000001"; otherProjectId = "d5000000-0000-4000-8000-000000000002";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'DSG-1', 'Design villas', 'villas', 'SAR', 'active'), (?, ?, 'DSG-2', 'Second project', 'villas', 'SAR', 'active')", [projectId, tenantId, otherProjectId, tenantId]);
    for (const role of ROLES) {
      const created = await callers.owner.tenant.createRole({ tenantId, code: role.code, name: role.code, productCode: "PROJECT", permissionCodes: role.permissions });
      await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids[role.key], roleId: created.id, scopeType: role.scope ?? "company", ...(role.scope ? { scopeId: projectId } : {}) });
    }
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("the role API itself refuses one role that both issues and approves (the powers are separated)", async () => {
    await expect(callers.owner.tenant.createRole({ tenantId, code: "DSG_BOTH", name: "Both", productCode: "PROJECT", permissionCodes: ["project.read", "project.design.manage", "project.design.approve"] })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
  });

  it("registering a drawing needs design authority over its DISCIPLINE: architectural ≠ structural, readers and strangers get nothing", async () => {
    const a = await callers.arch.design.registerDrawing(input({ drawingNumber: "A-101", title: "Ground floor plan", discipline: "architectural", revision: "A" }));
    expect(a.status).toBe("registered");
    await expect(callers.arch.design.registerDrawing(input({ drawingNumber: "S-101", title: "Foundation plan", discipline: "structural", revision: "A" }))).rejects.toThrow(DENIED);
    await expect(callers.tech.design.registerDrawing(input({ drawingNumber: "A-102", title: "First floor plan", discipline: "interior", revision: "A" }))).rejects.toThrow(DENIED);
    expect((await callers.tech.design.registerDrawing(input({ drawingNumber: "S-101", title: "Foundation plan", discipline: "structural", revision: "A" }))).status).toBe("registered");
    for (const who of ["reader", "approver"] as const) await expect(callers[who].design.registerDrawing(input({ drawingNumber: `X-${who}`, title: "Nope", discipline: "architectural", revision: "A" }))).rejects.toThrow(DENIED);
    await expect(callers.stranger.design.registerDrawing(input({ drawingNumber: "X-1", title: "Nope", discipline: "architectural", revision: "A" }))).rejects.toThrow();
    await expect(callers.arch.design.registerDrawing(input({ drawingNumber: "A-101", title: "Again", discipline: "architectural", revision: "A" }))).rejects.toThrow("PROJECT_OS_DESIGN_DUPLICATE");
    const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM design_drawings WHERE projectId = ?", [projectId]);
    expect(Number(rows[0].n)).toBe(2);
  });

  it("a new revision supersedes the old one, keeps the register consistent, and cannot repeat a revision letter", async () => {
    const list = await callers.arch.design.drawings(input());
    const a101 = list.find(item => item.drawingNumber === "A-101")!;
    await callers.arch.design.addRevision(input({ drawingId: a101.id, revision: "B", description: "Door schedule updated" }));
    const revisions = await callers.reader.design.revisions(input({ drawingId: a101.id }));
    expect(revisions.map(item => [item.revision, item.isCurrent]).sort()).toEqual([["A", false], ["B", true]]);
    expect((await callers.reader.design.drawings(input())).find(item => item.drawingNumber === "A-101")).toMatchObject({ currentRevision: "B", status: "registered" });
    await expect(callers.arch.design.addRevision(input({ drawingId: a101.id, revision: "A" }))).rejects.toThrow("PROJECT_OS_DESIGN_DUPLICATE");
    // the structural coordinator has no authority over an architectural drawing
    await expect(callers.tech.design.addRevision(input({ drawingId: a101.id, revision: "C" }))).rejects.toThrow(DENIED);
  });

  it("transmittal → review comments → approval: the whole life of one drawing, with the people-rules", async () => {
    const drawings = await callers.reader.design.drawings(input());
    const a101 = drawings.find(item => item.drawingNumber === "A-101")!;
    const [revision] = (await callers.reader.design.revisions(input({ drawingId: a101.id }))).filter(item => item.isCurrent);
    // approval is not possible before the drawing is under review
    await expect(callers.approver.design.approveDrawing(input({ drawingId: a101.id }))).rejects.toThrow("PROJECT_OS_DESIGN_APPROVAL_STATE_INVALID");
    const transmittal = await callers.arch.design.createTransmittal(input({ transmittalNumber: "TR-001", direction: "outgoing", counterparty: "Consultant Office", subject: "Issue for review", revisionIds: [revision.id] }));
    await expect(callers.arch.design.createTransmittal(input({ transmittalNumber: "TR-002", direction: "outgoing", counterparty: "X Office", subject: "Empty", revisionIds: [] }))).rejects.toThrow();
    await expect(callers.arch.design.transitionTransmittal(input({ transmittalId: transmittal.id, nextStatus: "acknowledged" }))).rejects.toThrow("PROJECT_OS_DESIGN_TRANSMITTAL_TRANSITION_INVALID");
    await callers.arch.design.transitionTransmittal(input({ transmittalId: transmittal.id, nextStatus: "sent" }));
    expect((await callers.reader.design.drawings(input())).find(item => item.drawingNumber === "A-101")?.status).toBe("under_review");
    expect((await callers.reader.design.transmittals(input()))[0]).toMatchObject({ transmittalNumber: "TR-001", status: "sent", items: ["A-101 / B"] });

    // a review comment: while it is not closed the drawing cannot be approved
    const comment = await callers.arch.design.raiseComment(input({ drawingId: a101.id, commentNumber: "RC-001", raisedBy: "Consultant", severity: "major", commentText: "Door D3 clash with the stair" }));
    await expect(callers.approver.design.approveDrawing(input({ drawingId: a101.id }))).rejects.toThrow("PROJECT_OS_DESIGN_OPEN_COMMENTS");
    await expect(callers.arch.design.transitionComment(input({ commentId: comment.id, nextStatus: "responded" }))).rejects.toThrow("PROJECT_OS_DESIGN_COMMENT_RESPONSE_REQUIRED");
    await expect(callers.approver.design.transitionComment(input({ commentId: comment.id, nextStatus: "responded", responseText: "fixed" }))).rejects.toThrow(DENIED); // only a coordinator answers
    await callers.arch.design.transitionComment(input({ commentId: comment.id, nextStatus: "responded", responseText: "Door moved 300 mm" }));
    await expect(callers.arch.design.transitionComment(input({ commentId: comment.id, nextStatus: "closed" }))).rejects.toThrow(DENIED); // the coordinator cannot close their own answer
    await expect(callers.approver.design.approveDrawing(input({ drawingId: a101.id }))).rejects.toThrow("PROJECT_OS_DESIGN_OPEN_COMMENTS"); // answered is not closed
    await callers.approver.design.transitionComment(input({ commentId: comment.id, nextStatus: "closed" }));
    await expect(callers.approver.design.transitionComment(input({ commentId: comment.id, nextStatus: "open" }))).rejects.toThrow("PROJECT_OS_DESIGN_COMMENT_TRANSITION_INVALID");

    // the company owner holds both powers, so the rule about people is what stops them closing what they answered
    const own = await callers.owner.design.raiseComment(input({ drawingId: a101.id, commentNumber: "RC-002", raisedBy: "Consultant", severity: "minor", commentText: "Note text" }));
    await callers.owner.design.transitionComment(input({ commentId: own.id, nextStatus: "responded", responseText: "Done" }));
    await expect(callers.owner.design.transitionComment(input({ commentId: own.id, nextStatus: "closed" }))).rejects.toThrow("PROJECT_OS_DESIGN_SELF_CLOSE");
    await callers.approver.design.transitionComment(input({ commentId: own.id, nextStatus: "closed" }));

    // approval: not by the person who issued the revision, even when they hold the power
    await connection.query("UPDATE design_drawing_revisions SET issuedByUserId = ? WHERE id = ?", [ids.approver, revision.id]);
    await expect(callers.approver.design.approveDrawing(input({ drawingId: a101.id }))).rejects.toThrow("PROJECT_OS_DESIGN_SELF_APPROVAL");
    await connection.query("UPDATE design_drawing_revisions SET issuedByUserId = ? WHERE id = ?", [ids.arch, revision.id]);
    await expect(callers.arch.design.approveDrawing(input({ drawingId: a101.id }))).rejects.toThrow(DENIED);
    expect(await callers.approver.design.approveDrawing(input({ drawingId: a101.id }))).toMatchObject({ status: "approved", revision: "B" });
    // an approved drawing takes no new comment; a new revision voids the approval
    await expect(callers.arch.design.raiseComment(input({ drawingId: a101.id, commentNumber: "RC-003", raisedBy: "Consultant", severity: "minor", commentText: "Late note" }))).rejects.toThrow("PROJECT_OS_DESIGN_DRAWING_APPROVED");
    await callers.arch.design.addRevision(input({ drawingId: a101.id, revision: "C" }));
    expect((await callers.reader.design.drawings(input())).find(item => item.drawingNumber === "A-101")?.status).toBe("registered");
    await callers.arch.design.transitionTransmittal(input({ transmittalId: transmittal.id, nextStatus: "acknowledged" }));
  }, 120_000);

  it("submittals to the consultant: A/B/C/D, a reply never by the sender, and resubmission only after C or D", async () => {
    const first = await callers.arch.design.createSubmittal(input({ submittalNumber: "SUB-001", title: "Facade mock-up", discipline: "architectural", dueAt: new Date(Date.now() - 86_400_000) }));
    await expect(callers.arch.design.createSubmittal(input({ submittalNumber: "SUB-X", title: "Wrong discipline", discipline: "structural" }))).rejects.toThrow(DENIED);
    await expect(callers.approver.design.transitionSubmittal(input({ submittalId: first.id, nextStatus: "replied", replyCode: "A" }))).rejects.toThrow("PROJECT_OS_DESIGN_SUBMITTAL_TRANSITION_INVALID"); // not sent yet
    await expect(callers.arch.design.createSubmittal(input({ submittalNumber: "SUB-R0", title: "Too early", discipline: "architectural", resubmissionOfId: first.id }))).rejects.toThrow("PROJECT_OS_DESIGN_RESUBMISSION_INVALID");
    await callers.arch.design.transitionSubmittal(input({ submittalId: first.id, nextStatus: "submitted" }));
    await expect(callers.approver.design.transitionSubmittal(input({ submittalId: first.id, nextStatus: "replied" }))).rejects.toThrow("PROJECT_OS_DESIGN_REPLY_CODE_REQUIRED");
    await expect(callers.arch.design.transitionSubmittal(input({ submittalId: first.id, nextStatus: "replied", replyCode: "A" }))).rejects.toThrow(DENIED);
    // the owner sent a second one and holds the approval power: the rule about people stops them recording its reply
    const mine = await callers.owner.design.createSubmittal(input({ submittalNumber: "SUB-002", title: "Tiles", discipline: "interior" }));
    await callers.owner.design.transitionSubmittal(input({ submittalId: mine.id, nextStatus: "submitted" }));
    await expect(callers.owner.design.transitionSubmittal(input({ submittalId: mine.id, nextStatus: "replied", replyCode: "A" }))).rejects.toThrow("PROJECT_OS_DESIGN_SELF_REPLY");
    await callers.approver.design.transitionSubmittal(input({ submittalId: mine.id, nextStatus: "replied", replyCode: "B", replyNote: "Approved as noted" }));
    await expect(callers.arch.design.createSubmittal(input({ submittalNumber: "SUB-R1", title: "Not needed", discipline: "interior", resubmissionOfId: mine.id }))).rejects.toThrow("PROJECT_OS_DESIGN_RESUBMISSION_INVALID"); // B was accepted
    await callers.approver.design.transitionSubmittal(input({ submittalId: first.id, nextStatus: "replied", replyCode: "C", replyNote: "Revise the glazing detail" }));
    const again = await callers.arch.design.createSubmittal(input({ submittalNumber: "SUB-001-R1", title: "Facade mock-up (resubmitted)", discipline: "architectural", resubmissionOfId: first.id }));
    expect(again.status).toBe("draft");
    await callers.arch.design.transitionSubmittal(input({ submittalId: first.id, nextStatus: "closed" }));
    const list = await callers.reader.design.submittals(input());
    expect(list.find(item => item.submittalNumber === "SUB-001")).toMatchObject({ status: "closed", replyCode: "C" });
    expect(list.find(item => item.submittalNumber === "SUB-001-R1")?.resubmissionOfId).toBe(first.id);
  }, 120_000);

  it("the board counts what the register holds", async () => {
    const board = await callers.reader.design.dashboard(input());
    expect(board.drawings.total).toBe(2);
    expect(board.drawings.byStatus.registered + board.drawings.byStatus.under_review + board.drawings.byStatus.approved + board.drawings.byStatus.cancelled).toBe(2);
    expect(board.drawings.disciplines.map(item => item.discipline)).toEqual(["architectural", "structural"]);
    expect(board.comments).toMatchObject({ open: 0, responded: 0, closed: 2 });
    const comments = await callers.reader.design.comments(input());
    expect(comments.map(item => [item.commentNumber, item.status, item.drawingNumber, item.revision]).sort()).toEqual([["RC-001", "closed", "A-101", "B"], ["RC-002", "closed", "A-101", "B"]]);
    expect(board.transmittals).toMatchObject({ draft: 0, sent: 0, acknowledged: 1 });
    expect(board.submittals.replies).toEqual({ A: 0, B: 1, C: 1, D: 0 });
    expect(board.submittals.draft).toBe(1);
    expect(board.submittals.averageReplyDays).not.toBeNull();
    // a project with no drawings is "not started", never 0% or 100%
    const empty = await callers.owner.design.dashboard({ tenantId, projectId: otherProjectId });
    expect(empty.drawings.completionPercent).toBeNull();
    expect(empty.drawings.total).toBe(0);
  });

  it("isolation: another company, a stranger, another project and a role limited to one project see and change nothing outside their scope", async () => {
    const other = { tenantId, projectId };
    await expect(callers.otherOwner.design.drawings(other)).rejects.toThrow();
    await expect(callers.stranger.design.dashboard(other)).rejects.toThrow();
    // the same company's other project holds none of this project's records
    expect((await callers.owner.design.drawings({ tenantId, projectId: otherProjectId })).length).toBe(0);
    // a project named under a company that does not own it
    await expect(callers.otherOwner.design.drawings({ tenantId: otherTenantId, projectId })).rejects.toThrow();
    // the scoped coordinator works in project 1 and is refused in project 2
    expect((await callers.scoped.design.registerDrawing({ tenantId, projectId, drawingNumber: "M-101", title: "HVAC layout", discipline: "mechanical", revision: "A" })).status).toBe("registered");
    await expect(callers.scoped.design.registerDrawing({ tenantId, projectId: otherProjectId, drawingNumber: "M-201", title: "HVAC layout", discipline: "mechanical", revision: "A" })).rejects.toThrow();
    // a record of project 1 cannot be reached through project 2
    const list = await callers.owner.design.drawings(input());
    await expect(callers.owner.design.addRevision({ tenantId, projectId: otherProjectId, drawingId: list[0].id, revision: "Z" })).rejects.toThrow("PROJECT_OS_DESIGN_DRAWING_NOT_FOUND");
  });

  it("every write left an audit row, and cancelling a drawing blocks further work on it", async () => {
    const list = await callers.owner.design.drawings(input());
    const mech = list.find(item => item.drawingNumber === "M-101")!;
    await callers.tech.design.cancelDrawing(input({ drawingId: mech.id }));
    await expect(callers.tech.design.addRevision(input({ drawingId: mech.id, revision: "B" }))).rejects.toThrow("PROJECT_OS_DESIGN_DRAWING_CANCELLED");
    const [rows] = await connection.query<{ action: string; n: number }[]>("SELECT action, COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action LIKE 'design.%' GROUP BY action", [tenantId]);
    const seen = new Map(rows.map(row => [row.action, Number(row.n)]));
    for (const action of ["design.drawing_registered", "design.revision_added", "design.drawing_approved", "design.drawing_cancelled", "design.transmittal_created", "design.transmittal_status_transitioned", "design.comment_raised", "design.comment_status_transitioned", "design.submittal_created", "design.submittal_status_transitioned"]) expect(seen.get(action), action).toBeGreaterThan(0);
  });
});

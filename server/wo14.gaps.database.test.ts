import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { applyExternalBatch } from "./integrations/external";

// Work order 14, item 3, on a real database with the application running as the restricted role:
//   · the design-coordination submittals and the consultant register are ONE table (a design submittal appears in the register with its discipline and consultant, and its
//     reply is announced like any other);
//   · an open NCR on a unit and activity keeps an inspection from counting as accepted — refused by default, a warning or nothing by the company's choice — on every road
//     that records an answer, and in the database's own count of acceptance.
// Synthetic data only.
process.env.INTEGRATION_SECRET_KEY = "test-only-integration-secret-0123456789"; // secret-scan:allow a test-only value, never a real key
process.env.INTEGRATION_ALLOW_PRIVATE_WEBHOOKS = "1"; // a local receiver address is only stored here, never called
const SLUG = "wo14-gaps";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@wo14.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const KEYS = ["owner", "coord"] as const;
const id = (n: number) => `fa000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = id(1); const WBS = id(10); const ZONE = id(20); const BLOCK = id(21); const U1 = id(22); const U2 = id(23); const GROUP = id(24); const STAGE = id(25); const WALLS = id(26);

let connection: fixtureDb.Connection; let tenantId = "";
const userIds: Record<string, number> = {}; const callers: Record<string, ReturnType<typeof callerFor>> = {};
const scope = () => ({ tenantId, projectId: P });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id: company } of companies) {
    for (const table of ["webhook_deliveries", "webhook_endpoints", "integration_sync_items", "integration_inbound_records", "integration_sync_runs", "integration_mappings", "consultant_submittals", "submittal_reply_codes", "tenant_policies", "ncrs",
      "pmc_unit_activity_history", "pmc_inspection_steps", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_progress", "progress_entries", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "design_drawing_revisions", "design_drawings", "wbs_items", "audit_logs", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'wo14-%'");
}
/** An inspection request for the unit, waiting at its result step. */
async function waitingRequest(unit: string, code: string) {
  const requestId = crypto.randomUUID();
  await connection.query("INSERT INTO pmc_inspection_requests (id, tenantId, projectId, requestCode, activityDefinitionId, requestedAt) VALUES (?, ?, ?, ?, ?, ?)", [requestId, tenantId, P, code, WALLS, new Date()]);
  await connection.query("INSERT INTO pmc_inspection_request_units (id, tenantId, projectId, inspectionRequestId, unitId) VALUES (gen_random_uuid(), ?, ?, ?, ?)", [tenantId, P, requestId, unit]);
  await connection.query("INSERT INTO pmc_inspection_steps (id, tenantId, projectId, inspectionRequestId, stepCode, stepOrder, status) VALUES (gen_random_uuid(), ?, ?, ?, 'RESULT_RECEIVING', 7, 'in_progress')", [tenantId, P, requestId]);
  return requestId;
}
const accepted = async (unit: string) => { const [rows] = await connection.query<{ ok: boolean }[]>("SELECT project_os_cell_qc_accepted(?, ?) AS ok", [unit, WALLS]); return Boolean(rows[0].ok); };
const setNcrMode = (ncrAcceptanceMode: "off" | "warn" | "block") => callers.owner.policy.set({ tenantId, qcCompletionMode: "block", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn", ncrAcceptanceMode });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("work order 14 gaps on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`wo14-${key}`, `Wo14 ${key}`, `wo14-${key}@wo14.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'wo14-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `wo14-${key}`)!.id; callers[key] = callerFor(userIds[key], `wo14-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Wo14 Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'W14', 'Villas', 'villas', 'SAR', 'active')", [P, tenantId]);
    const administration = await callers.owner.tenant.administration({ tenantId });
    const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: "wo14-coord@wo14.example.test", roleId: administration.roles.find(role => role.code === "PROJECT_COORDINATOR")!.id, scopeType: "project", scopeId: P });
    await callers.coord.tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'WBS-1', 'Masonry', 100000)", [WBS, tenantId, P]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantId, P, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'A', 1)", [U1, tenantId, P, BLOCK, U2, tenantId, P, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'FIN', 'Finishing')", [GROUP, tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [STAGE, tenantId, P, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, wbsItemId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 100)", [WALLS, tenantId, P, GROUP, STAGE, WBS]);
  }, 240_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("a design submittal is a row of the consultant register: same table, its discipline and consultant, a reply that is announced like any other", async () => {
    await callers.owner.integrations.createWebhook({ tenantId, url: "https://receiver.example.test/hooks", events: ["submittal.replied"] });
    const created = await callers.owner.design.createSubmittal({ ...scope(), submittalNumber: "DS-1", title: "Facade shop drawings", discipline: "architectural", consultant: "Alpha Consultants" });
    const register = (await callers.owner.submittals.list(scope())).find(row => row.id === created.id);
    expect(register).toMatchObject({ submittalType: "shop_drawing", discipline: "architectural", consultant: "Alpha Consultants", status: "draft" });
    await callers.owner.design.transitionSubmittal({ ...scope(), submittalId: created.id, nextStatus: "submitted" });
    expect((await callers.owner.submittals.list(scope())).find(row => row.id === created.id)).toMatchObject({ status: "sent", daysAtConsultant: 0 });
    expect((await callers.owner.design.submittals(scope())).find(row => row.id === created.id)).toMatchObject({ status: "submitted", consultant: "Alpha Consultants" }); // the design screen still speaks its own vocabulary
    // the person who sent it does not record the reply; another does, and the register shows the company's code
    await expect(callers.owner.design.transitionSubmittal({ ...scope(), submittalId: created.id, nextStatus: "replied", replyCode: "B" })).rejects.toThrow("PROJECT_OS_DESIGN_SELF_REPLY");
    await callers.coord.design.transitionSubmittal({ ...scope(), submittalId: created.id, nextStatus: "replied", replyCode: "B", replyNote: "Approved as noted" });
    expect((await callers.owner.submittals.list(scope())).find(row => row.id === created.id)).toMatchObject({ status: "replied", replyCode: "B", approved: true });
    const [events] = await connection.query<{ payload: string }[]>("SELECT payload FROM webhook_deliveries WHERE tenantId = ? AND eventType = 'submittal.replied'", [tenantId]);
    expect(events).toHaveLength(1);
    expect(JSON.parse(events[0].payload).data).toMatchObject({ submittalId: created.id, submittalNumber: "DS-1", replyCode: "B", approved: true });
    // the board counts them from the same table
    expect((await callers.owner.design.dashboard(scope())).submittals.replies.B).toBe(1);
    // a second register entry made on the register side shows next to it, and only design ones carry a discipline
    await callers.owner.submittals.create({ ...scope(), submittalType: "method_statement", submittalNumber: "MS-1", title: "Concrete method", consultant: "Beta Engineering" });
    const all = await callers.owner.submittals.list(scope());
    expect(all.map(row => row.submittalNumber).sort()).toEqual(["DS-1", "MS-1"]);
    expect((await callers.owner.design.submittals(scope())).map(row => row.submittalNumber)).toEqual(["DS-1"]);
  });

  it("an open NCR keeps an inspection from being accepted: refused by default on the screen's road and the external road, a warning or nothing by the company's choice", async () => {
    await callers.owner.ncrs.create({ ...scope(), ncrNumber: "NCR-1", title: "Honeycombing", description: "Honeycombing in the wall", pmcUnitId: U1, pmcActivityDefinitionId: WALLS });
    // no policy row yet: the default is block
    const first = await waitingRequest(U1, "IR-1");
    await expect(callers.owner.pmc.respondInspection({ ...scope(), inspectionRequestId: first, responseCode: "A" })).rejects.toThrow("PROJECT_OS_NCR_OPEN_BLOCKS_ACCEPTANCE");
    const [[unanswered]] = await connection.query<{ responseCode: string | null }[]>("SELECT responseCode FROM pmc_inspection_requests WHERE id = ?", [first]);
    expect(unanswered.responseCode).toBeNull(); // nothing was written
    // a refusal of the work is always welcome, whatever is open
    await expect(callers.owner.pmc.respondInspection({ ...scope(), inspectionRequestId: first, responseCode: "C" })).resolves.toMatchObject({ responseCode: "C" });
    // the same rule on the external road: the answer is refused with the NCR's number, a rejection is recorded
    const actor = { tenantId };
    const external = (responseCode: "A" | "C", externalId: string, requestCode: string) => applyExternalBatch({ actor, system: "quality", entity: "inspections", records: [{ externalId, project: "W14", requestCode, units: [1], activity: "WALLS", requestedAt: new Date().toISOString(), responseCode }] });
    const blocked = await external("A", "EXT-1", "IR-EXT-1");
    expect(blocked).toMatchObject({ rejected: 1, accepted: 0 });
    const [items] = await connection.query<{ outcome: string; reason: string; detail: string }[]>("SELECT outcome, reason, detail FROM integration_sync_items WHERE runId = ?", [blocked.runId]);
    expect(items[0]).toMatchObject({ outcome: "rejected", reason: "NCR_OPEN_BLOCKS_ACCEPTANCE", detail: "NCR-1" });
    expect(await external("C", "EXT-2", "IR-EXT-2")).toMatchObject({ rejected: 0, accepted: 1 });
    // warn: recorded, and the answer says why it is doubtful
    await setNcrMode("warn");
    const second = await waitingRequest(U1, "IR-2");
    expect(await callers.owner.pmc.respondInspection({ ...scope(), inspectionRequestId: second, responseCode: "A" })).toMatchObject({ responseCode: "A", warning: "NCR_OPEN", openNcrs: ["NCR-1"] });
    expect(await accepted(U1)).toBe(true); // warn does not change the database's count
    // off: nothing is said
    await setNcrMode("off");
    const third = await waitingRequest(U1, "IR-3");
    expect(await callers.owner.pmc.respondInspection({ ...scope(), inspectionRequestId: third, responseCode: "A" })).toEqual({ responseCode: "A" });
  });

  it("the database does not count an acceptance while the NCR rule is block and an NCR is open — so a cell cannot become COMPLETE through any road — and counts it again once the NCR is closed", async () => {
    await setNcrMode("block");
    // IR-2/IR-3 (answered A earlier on U1) are in the table, and NCR-1 is open on U1/WALLS
    expect(await accepted(U1)).toBe(false);
    await expect(callers.owner.pmc.setUnitActivityStatus({ ...scope(), unitId: U1, activityDefinitionId: WALLS, status: "COMPLETE" })).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED");
    // a unit with no NCR is unaffected: answer U2 with A directly, as an earlier road would have
    const clean = crypto.randomUUID();
    await connection.query("INSERT INTO pmc_inspection_requests (id, tenantId, projectId, requestCode, activityDefinitionId, responseCode, requestedAt) VALUES (?, ?, ?, 'IR-U2', ?, 'A', ?)", [clean, tenantId, P, WALLS, new Date()]);
    await connection.query("INSERT INTO pmc_inspection_request_units (id, tenantId, projectId, inspectionRequestId, unitId) VALUES (gen_random_uuid(), ?, ?, ?, ?)", [tenantId, P, clean, U2]);
    expect(await accepted(U2)).toBe(true);
    // raising an NCR on U2 later withdraws the acceptance; closing it gives it back
    await callers.owner.ncrs.create({ ...scope(), ncrNumber: "NCR-2", title: "Crack", description: "Crack in the wall", pmcUnitId: U2, pmcActivityDefinitionId: WALLS });
    expect(await accepted(U2)).toBe(false);
    await connection.query("UPDATE ncrs SET status = 'closed' WHERE tenantId = ? AND ncrNumber = 'NCR-2'", [tenantId]);
    expect(await accepted(U2)).toBe(true);
    await expect(callers.owner.pmc.setUnitActivityStatus({ ...scope(), unitId: U2, activityDefinitionId: WALLS, status: "COMPLETE" })).resolves.toBeTruthy();
    // an NCR on the unit but no activity is a site record: it holds nothing back
    await callers.owner.ncrs.create({ ...scope(), ncrNumber: "NCR-3", title: "Site record", description: "Noted without an activity", pmcUnitId: U2 });
    expect(await accepted(U2)).toBe(true);
  });
});

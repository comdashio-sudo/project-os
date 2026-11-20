import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-43 (P2-06), batch 2 (docs/proposals/subcontractor-progress.md §8): proof of a subcontractor's work without prices. On a real database, through the real
// router, as the restricted application role; synthetic data only. What is proven: no money in any reply; the same unit × activity is not claimed past 100%
// by one subcontract (DUPLICATE) or across subcontracts (OVER_COMPLETE), a BOQ item not past its quantity (OVER_BOQ), even by two sends at once; whoever
// prepared a confirmation does not approve it; a rejected or cancelled one stops counting; scope and isolation.
const SLUG = "q43-wc";
const SLUG_B = "q43-wc-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "site", "site2", "finance", "pm", "siteOther", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q43w-${key}`, name: `Q43 ${key}`, email: `q43w-${key}@q43.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "43aa0000-0000-4000-8000-000000000001";
const P2 = "43aa0000-0000-4000-8000-000000000002";
const U = ["43aa0000-0000-4000-8000-0000000000a1", "43aa0000-0000-4000-8000-0000000000a2", "43aa0000-0000-4000-8000-0000000000a3"];
const ACT = ["43aa0000-0000-4000-8000-0000000000b1", "43aa0000-0000-4000-8000-0000000000b2"];
let connection: fixtureDb.Connection; let tenantId = ""; let subA = ""; let subB = ""; let subOther = ""; let boqId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "subcontract_activity_boq_links", "subcontract_work_confirmation_lines", "subcontract_work_confirmations", "subcontract_contracts", "boq_items", "pmc_qc_receipts", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q43w-%'");
}
const scope = () => ({ tenantId, projectId: P });
type Line = ({ kind: "unit"; pmcUnitId: string; pmcActivityDefinitionId: string; percent: number } | { kind: "quantity"; boqItemId: string; quantity: number }) & { correctsLineId?: string; historical?: boolean };
const unit = (u: number, a: number, percent: number): Line => ({ kind: "unit", pmcUnitId: U[u], pmcActivityDefinitionId: ACT[a], percent });
const create = (key: Key, number: string, subcontractId: string, lines: Line[]) => callerFor(key).workConfirmations.create({ ...scope(), subcontractId, confirmationNumber: number, periodStart: "2026-11-01", periodEnd: "2026-11-15", lines });
const move = (key: Key, confirmationId: string, nextStatus: "submitted" | "approved" | "rejected" | "cancelled", reason?: string) => callerFor(key).workConfirmations.transition({ ...scope(), confirmationId, nextStatus, reason });
const list = async (key: Key = "owner") => callerFor(key).workConfirmations.list(scope());
const statusOf = async (number: string) => (await list()).find(item => item.number === number)?.status;

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-43: subcontractor work confirmations without prices", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q43w-${key}`, `Q43 ${key}`, `q43w-${key}@q43.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q43w-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q43w-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q43 WC Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callerFor("ownerB").tenant.create({ legalName: "Q43 WC Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" });
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q43-1', 'WC one', 'villas', 'SAR', 'active'), (?, ?, 'Q43-2', 'WC two', 'villas', 'SAR', 'active')", [P, tenantId, P2, tenantId]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES ('q43-z', ?, ?, 'Z1', 'Zone 1')", [tenantId, P]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES ('q43-b', ?, ?, 'q43-z', 'B1', 'Block 1')", [tenantId, P]);
    for (const [index, id] of U.entries()) await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, saleStatus, unitWeight) VALUES (?, ?, ?, 'q43-b', ?, 'MDL-A', 'available', 1)", [id, tenantId, P, index + 1]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES ('q43-g', ?, ?, 'G01', 'Finishes')", [tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES ('q43-s', ?, ?, 'q43-g', 'S01', 'Finishes')", [tenantId, P]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, 'q43-g', 'q43-s', 'MDL-A', 'PLASTER', 'Plaster', 50), (?, ?, ?, 'q43-g', 'q43-s', 'MDL-A', 'PAINT', 'Paint', 50)", [ACT[0], tenantId, P, ACT[1], tenantId, P]);
    const owner = callerFor("owner");
    ({ id: boqId } = await owner.boq.create({ ...scope(), code: "Q43-TILE", description: "Synthetic floor tiles", unitOfMeasure: "m2", quantity: 100, unitRate: 85 }));
    await owner.subcontracts.create({ ...scope(), code: "Q43-A", title: "Synthetic finishes A", subcontractorName: "Synthetic Finishers A", contractValue: 500000 });
    await owner.subcontracts.create({ ...scope(), code: "Q43-B", title: "Synthetic finishes B", subcontractorName: "Synthetic Finishers B", contractValue: 400000 });
    await owner.subcontracts.create({ tenantId, projectId: P2, code: "Q43-O", title: "Other project", subcontractorName: "Synthetic Other", contractValue: 1000 });
    const contracts = await owner.subcontracts.list(scope());
    subA = contracts.find(item => item.code === "Q43-A")!.id; subB = contracts.find(item => item.code === "Q43-B")!.id;
    subOther = (await owner.subcontracts.list({ tenantId, projectId: P2 }))[0].id;
    const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
    for (const [key, roleCode, project] of [["site", "SITE_ENGINEER", P], ["site2", "SITE_ENGINEER", P], ["finance", "FINANCE_MANAGER", P], ["pm", "PROJECT_MANAGER", P], ["siteOther", "SITE_ENGINEER", P2]] as const) await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: await templateRole(roleCode), scopeType: "project", scopeId: project });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the site engineer prepares and sends; he cannot approve; the finance manager approves — and no reply carries a rate, amount or value", async () => {
    const { id } = await create("site", "WC-1", subA, [unit(0, 0, 50), unit(1, 0, 100), { kind: "quantity", boqItemId: boqId, quantity: 40 }]);
    expect((await move("site", id, "submitted")).status).toBe("submitted");
    expect(await code(move("site", id, "approved"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await move("finance", id, "approved")).status).toBe("approved");
    for (const key of ["site", "finance", "owner"] as const) {
      const reply = await list(key);
      const keys = JSON.stringify(reply).match(/"[A-Za-z]+":/g) ?? [];
      expect(keys.filter(name => /rate|amount|value|price|cost/i.test(name)), key).toEqual([]);
    }
    const [wc] = await list("site");
    expect([wc.number, wc.subcontractCode, wc.lines.map(line => [line.kind, line.unitNumber ?? line.boqCode, line.percent ?? line.quantity])]).toEqual(["WC-1", "Q43-A", [["unit", 1, 50], ["unit", 2, 100], ["quantity", "Q43-TILE", 40]]]);
  });

  it("NEGATIVE: past 100% for the same subcontract, past 100% across subcontracts, past the BOQ quantity — refused with nothing written; the partial rest is accepted", async () => {
    expect(await code(create("site", "WC-2", subA, [unit(0, 0, 50)]))).toBe("no error"); // 50 + 50 = 100
    expect(await code(create("site", "WC-3", subA, [unit(0, 0, 10)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_DUPLICATE");
    expect(await code(create("site", "WC-4", subB, [unit(1, 0, 10)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_OVER_COMPLETE");
    expect(await code(create("site", "WC-5", subB, [{ kind: "quantity", boqItemId: boqId, quantity: 61 }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_OVER_BOQ");
    expect(await code(create("site", "WC-6", subB, [unit(0, 1, 120)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_LINE_INVALID");
    expect((await list()).map(item => item.number).sort()).toEqual(["WC-1", "WC-2"]);
    const [[audit]] = await connection.query<{ n: number }[]>("SELECT COUNT(*)::int AS n FROM audit_logs WHERE tenantId = ? AND action = 'work_confirmation.created'", [tenantId]);
    expect(audit.n).toBe(2);
  });

  it("SEPARATION: the project manager prepares and cannot approve his own; a rejection needs a reason; a rejected confirmation no longer counts", async () => {
    const { id } = await create("pm", "WC-7", subB, [unit(2, 1, 100)]);
    await move("pm", id, "submitted");
    expect(await code(move("pm", id, "approved"))).toBe("PROJECT_OS_WORK_CONFIRMATION_SELF_APPROVAL");
    expect(await code(move("finance", id, "rejected"))).toBe("PROJECT_OS_WORK_CONFIRMATION_REASON_REQUIRED");
    expect((await move("finance", id, "rejected", "Synthetic: unit 3 paint not finished")).status).toBe("rejected");
    expect(await code(create("site", "WC-8", subA, [unit(2, 1, 100)]))).toBe("no error");
  });

  it("CONCURRENCY: two sends at once for the same unit × activity (different subcontracts) — exactly one passes", async () => {
    const results = await Promise.all([code(create("site", "WC-9", subA, [unit(2, 0, 100)])), code(create("site2", "WC-10", subB, [unit(2, 0, 100)]))]);
    expect(results.sort()).toEqual(["PROJECT_OS_WORK_CONFIRMATION_OVER_COMPLETE", "no error"]);
  });

  it("the preparer cancels his draft; another engineer neither sends nor cancels it; an approved one is not cancelled", async () => {
    const wc2 = (await list()).find(item => item.number === "WC-2")!;
    expect(await code(move("site2", wc2.id, "submitted"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(move("site2", wc2.id, "cancelled"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await move("site", wc2.id, "cancelled")).status).toBe("cancelled");
    const wc1 = (await list()).find(item => item.number === "WC-1")!;
    expect(await code(move("finance", wc1.id, "cancelled"))).toBe("PROJECT_OS_WORK_CONFIRMATION_TRANSITION_INVALID");
    expect(await statusOf("WC-1")).toBe("approved");
  });

  it("SCOPE and ISOLATION: another project's subcontract is refused; another project's engineer and another company read nothing", async () => {
    expect(await code(create("site", "WC-11", subOther, [unit(0, 1, 10)]))).toBe("PROJECT_OS_SUBCONTRACT_NOT_FOUND");
    expect(await code(list("siteOther"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(list("ownerB"))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });

  // Q-43 batch 3 (docs/proposals/subcontractor-progress.md §5.2–5.3): corrections are new lines naming an approved line; historical lines count against double claims.
  const linesOf = async (number: string) => (await list()).find(item => item.number === number)!.lines;
  const approve = async (id: string) => { await move("site", id, "submitted"); return move("finance", id, "approved"); };

  it("CORRECTION POSITIVE: −50% on an approved 100% line is approved like any line; the original stays as it was, and 50% may then be claimed again", async () => {
    const original = (await linesOf("WC-1")).find(line => line.percent === 100)!;
    const correction = await create("site", "WC-C1", subA, [{ ...unit(1, 0, -50), correctsLineId: original.id }]);
    expect((await approve(correction.id)).status).toBe("approved");
    expect((await linesOf("WC-1")).find(line => line.id === original.id)!.percent).toBe(100); // never edited
    expect((await linesOf("WC-C1"))[0]).toMatchObject({ percent: -50, correctsLineId: original.id, historical: false });
    expect(await code(create("site", "WC-C2", subA, [unit(1, 0, 50)]))).toBe("no error"); // 100 − 50 + 50 = 100
    expect(await code(create("site", "WC-C3", subA, [unit(1, 0, 1)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_DUPLICATE");
    // a BOQ quantity is corrected the same way: 40 − 10 = 30 confirmed
    const boqLine = (await linesOf("WC-1")).find(line => line.kind === "quantity")!;
    expect(await code(create("site", "WC-C4", subA, [{ kind: "quantity", boqItemId: boqId, quantity: -10, correctsLineId: boqLine.id }]))).toBe("no error");
  });

  it("CORRECTION NEGATIVE: no negative line without a correction; never a draft, another subcontract's or another cell's line; never below zero — all refused with nothing written", async () => {
    const wc1 = await linesOf("WC-1");
    const half = wc1.find(line => line.percent === 50)!; // unit 0 × activity 0, 50% on subcontract A
    const before = (await list()).length;
    expect(await code(create("site", "WC-N1", subA, [unit(0, 0, -10)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_LINE_INVALID");
    expect(await code(create("site", "WC-N2", subA, [{ ...unit(0, 0, -60), correctsLineId: half.id }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_CORRECTION_BELOW_ZERO");
    expect(await code(create("site", "WC-N3", subA, [{ ...unit(0, 0, -150), correctsLineId: half.id }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_LINE_INVALID");
    expect(await code(create("site", "WC-N4", subB, [{ ...unit(0, 0, -10), correctsLineId: half.id }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_CORRECTION_INVALID"); // another subcontract
    expect(await code(create("site", "WC-N5", subA, [{ ...unit(1, 0, -10), correctsLineId: half.id }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_CORRECTION_INVALID"); // another cell
    const draft = (await linesOf("WC-C2"))[0]; // not approved
    expect(await code(create("site", "WC-N6", subA, [{ ...unit(1, 0, -10), correctsLineId: draft.id }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_CORRECTION_INVALID");
    const boqLine = wc1.find(line => line.kind === "quantity")!; // 40 confirmed, −10 pending in WC-C4: at most 30 more may be taken back
    expect(await code(create("site", "WC-N7", subA, [{ kind: "quantity", boqItemId: boqId, quantity: -31, correctsLineId: boqLine.id }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_CORRECTION_BELOW_ZERO");
    expect((await list()).length).toBe(before);
  });

  it("HISTORICAL: work approved before the platform is entered and approved as historical; it then blocks a new claim of the same work, for this subcontract and across subcontracts", async () => {
    const historical = await create("site", "WC-H1", subB, [{ ...unit(0, 1, 100), historical: true }]);
    expect((await approve(historical.id)).status).toBe("approved");
    expect((await linesOf("WC-H1"))[0]).toMatchObject({ historical: true, percent: 100 });
    expect(await code(create("site", "WC-H2", subB, [unit(0, 1, 10)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_DUPLICATE");
    expect(await code(create("site", "WC-H3", subA, [unit(0, 1, 10)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_OVER_COMPLETE");
  });

  // Q-43 batch 4: the preparation screen's pickers for the site engineer, who holds no money permission
  it("OPTIONS POSITIVE: the site engineer reads this project's subcontracts, activities, units (with their block) and BOQ items — and no key anywhere names a rate, amount, price or value", async () => {
    const options = await callerFor("site").workConfirmations.options(scope());
    expect(options.subcontracts.map(item => item.code)).toEqual(["Q43-A", "Q43-B"]);
    expect(options.subcontracts[0]).toMatchObject({ subcontractorName: "Synthetic Finishers A", title: "Synthetic finishes A" });
    expect(options.activities.map(item => item.code).sort()).toEqual(["PAINT", "PLASTER"]);
    expect(options.units.map(item => [item.blockCode, item.unitNumber])).toEqual([["B1", 1], ["B1", 2], ["B1", 3]]);
    expect(options.boqItems).toEqual([expect.objectContaining({ code: "Q43-TILE", unitOfMeasure: "m2", quantity: 100 })]);
    const keys: string[] = [];
    const walk = (value: unknown) => { if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.push(key); walk(child); } };
    walk(options);
    expect(keys.filter(key => /rate|amount|price|value|total|retention|advance/i.test(key))).toEqual([]);
    expect(await callerFor("finance").workConfirmations.options(scope())).toEqual(options);
  });

  it("OPTIONS NEGATIVE: another project's engineer and another company read nothing; another project's subcontract is not listed here", async () => {
    expect(await code(callerFor("siteOther").workConfirmations.options(scope()))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("ownerB").workConfirmations.options(scope()))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect((await callerFor("owner").workConfirmations.options({ tenantId, projectId: P2 })).subcontracts.map(item => item.code)).toEqual(["Q43-O"]);
  });

  // review of #449 (programmer C): a correction frees room under the caps only once it is approved; a pending one still counts toward the floor
  it("CORRECTION PENDING: a draft −50 on an approved 100% frees no room (another subcontract's 50% is OVER_COMPLETE, the same one's DUPLICATE); cancelled, the cell stays whole; approved, the room opens", async () => {
    const first = await create("site", "WC-P1", subA, [unit(1, 1, 100)]);
    await approve(first.id);
    const original = (await linesOf("WC-P1"))[0];
    const pending = await create("site", "WC-P2", subA, [{ ...unit(1, 1, -50), correctsLineId: original.id }]);
    expect(await code(create("site", "WC-P3", subB, [unit(1, 1, 50)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_OVER_COMPLETE");
    expect(await code(create("site", "WC-P4", subA, [unit(1, 1, 50)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_DUPLICATE");
    // a second pending correction of the same work is refused: the floor counts the first one already
    expect(await code(create("site", "WC-P5", subA, [{ ...unit(1, 1, -60), correctsLineId: original.id }]))).toBe("PROJECT_OS_WORK_CONFIRMATION_CORRECTION_BELOW_ZERO");
    expect((await list()).map(item => item.number).filter(number => ["WC-P3", "WC-P4", "WC-P5"].includes(number))).toEqual([]); // refused with nothing written
    await move("site", pending.id, "cancelled");
    expect(await code(create("site", "WC-P6", subB, [unit(1, 1, 1)]))).toBe("PROJECT_OS_WORK_CONFIRMATION_OVER_COMPLETE");
    const correction = await create("site", "WC-P7", subA, [{ ...unit(1, 1, -50), correctsLineId: original.id }]);
    expect((await approve(correction.id)).status).toBe("approved");
    expect(await code(create("site", "WC-P8", subB, [unit(1, 1, 50)]))).toBe("no error");
  });

  // Q-43 batch 4b (proposal §5.4, decision 5: a warning, never a block): what the approver sees next to each line
  it("APPROVER VIEW POSITIVE: each line says what the subcontract already has approved for the cell; a line reaching 100% warns while the site cell is not COMPLETE and QC has not received it, and stops warning once both are true", async () => {
    const X = "43aa0000-0000-4000-8000-0000000000a9";
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, saleStatus, unitWeight) VALUES (?, ?, ?, 'q43-b', 9, 'MDL-A', 'available', 1)", [X, tenantId, P]);
    const line = (percent: number): Line => ({ kind: "unit", pmcUnitId: X, pmcActivityDefinitionId: ACT[0], percent });
    const first = await create("site", "WC-W1", subA, [line(60)]);
    await move("site", first.id, "submitted");
    expect((await linesOf("WC-W1"))[0]).toMatchObject({ previousApproved: 0, warnings: [] }); // 60% does not reach 100
    await move("finance", first.id, "approved");
    await create("site", "WC-W2", subA, [line(40)]);
    expect((await linesOf("WC-W2"))[0]).toMatchObject({ previousApproved: 60, siteStatus: null, qcReceived: null, warnings: ["SITE_NOT_COMPLETE", "QC_NOT_RECEIVED"] });
    await connection.query("INSERT INTO pmc_unit_activity_progress (id, tenantId, projectId, unitId, activityDefinitionId, status) VALUES ('q43-site-x', ?, ?, ?, ?, 'COMPLETE')", [tenantId, P, X, ACT[0]]);
    expect((await linesOf("WC-W2"))[0].warnings).toEqual(["QC_NOT_RECEIVED"]);
    await connection.query("INSERT INTO pmc_qc_receipts (id, tenantId, projectId, unitId, activityDefinitionId, received, receivedOn) VALUES ('q43-qc-x', ?, ?, ?, ?, true, '2026-11-15')", [tenantId, P, X, ACT[0]]);
    expect((await linesOf("WC-W2"))[0]).toMatchObject({ siteStatus: "COMPLETE", qcReceived: true, warnings: [] });
    // the approved confirmation itself warns about nothing, and its own lines are not counted as "previous"
    expect((await linesOf("WC-W1"))[0]).toMatchObject({ previousApproved: 0, warnings: [] });
  });

  it("APPROVER VIEW NEGATIVE: a warning never blocks — the warned line is sent and approved; no rate, amount or value appears in any line; another subcontract's approvals are not its previous", async () => {
    const X = "43aa0000-0000-4000-8000-0000000000aa";
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, saleStatus, unitWeight) VALUES (?, ?, ?, 'q43-b', 10, 'MDL-A', 'available', 1)", [X, tenantId, P]);
    const warned = await create("site", "WC-W3", subB, [{ kind: "unit", pmcUnitId: X, pmcActivityDefinitionId: ACT[1], percent: 100 }]);
    expect((await linesOf("WC-W3"))[0]).toMatchObject({ previousApproved: 0, warnings: ["SITE_NOT_COMPLETE", "QC_NOT_RECEIVED"] });
    expect((await approve(warned.id)).status).toBe("approved");
    const keys = JSON.stringify(await list()).match(/"[a-zA-Z]+":/g)!.map(key => key.slice(1, -2));
    expect(keys.filter(key => /rate|amount|price|value|retention|advance/i.test(key))).toEqual([]);
    const other = await create("site", "WC-W4", subA, [{ kind: "unit", pmcUnitId: X, pmcActivityDefinitionId: ACT[0], percent: 10 }]);
    expect(other.id).toBeTruthy();
    expect((await linesOf("WC-W4"))[0]).toMatchObject({ previousApproved: 0, warnings: [] });
  });
  it("PULL POSITIVE (batch 5): approved quantity confirmations become one certificate line per BOQ item — a correction counted with its sign, the rate from BOQ, each confirmation linked once and named in the audit", async () => {
    const owner = callerFor("owner");
    const { id: pipe } = await owner.boq.create({ ...scope(), code: "Q43-PIPE", description: "Synthetic pipe", unitOfMeasure: "m", quantity: 200, unitRate: 40 });
    const first = await create("site", "WC-Q1", subA, [{ kind: "quantity", boqItemId: pipe, quantity: 30 }]);
    await approve(first.id);
    const second = await create("site", "WC-Q2", subA, [{ kind: "quantity", boqItemId: pipe, quantity: 20 }]);
    await approve(second.id);
    const firstLine = (await linesOf("WC-Q1"))[0];
    const fix = await create("site", "WC-Q3", subA, [{ kind: "quantity", boqItemId: pipe, quantity: -5, correctsLineId: firstLine.id }]);
    await approve(fix.id);
    const finance = callerFor("finance");
    await finance.subcontracts.createCertificate({ ...scope(), subcontractId: subA, certificateNumber: "Q43-C1", periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-15"), lines: [], confirmationIds: [first.id, second.id, fix.id] });
    const [certificate] = await owner.subcontracts.listCertificates({ ...scope(), subcontractId: subA });
    expect(certificate.lines.map(line => [line.boqItemId, Number(line.currentQuantity), Number(line.unitRate), Number(line.currentAmount)])).toEqual([[pipe, 45, 40, 1800]]);
    const [linked] = await connection.query<{ certificateId: string | null }[]>("SELECT certificate_id AS \"certificateId\" FROM subcontract_work_confirmations WHERE id IN (?, ?, ?)", [first.id, second.id, fix.id]);
    expect(linked.map(row => row.certificateId)).toEqual([certificate.id, certificate.id, certificate.id]);
    expect((await list("site")).filter(item => ["WC-Q1", "WC-Q2", "WC-Q3"].includes(item.number)).map(item => item.certificateId)).toEqual([certificate.id, certificate.id, certificate.id]);
    const [[audit]] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'project.subcontract_certificate_created' AND entityId = ?", [tenantId, certificate.id]);
    expect(JSON.parse(audit.metadata)).toMatchObject({ confirmationIds: [first.id, second.id, fix.id], pulledLines: [{ boqItemId: pipe, currentQuantity: 45 }] });
    // NEGATIVE: pulled once — never into a second certificate
    expect(await code(finance.subcontracts.createCertificate({ ...scope(), subcontractId: subA, certificateNumber: "Q43-C2", periodStart: new Date("2026-11-16"), periodEnd: new Date("2026-11-30"), lines: [], confirmationIds: [first.id] }))).toBe("PROJECT_OS_WORK_CONFIRMATION_ALREADY_PULLED");
  });

  it("PULL NEGATIVE (batch 5): not approved, historical, a unit line, another subcontract's, the same item typed and pulled, nothing to pull, no money permission — each refused, no certificate written", async () => {
    const owner = callerFor("owner"); const finance = callerFor("finance");
    const { id: cable } = await owner.boq.create({ ...scope(), code: "Q43-CABLE", description: "Synthetic cable", unitOfMeasure: "m", quantity: 300, unitRate: 12 });
    const draft = await create("site", "WC-QN1", subB, [{ kind: "quantity", boqItemId: cable, quantity: 3 }]);
    const historical = await create("site", "WC-QN2", subB, [{ kind: "quantity", boqItemId: cable, quantity: 4, historical: true }]);
    await approve(historical.id);
    const villa = "43aa0000-0000-4000-8000-0000000000af";
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, saleStatus, unitWeight) VALUES (?, ?, ?, 'q43-b', 99, 'MDL-A', 'available', 1)", [villa, tenantId, P]);
    const units = await create("site", "WC-QN3", subB, [{ kind: "unit", pmcUnitId: villa, pmcActivityDefinitionId: ACT[1], percent: 20 }]);
    await approve(units.id);
    const good = await create("site", "WC-QN4", subB, [{ kind: "quantity", boqItemId: cable, quantity: 6 }]);
    await approve(good.id);
    const pull = (confirmationIds: string[], lines: Array<{ boqItemId: string; currentQuantity: number }> = [], key: Key = "finance") => code(callerFor(key).subcontracts.createCertificate({ ...scope(), subcontractId: subB, certificateNumber: "Q43-CN", periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-15"), lines, confirmationIds }));
    expect(await pull([draft.id])).toBe("PROJECT_OS_WORK_CONFIRMATION_NOT_APPROVED");
    expect(await pull([historical.id])).toBe("PROJECT_OS_WORK_CONFIRMATION_HISTORICAL");
    expect(await pull([units.id, good.id])).toBe("PROJECT_OS_WORK_CONFIRMATION_UNIT_NOT_PRICED");
    const subAConfirmation = (await list()).find(item => item.number === "WC-Q1")!;
    expect(await pull([subAConfirmation.id])).toBe("PROJECT_OS_WORK_CONFIRMATION_NOT_FOUND");
    expect(await pull([good.id], [{ boqItemId: cable, currentQuantity: 6 }])).toBe("PROJECT_OS_CERTIFICATE_LINE_TWICE");
    expect(await pull([])).toContain("PROJECT_OS_WORK_CONFIRMATION_NOTHING_TO_PULL");
    expect(await pull([good.id], [], "site")).not.toBe("no error");
    expect(await owner.subcontracts.listCertificates({ ...scope(), subcontractId: subB })).toEqual([]);
    const [unlinked] = await connection.query<{ n: number }[]>("SELECT COUNT(*)::int AS n FROM subcontract_work_confirmations WHERE subcontract_id = ? AND certificate_id IS NOT NULL", [subB]);
    expect(unlinked[0].n).toBe(0);
    // and the good one alone is pulled
    expect(await pull([good.id])).toBe("no error");
  });

  it("PULL UNIT (batch 6, G45 option (b)): a unit line is priced through the subcontract's link of its activity to a BOQ item — percent × the item's quantity in one villa, the rate from BOQ; no link, no price", async () => {
    const owner = callerFor("owner"); const finance = callerFor("finance");
    await owner.subcontracts.create({ ...scope(), code: "Q43-U", title: "Synthetic painters", subcontractorName: "Synthetic Painters", contractValue: 90000 });
    const subU = (await owner.subcontracts.list(scope())).find(item => item.code === "Q43-U")!.id;
    const { id: paint } = await owner.boq.create({ ...scope(), code: "Q43-PAINT", description: "Synthetic wall paint", unitOfMeasure: "m2", quantity: 4000, unitRate: 25 });
    const villa = "43aa0000-0000-4000-8000-0000000000ae";
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, saleStatus, unitWeight) VALUES (?, ?, ?, 'q43-b', 98, 'MDL-A', 'available', 1)", [villa, tenantId, P]);
    const confirmation = await create("site", "WC-QU1", subU, [{ kind: "unit", pmcUnitId: villa, pmcActivityDefinitionId: ACT[0], percent: 25 }, { kind: "quantity", boqItemId: paint, quantity: 10 }]);
    await approve(confirmation.id);
    const pull = (number: string) => code(finance.subcontracts.createCertificate({ ...scope(), subcontractId: subU, certificateNumber: number, periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-15"), lines: [], confirmationIds: [confirmation.id] }));
    // NEGATIVE: no link for the activity — refused, nothing written
    expect(await pull("Q43-CU0")).toBe("PROJECT_OS_WORK_CONFIRMATION_UNIT_NOT_PRICED");
    // NEGATIVE: the site engineer sets no links (no commitment.manage); an activity twice or a zero quantity is refused
    expect(await code(callerFor("site").workConfirmations.setActivityBoqLinks({ ...scope(), subcontractId: subU, links: [{ pmcActivityDefinitionId: ACT[0], boqItemId: paint, quantityPerUnit: 40 }] }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(finance.workConfirmations.setActivityBoqLinks({ ...scope(), subcontractId: subU, links: [{ pmcActivityDefinitionId: ACT[0], boqItemId: paint, quantityPerUnit: 40 }, { pmcActivityDefinitionId: ACT[0], boqItemId: paint, quantityPerUnit: 41 }] }))).toBe("PROJECT_OS_ACTIVITY_BOQ_LINKS_INVALID");
    expect(await code(finance.workConfirmations.setActivityBoqLinks({ ...scope(), subcontractId: subU, links: [{ pmcActivityDefinitionId: ACT[0], boqItemId: paint, quantityPerUnit: 0 }] }))).toBe("PROJECT_OS_ACTIVITY_BOQ_LINKS_INVALID");
    expect(await code(finance.workConfirmations.setActivityBoqLinks({ ...scope(), subcontractId: subOther, links: [] }))).toBe("PROJECT_OS_SUBCONTRACT_NOT_FOUND");
    // POSITIVE: 40 m2 of paint in one villa; 25% of one villa = 10 m2, plus the 10 m2 measured — 20 m2 × 25 = 500, the rate from BOQ
    await finance.workConfirmations.setActivityBoqLinks({ ...scope(), subcontractId: subU, links: [{ pmcActivityDefinitionId: ACT[0], boqItemId: paint, quantityPerUnit: 40 }] });
    expect(await finance.workConfirmations.activityBoqLinks({ ...scope(), subcontractId: subU })).toMatchObject([{ pmcActivityDefinitionId: ACT[0], boqItemId: paint, quantityPerUnit: 40 }]);
    expect(await pull("Q43-CU1")).toBe("no error");
    const [certificate] = await owner.subcontracts.listCertificates({ ...scope(), subcontractId: subU });
    expect(certificate.lines.map(line => [line.boqItemId, Number(line.currentQuantity), Number(line.unitRate), Number(line.currentAmount)])).toEqual([[paint, 20, 25, 500]]);
    const [[audit]] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'project.subcontract_activity_boq_links_set' AND entityId = ?", [tenantId, subU]);
    expect(JSON.parse(audit.metadata)).toMatchObject({ before: [], after: [{ pmcActivityDefinitionId: ACT[0], boqItemId: paint, quantityPerUnit: 40 }] });
  });
});

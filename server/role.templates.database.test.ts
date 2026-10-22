import mysql from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { operationalRoleDefinitions } from "./domain/operationalRoles";
import { appRouter } from "./routers";

// Work order 5, item 3: the ready-made roles (executive, PMO lead, cost controller, project coordinator, the two design coordinators, contracts
// manager) installed by the real administration screen, given to real people through the real invitation path, and tried against the actions of
// the design and tender modules: each is allowed exactly what it holds and refused (with the permission message, never anything else) the rest.
// Synthetic data only.
const SLUG = "role-templates";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@templates.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const DENIED = "Required permission is not granted.";
const TEMPLATES = ["EXECUTIVE", "PMO_LEAD", "COST_CONTROLLER", "PROJECT_COORDINATOR", "DESIGN_COORDINATOR_ARCHITECTURAL", "DESIGN_COORDINATOR_TECHNICAL", "CONTRACTS_MANAGER"] as const;

let connection: mysql.Connection;
let tenantId = ""; let projectId = "";
const userIds: Record<string, number> = {}; const roleIds: Record<string, string> = {};
const callers: Record<string, ReturnType<typeof callerFor>> = {};
const NIL = "00000000-0000-4000-8000-000000000000";
const scope = () => ({ tenantId, projectId });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["tender_bid_adjustments", "tender_bids", "tender_invitees", "tender_packages", "commitments", "contracts", "suppliers", "design_transmittal_items", "design_comments", "design_submittals", "design_transmittals", "design_drawing_revisions", "design_drawings"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'tpl-%'");
}

/** One probe per action: a call that reaches the permission check and, when it passes, fails later on a record that does not exist (so nothing is written). */
const PROBES: Array<{ name: string; needs: string[]; run: (who: ReturnType<typeof callerFor>) => Promise<unknown> }> = [
  { name: "design.registerDrawing (architectural)", needs: ["project.design.manage", "project.design.architectural"], run: who => who.design.registerDrawing({ ...scope(), drawingNumber: "NIL-A", title: "Probe", discipline: "architectural", revision: "A" }) },
  { name: "design.registerDrawing (structural)", needs: ["project.design.manage", "project.design.technical"], run: who => who.design.registerDrawing({ ...scope(), drawingNumber: "NIL-S", title: "Probe", discipline: "structural", revision: "A" }) },
  { name: "design.approveDrawing", needs: ["project.design.approve"], run: who => who.design.approveDrawing({ ...scope(), drawingId: NIL }) },
  { name: "design.transitionComment (close)", needs: ["project.design.approve"], run: who => who.design.transitionComment({ ...scope(), commentId: NIL, nextStatus: "closed" }) },
  { name: "design.transitionSubmittal (reply)", needs: ["project.design.approve"], run: who => who.design.transitionSubmittal({ ...scope(), submittalId: NIL, nextStatus: "replied", replyCode: "A" }) },
  { name: "tenders.createPackage", needs: ["project.tender.manage"], run: who => who.tenders.createPackage({ ...scope(), packageCode: "NIL-P", title: "Probe", currency: "SAR" }) },
  { name: "tenders.enterBid", needs: ["project.tender.bids"], run: who => who.tenders.enterBid({ ...scope(), packageId: NIL, supplierId: NIL, amount: 1 }) },
  { name: "tenders.addAdjustment", needs: ["project.tender.level"], run: who => who.tenders.addAdjustment({ ...scope(), bidId: NIL, kind: "correction", description: "probe", amount: 1 }) },
  { name: "tenders.award", needs: ["project.tender.award"], run: who => who.tenders.award({ ...scope(), packageId: NIL, bidId: NIL, contractCode: "NIL-C" }) },
  { name: "design.dashboard (read)", needs: ["project.read"], run: who => who.design.dashboard(scope()) },
  { name: "tenders.packages (read)", needs: ["project.read"], run: who => who.tenders.packages(scope()) },
];
const outcome = async (run: () => Promise<unknown>) => { try { await run(); return "passed" as const; } catch (error) { return error instanceof Error && (error.message === DENIED || error.message.includes("PROJECT_OS_TENANT_ACCESS_DENIED")) ? "denied" as const : "passed" as const; } };

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the ready-made role templates on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    const keys = ["owner", ...TEMPLATES];
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${keys.map(() => "(?, ?, ?, 'user')").join(",")}`, keys.flatMap(key => [`tpl-${key}`, `Template ${key}`, `tpl-${key}@templates.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'tpl-%'");
    for (const key of keys) { userIds[key] = rows.find(row => row.openId === `tpl-${key}`)!.id; callers[key] = callerFor(userIds[key], `tpl-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Templates Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    projectId = "f3000000-0000-4000-8000-000000000001";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'TPL-1', 'Template villas', 'villas', 'SAR', 'active')", [projectId, tenantId]);
    const administration = await callers.owner.tenant.administration({ tenantId }); // installs the system roles, exactly as the administrator's first visit does
    for (const role of administration.roles) roleIds[role.code] = role.id;
    for (const key of TEMPLATES) {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: `tpl-${key}@templates.example.test`, roleId: roleIds[key], scopeType: "company" });
      await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    }
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("every template is installed with its own product and exactly its own powers", async () => {
    const administration = await callers.owner.tenant.administration({ tenantId });
    for (const definition of operationalRoleDefinitions.filter(item => (TEMPLATES as readonly string[]).includes(item.code))) {
      const role = administration.roles.find(item => item.code === definition.code)!;
      expect(role, definition.code).toBeTruthy();
      expect(role.productCode, definition.code).toBe(("productCode" in definition && definition.productCode) || "PROJECT");
      expect(role.permissions.map(item => item.code).sort(), definition.code).toEqual([...definition.permissions].sort());
    }
  });

  it("each template is allowed exactly the design and tender actions it holds, and refused the rest with the permission message", async () => {
    const mistakes: string[] = [];
    let allowed = 0; let denied = 0;
    for (const key of TEMPLATES) {
      const definition = operationalRoleDefinitions.find(item => item.code === key)!;
      const held = new Set<string>(definition.permissions);
      for (const probe of PROBES) {
        // the executive and the PMO lead hold no PROJECT power at all: the PROJECT product is licensed to the company, but their role is another product's
        const mayDo = probe.needs.every(code => held.has(code));
        const actual = await outcome(() => probe.run(callers[key]));
        if ((actual === "denied") === mayDo) mistakes.push(`${key} x ${probe.name}: expected ${mayDo ? "allowed" : "denied"}, got ${actual}`);
        if (mayDo) allowed += 1; else denied += 1;
      }
    }
    expect(mistakes).toEqual([]);
    expect(allowed).toBeGreaterThan(15);
    expect(denied).toBeGreaterThan(40);
  }, 120_000);

  it("the design coordinators are fenced to their own disciplines, and neither approves what they issue", async () => {
    const arch = callers.DESIGN_COORDINATOR_ARCHITECTURAL; const tech = callers.DESIGN_COORDINATOR_TECHNICAL;
    expect((await arch.design.registerDrawing({ ...scope(), drawingNumber: "T-A1", title: "Plan", discipline: "interior", revision: "A" })).status).toBe("registered");
    await expect(arch.design.registerDrawing({ ...scope(), drawingNumber: "T-S1", title: "Slab", discipline: "structural", revision: "A" })).rejects.toThrow(DENIED);
    expect((await tech.design.registerDrawing({ ...scope(), drawingNumber: "T-S1", title: "Slab", discipline: "structural", revision: "A" })).status).toBe("registered");
    await expect(tech.design.registerDrawing({ ...scope(), drawingNumber: "T-A2", title: "Plan", discipline: "landscape", revision: "A" })).rejects.toThrow(DENIED);
    const drawings = await callers.owner.design.drawings(scope());
    await expect(arch.design.approveDrawing({ ...scope(), drawingId: drawings[0].id })).rejects.toThrow(DENIED);
    await expect(tech.design.approveDrawing({ ...scope(), drawingId: drawings[0].id })).rejects.toThrow(DENIED);
    // the project coordinator holds the approving side, so the next step of the chain exists: the drawing is sent, then approved by someone who did not issue it
    const slab = drawings.find(item => item.drawingNumber === "T-S1")!;
    const transmittal = await tech.design.createTransmittal({ ...scope(), transmittalNumber: "TT-1", direction: "outgoing", counterparty: "Consultant", subject: "For review", revisionIds: [slab.currentRevisionId!] });
    await tech.design.transitionTransmittal({ ...scope(), transmittalId: transmittal.id, nextStatus: "sent" });
    expect(await callers.PROJECT_COORDINATOR.design.approveDrawing({ ...scope(), drawingId: slab.id })).toMatchObject({ status: "approved" });
  }, 120_000);

  it("the contracts manager prepares and takes bids but cannot level or award; the cost controller levels but cannot take bids; nobody but the owner awards by default", async () => {
    const contracts = callers.CONTRACTS_MANAGER; const cost = callers.COST_CONTROLLER;
    const supplier = await callers.owner.procurement.createSupplier({ tenantId, code: "TPL-S1", legalName: "Template Supplier" });
    const created = await contracts.tenders.createPackage({ ...scope(), packageCode: "TPL-P1", title: "Package", currency: "SAR" });
    await contracts.tenders.invite({ ...scope(), packageId: created.id, supplierId: supplier.id });
    await contracts.tenders.transitionPackage({ ...scope(), packageId: created.id, nextStatus: "open" });
    const bid = await contracts.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.id, amount: 1000 });
    await expect(cost.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.id, amount: 900 })).rejects.toThrow(DENIED);
    await contracts.tenders.transitionPackage({ ...scope(), packageId: created.id, nextStatus: "closed" });
    await expect(contracts.tenders.addAdjustment({ ...scope(), bidId: bid.id, kind: "correction", description: "Unit error", amount: 50 })).rejects.toThrow(DENIED);
    await expect(cost.tenders.addAdjustment({ ...scope(), bidId: bid.id, kind: "correction", description: "Unit error", amount: 50 })).resolves.toBeTruthy();
    await expect(contracts.tenders.award({ ...scope(), packageId: created.id, bidId: bid.id, contractCode: "TPL-C1", justification: "Only one bid, within the estimate" })).rejects.toThrow(DENIED);
    await expect(cost.tenders.award({ ...scope(), packageId: created.id, bidId: bid.id, contractCode: "TPL-C1", justification: "Only one bid, within the estimate" })).rejects.toThrow(DENIED);
    // the owner entered none of the bids, so the owner may award
    expect(await callers.owner.tenders.award({ ...scope(), packageId: created.id, bidId: bid.id, contractCode: "TPL-C1", justification: "Only one bid, within the estimate" })).toMatchObject({ value: 1050, status: "awarded" });
  }, 120_000);

  it("powers that must not meet cannot be combined on one person, even across two templates", async () => {
    const membership = async (key: string) => { const [rows] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, userIds[key]]); return rows[0].id; };
    // issuing + approving a drawing
    await expect(callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: await membership("PROJECT_COORDINATOR"), roleId: roleIds.DESIGN_COORDINATOR_TECHNICAL, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    await expect(callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: await membership("DESIGN_COORDINATOR_ARCHITECTURAL"), roleId: roleIds.PROJECT_COORDINATOR, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    // entering bids + levelling them
    await expect(callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: await membership("CONTRACTS_MANAGER"), roleId: roleIds.COST_CONTROLLER, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    await expect(callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: await membership("COST_CONTROLLER"), roleId: roleIds.CONTRACTS_MANAGER, scopeType: "company" })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    // two architectural + technical coordinator roles on one person is fine: the powers are about scope, not about conflict
    await expect(callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: await membership("DESIGN_COORDINATOR_ARCHITECTURAL"), roleId: roleIds.DESIGN_COORDINATOR_TECHNICAL, scopeType: "company" })).resolves.toBeTruthy();
    // the cost controller may also be the project coordinator (no shared pair), so the two can be combined
    await expect(callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: await membership("COST_CONTROLLER"), roleId: roleIds.PROJECT_COORDINATOR, scopeType: "company" })).resolves.toBeTruthy();
  }, 120_000);

  it("the executive and the PMO lead see their own level only: no project action is open to them", async () => {
    for (const key of ["EXECUTIVE", "PMO_LEAD"] as const) {
      const navigation = await callers[key].navigation.get({ tenantId, projectId });
      expect(navigation.map(item => item.id), key).toEqual(key === "EXECUTIVE" ? ["executive-dashboard"] : ["pmo-dashboard"]);
      for (const probe of PROBES) expect(await outcome(() => probe.run(callers[key])), `${key} x ${probe.name}`).toBe("denied");
    }
  });
});

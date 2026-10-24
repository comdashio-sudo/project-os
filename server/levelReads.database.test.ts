import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 16 (G-190 to G-194): the level reads beyond `scopes.*`, answered by the server over exactly what the caller's OWN assignment covers.
// Real database, the application running as the restricted role. Synthetic data only: every name, code and amount here is invented.
const SLUG_A = "level-reads-a";
const SLUG_B = "level-reads-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@levels.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const SCOPE_DENIED = "PROJECT_OS_PERMISSION_DENIED";
const PERM_DENIED = "PROJECT_OS_PERMISSION_DENIED.";
const NOT_A_MEMBER = "PROJECT_OS_TENANT_ACCESS_DENIED";

let connection: fixtureDb.Connection;
let tenantA = ""; let tenantB = "";
const ids = {
  portfolio: "a6000000-0000-4000-8000-0000000000a1",
  a: "a6000000-0000-4000-8000-0000000000b1", b: "a6000000-0000-4000-8000-0000000000b2", c: "a6000000-0000-4000-8000-0000000000b3",
  d: "a6000000-0000-4000-8000-0000000000d1",
};
const KEYS = ["owner", "board", "pmo", "pmoA", "pmA", "split", "keeper", "otherOwner", "stranger"] as const;
const userIds: Record<string, number> = {}; const roleIds: Record<string, string> = {};
const callers: Record<string, ReturnType<typeof callerFor>> = {};
let warehouseA = ""; let warehouseB = ""; let warehouseD = "";
const materialIds: Record<string, string> = {};

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG_A, SLUG_B]);
  for (const { id } of companies) {
    for (const table of ["warehouse_inventory_transactions", "project_material_overrides", "project_warehouses", "material_masters", "consultant_submittals", "purchase_orders", "commitments", "contracts", "audit_logs", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects", "portfolios"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'lrd-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the level reads, scoped by the server on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`lrd-${key}`, `Level read ${key}`, `lrd-${key}@levels.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'lrd-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `lrd-${key}`)!.id; callers[key] = callerFor(userIds[key], `lrd-${key}`); }

    // Company A: projects A and C in portfolio P, project B on its own. Company B: one project D, its own owner.
    ({ tenantId: tenantA } = await callers.owner.tenant.create({ legalName: "Level Reads Co. A", slug: SLUG_A, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callers.otherOwner.tenant.create({ legalName: "Level Reads Co. B", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO portfolios (id, tenantId, code, name) VALUES (?, ?, 'LR-P1', 'Portfolio one')", [ids.portfolio, tenantA]);
    await connection.query("INSERT INTO projects (id, tenantId, portfolioId, code, name, projectType, currency, status) VALUES (?, ?, ?, 'LR-A', 'Villas A', 'villas', 'SAR', 'active'), (?, ?, ?, 'LR-C', 'Villas C', 'villas', 'SAR', 'active'), (?, ?, NULL, 'LR-B', 'Villas B', 'villas', 'SAR', 'active')", [ids.a, tenantA, ids.portfolio, ids.c, tenantA, ids.portfolio, ids.b, tenantA]);
    await connection.query("INSERT INTO projects (id, tenantId, portfolioId, code, name, projectType, currency, status) VALUES (?, ?, NULL, 'LR-D', 'Villas D', 'villas', 'SAR', 'active')", [ids.d, tenantB]);

    const administration = await callers.owner.tenant.administration({ tenantId: tenantA });
    for (const role of administration.roles) roleIds[role.code] = role.id;
    const invite = async (key: typeof KEYS[number], role: string, scopeType: "company" | "portfolio" | "project", scopeId?: string) => {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId: tenantA, email: `lrd-${key}@levels.example.test`, roleId: roleIds[role], scopeType, scopeId });
      await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    };
    await invite("board", "EXECUTIVE", "company");
    await invite("pmo", "PMO_LEAD", "portfolio", ids.portfolio);
    // A PMO lead whose scope is one project (G-193): the portfolio level is theirs, and it answers over that project only.
    await invite("pmoA", "PMO_LEAD", "project", ids.a);
    await invite("pmA", "PROJECT_MANAGER", "project", ids.a);
    // The pooled-permission trap (G-142): project management on A, and only warehouse keeping on B.
    await invite("split", "PROJECT_MANAGER", "project", ids.a);
    const [[membership]] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantA, userIds.split]);
    await callers.owner.tenant.assignMembershipRole({ tenantId: tenantA, membershipId: membership.id, roleId: roleIds.WAREHOUSE_CUSTODIAN, scopeType: "project", scopeId: ids.b });
    await invite("keeper", "WAREHOUSE_CUSTODIAN", "project", ids.a);

    // Consultant submittals of A (one of each status), one of B: the deliveries of A must not include B's.
    await callers.owner.submittals.list({ tenantId: tenantA, projectId: ids.a }); // seeds the company's reply codes A/B/C/D
    await connection.query(`INSERT INTO consultant_submittals (id, tenantId, projectId, submittalType, submittalNumber, revision, title, status, sentAt, replyCode, createdByUserId) VALUES
      (gen_random_uuid(), ?, ?, 'shop_drawing', 'LR-SUB-1', 0, 'Tiles', 'sent', NOW(), NULL, ?),
      (gen_random_uuid(), ?, ?, 'shop_drawing', 'LR-SUB-2', 0, 'Doors', 'replied', NOW(), 'A', ?),
      (gen_random_uuid(), ?, ?, 'method_statement', 'LR-SUB-3', 0, 'Formwork', 'draft', NULL, NULL, ?),
      (gen_random_uuid(), ?, ?, 'sample', 'LR-SUB-4', 0, 'Paint', 'closed', NOW(), 'A', ?),
      (gen_random_uuid(), ?, ?, 'shop_drawing', 'LR-SUB-B1', 0, 'Other project', 'sent', NOW(), NULL, ?),
      (gen_random_uuid(), ?, ?, 'shop_drawing', 'LR-SUB-D1', 0, 'Company B project', 'sent', NOW(), NULL, ?)`,
      [tenantA, ids.a, userIds.owner, tenantA, ids.a, userIds.owner, tenantA, ids.a, userIds.owner, tenantA, ids.a, userIds.owner, tenantA, ids.b, userIds.owner, tenantB, ids.d, userIds.otherOwner]);

    // Materials and the warehouses. CEM-1 approved (A), STL-1 never submitted, PNT-1 replied D (not approved), ZERO-1 issued down to zero.
    for (const [code, description] of [["CEM-1", "Cement bag"], ["STL-1", "Rebar bundle"], ["PNT-1", "Paint tin"], ["ZERO-1", "Sealant tube"]]) {
      await callers.owner.materials.createMaster({ tenantId: tenantA, code, description, unitOfMeasure: "unit", category: "level-reads" });
    }
    const masters = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM material_masters WHERE tenantId = ?", [tenantA]);
    for (const row of masters[0]) materialIds[row.code] = row.id;
    await connection.query(`INSERT INTO consultant_submittals (id, tenantId, projectId, submittalType, submittalNumber, revision, title, status, sentAt, replyCode, materialId, createdByUserId) VALUES
      (gen_random_uuid(), ?, ?, 'material_approval', 'LR-MAT-CEM', 0, 'Cement approval', 'replied', NOW(), 'A', ?, ?),
      (gen_random_uuid(), ?, ?, 'material_approval', 'LR-MAT-PNT', 0, 'Paint approval', 'replied', NOW(), 'D', ?, ?)`,
      [tenantA, ids.a, materialIds["CEM-1"], userIds.owner, tenantA, ids.a, materialIds["PNT-1"], userIds.owner]);
    await callers.owner.warehouses.create({ tenantId: tenantA, projectId: ids.a, code: "LR-WH-A", name: "Store A" });
    await callers.owner.warehouses.create({ tenantId: tenantA, projectId: ids.b, code: "LR-WH-B", name: "Store B" });
    await callers.otherOwner.warehouses.create({ tenantId: tenantB, projectId: ids.d, code: "LR-WH-D", name: "Store D" });
    const warehouses = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM project_warehouses WHERE tenantId IN (?, ?)", [tenantA, tenantB]);
    warehouseA = warehouses[0].find(row => row.code === "LR-WH-A")!.id; warehouseB = warehouses[0].find(row => row.code === "LR-WH-B")!.id; warehouseD = warehouses[0].find(row => row.code === "LR-WH-D")!.id;
    const receipt = (warehouseId: string, projectId: string, tenant: string, code: string, quantityDelta: number, caller: typeof callers.owner) =>
      caller.warehouses.recordInventory({ tenantId: tenant, projectId, warehouseId, materialId: materialIds[code]!, transactionType: "receipt", quantityDelta, unitCost: 10, occurredAt: new Date() });
    await receipt(warehouseA, ids.a, tenantA, "CEM-1", 40, callers.owner);
    await receipt(warehouseA, ids.a, tenantA, "STL-1", 5, callers.owner);
    await receipt(warehouseA, ids.a, tenantA, "PNT-1", 2, callers.owner);
    await receipt(warehouseA, ids.a, tenantA, "ZERO-1", 3, callers.owner);
    await callers.owner.warehouses.recordInventory({ tenantId: tenantA, projectId: ids.a, warehouseId: warehouseA, materialId: materialIds["ZERO-1"], transactionType: "adjustment", quantityDelta: -3, note: "Synthetic stocktake", occurredAt: new Date() });
    await receipt(warehouseB, ids.b, tenantA, "STL-1", 7, callers.owner);
    await callers.otherOwner.warehouses.recordInventory({ tenantId: tenantB, projectId: ids.d, warehouseId: warehouseD, materialId: await materialOf(tenantB, "LR-D-MAT"), transactionType: "receipt", quantityDelta: 9, unitCost: 10, occurredAt: new Date() });

    // Company totals over every project of A: contracts, purchase orders and commitments, each in its own currency and status.
    await connection.query(`INSERT INTO contracts (id, tenantId, projectId, code, title, counterparty, contractValue, currency, status) VALUES
      (gen_random_uuid(), ?, ?, 'CT-A1', 'Villa contract A', 'Synthetic client', 1000, 'SAR', 'active'),
      (gen_random_uuid(), ?, ?, 'CT-A2', 'Draft contract A', 'Synthetic client', 999, 'SAR', 'draft'),
      (gen_random_uuid(), ?, ?, 'CT-B1', 'Villa contract B', 'Synthetic client', 250, 'SAR', 'active'),
      (gen_random_uuid(), ?, ?, 'CT-D1', 'Company B contract', 'Synthetic client', 9999, 'SAR', 'active')`,
      [tenantA, ids.a, tenantA, ids.a, tenantA, ids.b, tenantB, ids.d]);
    await connection.query(`INSERT INTO purchase_orders (id, tenantId, projectId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES
      (gen_random_uuid(), ?, ?, 'PO-A1', 'Synthetic supplier one', NOW(), 500, 'SAR', 'Cement order', 'approved', ?),
      (gen_random_uuid(), ?, ?, 'PO-B1', 'Synthetic supplier two', NOW(), 200, 'SAR', 'Steel order', 'issued', ?),
      (gen_random_uuid(), ?, ?, 'PO-A2', 'Synthetic supplier one', NOW(), 77, 'SAR', 'Submitted order', 'submitted', ?),
      (gen_random_uuid(), ?, ?, 'PO-C1', 'Synthetic supplier three', NOW(), 60, 'SAR', 'Received order', 'received', ?),
      (gen_random_uuid(), ?, ?, 'PO-A3', 'Synthetic supplier one', NOW(), 33, 'SAR', 'Cancelled order', 'cancelled', ?),
      (gen_random_uuid(), ?, ?, 'PO-C2', 'Synthetic supplier three', NOW(), 80, 'USD', 'Foreign order C', 'approved', ?)`,
      [tenantA, ids.a, userIds.owner, tenantA, ids.b, userIds.owner, tenantA, ids.a, userIds.owner, tenantA, ids.c, userIds.owner, tenantA, ids.a, userIds.owner, tenantA, ids.c, userIds.owner]);
    await connection.query(`INSERT INTO commitments (id, tenantId, projectId, code, description, amount, currency, status) VALUES
      (gen_random_uuid(), ?, ?, 'CM-A1', 'Subcontract A', 300, 'SAR', 'committed'),
      (gen_random_uuid(), ?, ?, 'CM-B1', 'Draft commitment B', 9, 'SAR', 'draft'),
      (gen_random_uuid(), ?, ?, 'CM-B2', 'Released commitment B', 8, 'SAR', 'released')`,
      [tenantA, ids.a, tenantA, ids.b, tenantA, ids.b]);
    // Company B's own commitment figure must never reach company A.
    await connection.query(`INSERT INTO commitments (id, tenantId, projectId, code, description, amount, currency, status) VALUES (gen_random_uuid(), ?, ?, 'CM-D1', 'Company B commitment', 5555, 'SAR', 'committed')`, [tenantB, ids.d]);
  }, 240_000);
  afterAll(async () => { await clear(); await connection.end(); });

  async function materialOf(tenant: string, code: string): Promise<string> {
    await callers.otherOwner.materials.createMaster({ tenantId: tenant, code, description: "Company B material", unitOfMeasure: "unit", category: "level-reads" });
    const [[row]] = await connection.query<{ id: string }[]>("SELECT id FROM material_masters WHERE tenantId = ? AND code = ?", [tenant, code]);
    return row.id;
  }

  describe("the entry (G-193, G-194): the highest level the person holds, decided per assignment", () => {
    it("enters the company level with a company-wide executive assignment, and the owner with every level", async () => {
      expect(await callers.board.levelReads.entry({ tenantId: tenantA })).toEqual({ level: "company" });
      expect(await callers.owner.levelReads.entry({ tenantId: tenantA })).toEqual({ level: "company" });
    });

    it("enters the portfolio level for a PMO lead whose scope is one portfolio (not the company)", async () => {
      expect(await callers.pmo.levelReads.entry({ tenantId: tenantA })).toEqual({ level: "portfolio" });
    });

    it("enters the portfolio level for a PMO lead whose scope is one project, and that level shows that project only (G-193)", async () => {
      expect(await callers.pmoA.levelReads.entry({ tenantId: tenantA })).toEqual({ level: "portfolio" });
      const view = await callers.pmoA.scopes.portfolio({ tenantId: tenantA });
      expect(view.projects.map(item => item.code)).toEqual(["LR-A"]);
      expect(view.totals.projectCount).toBe(1);
      // the company's PMO page is not offered to them: only the levels entry (navigation.ts)
      expect((await callers.pmoA.navigation.get({ tenantId: tenantA })).map(item => item.id)).toEqual(["levels"]);
    });

    it("enters the project level for a project manager, on their own project only", async () => {
      expect(await callers.pmA.levelReads.entry({ tenantId: tenantA })).toEqual({ level: "project", projectId: ids.a });
    });

    it("enters a project of a pooled person by the assignment that carries project.read, never the one that does not", async () => {
      // `split` manages A and only keeps the warehouse of B: the project level is A, not B.
      expect(await callers.split.levelReads.entry({ tenantId: tenantA })).toEqual({ level: "project", projectId: ids.a });
    });

    it("enters the warehouse of the keeper's own project without project.read (G-194)", async () => {
      expect(await callers.keeper.levelReads.entry({ tenantId: tenantA })).toEqual({ level: "warehouse", projectId: ids.a });
    });

    it("gives no level to a stranger, and gives a person of another company nothing in this company", async () => {
      expect(await callers.stranger.levelReads.entry({ tenantId: tenantA })).toBeNull();
      expect(await callers.otherOwner.levelReads.entry({ tenantId: tenantA })).toBeNull();
      expect(await callers.otherOwner.levelReads.entry({ tenantId: tenantB })).toEqual({ level: "company" });
    });
  });

  describe("the deliveries of a project (G-190)", () => {
    it("counts the consultant submittals of the project by status", async () => {
      const view = await callers.pmA.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.a });
      // Four submittals of its own and the two material approvals of A: the material approvals are consultant submittals too.
      expect(view.submittals).toEqual({ total: 6, draft: 1, awaitingReply: 1, replied: 3, closed: 1 });
    });

    it("refuses a project of the same company that the person's assignment does not cover, and counts nothing of it", async () => {
      await expect(callers.pmA.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.b })).rejects.toThrow(SCOPE_DENIED);
      await expect(callers.pmA.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.c })).rejects.toThrow(SCOPE_DENIED);
    });

    it("answers the company-wide owner for any project of the company", async () => {
      const view = await callers.owner.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.b });
      expect(view.submittals.total).toBe(1);
    });

    it("refuses a person without project.read the project level, and a stranger", async () => {
      await expect(callers.keeper.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.a })).rejects.toThrow(PERM_DENIED);
      await expect(callers.stranger.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.a })).rejects.toThrow(NOT_A_MEMBER);
    });

    it("refuses another company's project id sent under this company, and another company's caller", async () => {
      await expect(callers.owner.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.d })).rejects.toThrow(SCOPE_DENIED);
      await expect(callers.otherOwner.levelReads.projectDeliveries({ tenantId: tenantA, projectId: ids.a })).rejects.toThrow(NOT_A_MEMBER);
    });

    it("counts the other company's own project for that company's owner, and nothing of this one", async () => {
      const view = await callers.otherOwner.levelReads.projectDeliveries({ tenantId: tenantB, projectId: ids.d });
      expect(view.submittals).toEqual({ total: 1, draft: 0, awaitingReply: 1, replied: 0, closed: 0 });
    });
  });

  describe("the warehouse screen's list of warehouses (G-194)", () => {
    it("lists the keeper's own project's warehouses, which the keeper can read without project.read", async () => {
      const list = await callers.keeper.levelReads.projectWarehouses({ tenantId: tenantA, projectId: ids.a });
      expect(list.warehouses.map(item => item.code)).toEqual(["LR-WH-A"]);
      // the company's own list needs project.read, which the keeper does not hold: the reason the level has its own read
      await expect(callers.keeper.warehouses.list({ tenantId: tenantA, projectId: ids.a })).rejects.toThrow(PERM_DENIED);
    });

    it("refuses the keeper another project's warehouses, and another company's caller this company's list", async () => {
      await expect(callers.keeper.levelReads.projectWarehouses({ tenantId: tenantA, projectId: ids.b })).rejects.toThrow(SCOPE_DENIED);
      await expect(callers.otherOwner.levelReads.projectWarehouses({ tenantId: tenantA, projectId: ids.a })).rejects.toThrow(NOT_A_MEMBER);
      expect((await callers.otherOwner.levelReads.projectWarehouses({ tenantId: tenantB, projectId: ids.d })).warehouses.map(item => item.code)).toEqual(["LR-WH-D"]);
    });
  });

  describe("the unapproved materials of a warehouse (G-191)", () => {
    it("counts the materials held in the keeper's warehouse that the project has not approved, by the issue gate's own rule", async () => {
      const view = await callers.keeper.levelReads.warehouseUnapprovedMaterials({ tenantId: tenantA, projectId: ids.a, warehouseId: warehouseA });
      // Held (on hand above zero): CEM-1 (approved), STL-1 (never submitted), PNT-1 (replied D). ZERO-1 is not held.
      expect(view.stockedMaterials).toBe(3);
      expect(view.unapprovedCount).toBe(2);
      expect(view.unapproved).toEqual([
        { materialId: materialIds["PNT-1"], code: "PNT-1", description: "Paint tin", state: "not_approved" },
        { materialId: materialIds["STL-1"], code: "STL-1", description: "Rebar bundle", state: "no_submittal" },
      ]);
      expect(view.unapproved.map(item => item.code)).not.toContain("CEM-1");
      expect(view.unapproved.map(item => item.code)).not.toContain("ZERO-1");
    });

    it("refuses the keeper the warehouse of another project, and refuses a warehouse id of another project under their own", async () => {
      await expect(callers.keeper.levelReads.warehouseUnapprovedMaterials({ tenantId: tenantA, projectId: ids.b, warehouseId: warehouseB })).rejects.toThrow(SCOPE_DENIED);
      await expect(callers.keeper.levelReads.warehouseUnapprovedMaterials({ tenantId: tenantA, projectId: ids.a, warehouseId: warehouseB })).rejects.toThrow("PROJECT_OS_WAREHOUSE_NOT_FOUND");
    });

    it("answers a project manager of A for A's warehouse, and refuses B's warehouse to them", async () => {
      expect((await callers.pmA.levelReads.warehouseUnapprovedMaterials({ tenantId: tenantA, projectId: ids.a, warehouseId: warehouseA })).unapprovedCount).toBe(2);
      await expect(callers.pmA.levelReads.warehouseUnapprovedMaterials({ tenantId: tenantA, projectId: ids.b, warehouseId: warehouseB })).rejects.toThrow(SCOPE_DENIED);
    });

    it("refuses a person of another company the warehouse of this one, and answers the other company's own warehouse", async () => {
      await expect(callers.otherOwner.levelReads.warehouseUnapprovedMaterials({ tenantId: tenantA, projectId: ids.a, warehouseId: warehouseA })).rejects.toThrow(NOT_A_MEMBER);
      const own = await callers.otherOwner.levelReads.warehouseUnapprovedMaterials({ tenantId: tenantB, projectId: ids.d, warehouseId: warehouseD });
      expect(own).toMatchObject({ stockedMaterials: 1, unapprovedCount: 1 });
      expect(own.unapproved.map(item => item.code)).toEqual(["LR-D-MAT"]);
    });
  });

  describe("the company commitments (G-192): one company, every project, per currency", () => {
    it("sums the active contracts, the approved and issued orders and the committed commitments over every project of the company", async () => {
      const view = await callers.board.levelReads.companyCommitments({ tenantId: tenantA });
      expect(view.projectCount).toBe(3);
      // CT-A1 (1000) + CT-B1 (250) in SAR, the only currency a contract can have (migration 0001); the draft CT-A2 is not counted.
      expect(view.contracts).toEqual({ count: 2, byCurrency: [{ currency: "SAR", amount: 1250 }] });
      // PO-A1 (500) and PO-B1 (200) in SAR, PO-C2 (80) in USD listed beside them, never added; submitted, received and cancelled orders are not counted.
      expect(view.purchaseOrders).toEqual({ count: 3, byCurrency: [{ currency: "SAR", amount: 700 }, { currency: "USD", amount: 80 }] });
      // CM-A1 (300) only; the draft and the released commitments are not counted.
      expect(view.commitments).toEqual({ count: 1, byCurrency: [{ currency: "SAR", amount: 300 }] });
    });

    it("gives the owner the same company figures, and never the other company's amounts", async () => {
      const owner = await callers.owner.levelReads.companyCommitments({ tenantId: tenantA });
      expect(owner).toEqual(await callers.board.levelReads.companyCommitments({ tenantId: tenantA }));
      expect(JSON.stringify(owner)).not.toContain("9999");
      expect(JSON.stringify(owner)).not.toContain("5555");
    });

    it("refuses a project-scoped person the company level, and a PMO lead the company level", async () => {
      await expect(callers.pmA.levelReads.companyCommitments({ tenantId: tenantA })).rejects.toThrow(PERM_DENIED);
      await expect(callers.pmo.levelReads.companyCommitments({ tenantId: tenantA })).rejects.toThrow(PERM_DENIED);
      await expect(callers.keeper.levelReads.companyCommitments({ tenantId: tenantA })).rejects.toThrow(PERM_DENIED);
    });

    it("shows another company only its own projects and amounts, and refuses this company to its owner", async () => {
      const other = await callers.otherOwner.levelReads.companyCommitments({ tenantId: tenantB });
      expect(other.projectCount).toBe(1);
      expect(other.contracts).toEqual({ count: 1, byCurrency: [{ currency: "SAR", amount: 9999 }] });
      expect(other.commitments).toEqual({ count: 1, byCurrency: [{ currency: "SAR", amount: 5555 }] });
      expect(other.purchaseOrders).toEqual({ count: 0, byCurrency: [] });
      await expect(callers.otherOwner.levelReads.companyCommitments({ tenantId: tenantA })).rejects.toThrow(NOT_A_MEMBER);
      await expect(callers.stranger.levelReads.companyCommitments({ tenantId: tenantA })).rejects.toThrow(NOT_A_MEMBER);
    });
  });
});

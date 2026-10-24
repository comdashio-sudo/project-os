import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 5, item 8, on a real database and through the real router: packages, invitations, bid entry, levelling, comparison and the award that
// creates the contract and the commitment. Real roles are built through the role API (so its separation-of-duties rule is in play); the rule about
// PEOPLE (whoever entered a bid does not award) is proved with the company owner, who holds every power. Synthetic data only.
const SLUG = "tender-award";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@tender.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const DENIED = "PROJECT_OS_PERMISSION_DENIED.";

let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = ""; let projectId = ""; let otherProjectId = "";
const ids: Record<string, number> = {};
const KEYS = ["owner", "manager", "bidder", "leveller", "awarder", "reader", "stranger", "otherOwner", "scoped"] as const;
type Key = (typeof KEYS)[number];
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
const supplier: Record<string, string> = {};
const scope = () => ({ tenantId, projectId });

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["tender_bid_adjustments", "tender_bids", "tender_invitees", "tender_packages", "commitments", "contracts", "suppliers"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'tnd-%'");
}

const ROLES: Array<{ key: Key; code: string; permissions: string[]; project?: boolean }> = [
  { key: "manager", code: "TND_MANAGER", permissions: ["project.read", "project.tender.manage"] },
  { key: "bidder", code: "TND_BIDDER", permissions: ["project.read", "project.tender.bids"] },
  { key: "leveller", code: "TND_LEVELLER", permissions: ["project.read", "project.tender.level"] },
  { key: "awarder", code: "TND_AWARDER", permissions: ["project.read", "project.tender.award"] },
  { key: "reader", code: "TND_READER", permissions: ["project.read"] },
  { key: "scoped", code: "TND_SCOPED", permissions: ["project.read", "project.tender.manage"], project: true },
];

/** A package that is open with the given invitees, ready for bids. */
async function openPackage(code: string, invite: string[], estimate = 1_000_000) {
  const created = await callers.manager.tenders.createPackage({ ...scope(), packageCode: code, title: `Package ${code}`, estimateAmount: estimate, currency: "SAR" });
  for (const name of invite) await callers.manager.tenders.invite({ ...scope(), packageId: created.id, supplierId: supplier[name] });
  await callers.manager.tenders.transitionPackage({ ...scope(), packageId: created.id, nextStatus: "open" });
  return created.id;
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("tenders before award on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`tnd-${key}`, `Tender ${key}`, `tnd-${key}@tender.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'tnd-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `tnd-${key}`)!.id; callers[key] = callerFor(ids[key], `tnd-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Tender Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Tender Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    projectId = "e8000000-0000-4000-8000-000000000001"; otherProjectId = "e8000000-0000-4000-8000-000000000002";
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'TND-1', 'Tender villas', 'villas', 'SAR', 'active'), (?, ?, 'TND-2', 'Second project', 'villas', 'SAR', 'active')", [projectId, tenantId, otherProjectId, tenantId]);
    for (const role of ROLES) {
      const created = await callers.owner.tenant.createRole({ tenantId, code: role.code, name: role.code, productCode: "PROJECT", permissionCodes: role.permissions });
      await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids[role.key], roleId: created.id, scopeType: role.project ? "project" : "company", ...(role.project ? { scopeId: projectId } : {}) });
    }
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    for (const name of ["A", "B", "C", "D", "E"]) supplier[name] = (await callers.owner.procurement.createSupplier({ tenantId, code: `SUP-${name}`, legalName: `Supplier ${name} Co.` })).id;
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("the role API refuses a role that both enters bids and awards, or both enters and levels them", async () => {
    await expect(callers.owner.tenant.createRole({ tenantId, code: "TND_X1", name: "xx", productCode: "PROJECT", permissionCodes: ["project.read", "project.tender.bids", "project.tender.award"] })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    await expect(callers.owner.tenant.createRole({ tenantId, code: "TND_X2", name: "xx", productCode: "PROJECT", permissionCodes: ["project.read", "project.tender.bids", "project.tender.level"] })).rejects.toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
    // the other combinations are fine: the tender manager may also level, and the awarder may level
    await expect(callers.owner.tenant.createRole({ tenantId, code: "TND_OK", name: "okay", productCode: "PROJECT", permissionCodes: ["project.read", "project.tender.manage", "project.tender.level", "project.tender.award"] })).resolves.toMatchObject({ code: "TND_OK" });
  });

  it("packages and invitations need tender.manage; a tender cannot open without invitees; bids need an open tender and an invited supplier", async () => {
    await expect(callers.bidder.tenders.createPackage({ ...scope(), packageCode: "P0", title: "Nope", currency: "SAR" })).rejects.toThrow(DENIED);
    await expect(callers.stranger.tenders.createPackage({ ...scope(), packageCode: "P0", title: "Nope", currency: "SAR" })).rejects.toThrow();
    const created = await callers.manager.tenders.createPackage({ ...scope(), packageCode: "P-1", title: "Structure works", estimateAmount: 1_000_000, currency: "SAR" });
    await expect(callers.manager.tenders.createPackage({ ...scope(), packageCode: "P-1", title: "Again", currency: "SAR" })).rejects.toThrow("PROJECT_OS_TENDER_DUPLICATE");
    await expect(callers.manager.tenders.transitionPackage({ ...scope(), packageId: created.id, nextStatus: "open" })).rejects.toThrow("PROJECT_OS_TENDER_NO_INVITEES");
    for (const name of ["A", "B", "C", "E"]) await callers.manager.tenders.invite({ ...scope(), packageId: created.id, supplierId: supplier[name] });
    await expect(callers.manager.tenders.invite({ ...scope(), packageId: created.id, supplierId: supplier.A })).rejects.toThrow("PROJECT_OS_TENDER_DUPLICATE");
    await expect(callers.manager.tenders.invite({ ...scope(), packageId: created.id, supplierId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow("PROJECT_OS_TENDER_SUPPLIER_NOT_FOUND");
    await expect(callers.bidder.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.A, amount: 1 })).rejects.toThrow("PROJECT_OS_TENDER_NOT_OPEN"); // still a draft
    await callers.manager.tenders.transitionPackage({ ...scope(), packageId: created.id, nextStatus: "open" });
    await expect(callers.manager.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.A, amount: 1 })).rejects.toThrow(DENIED); // the manager does not enter bids
    await expect(callers.bidder.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.D, amount: 1 })).rejects.toThrow("PROJECT_OS_TENDER_NOT_INVITED");
    const a = await callers.bidder.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.A, amount: 900_000, durationDays: 180 });
    await expect(callers.bidder.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.A, amount: 800_000 })).rejects.toThrow("PROJECT_OS_TENDER_BID_EXISTS");
    await callers.bidder.tenders.reviseBid({ ...scope(), bidId: a.id, amount: 880_000, durationDays: 170 });
    await callers.bidder.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.B, amount: 1_100_000, durationDays: 150 });
    await callers.bidder.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.C, amount: 950_000, durationDays: 160 });
    const e = await callers.bidder.tenders.enterBid({ ...scope(), packageId: created.id, supplierId: supplier.E, amount: 400_000 });
    await callers.bidder.tenders.withdrawBid({ ...scope(), bidId: e.id, reason: "Bidder withdrew" });
    const invitees = await callers.reader.tenders.invitees({ ...scope(), packageId: created.id });
    expect(invitees.map(item => [item.supplierName, item.status])).toEqual([["Supplier A Co.", "submitted"], ["Supplier B Co.", "submitted"], ["Supplier C Co.", "submitted"], ["Supplier E Co.", "submitted"]]);
  }, 120_000);

  it("levelling: only after bidding closes, only by tender.level, with signs that fit the kind; the comparison ranks the levelled totals", async () => {
    const [{ id: packageId }] = (await callers.reader.tenders.packages(scope())).packages.filter(item => item.packageCode === "P-1");
    const before = await callers.reader.tenders.comparison({ ...scope(), packageId });
    const bidA = before.bids.find(item => item.supplierName === "Supplier A Co.")!;
    await expect(callers.leveller.tenders.addAdjustment({ ...scope(), bidId: bidA.id, kind: "scope_gap", description: "Waterproofing omitted", amount: 250_000 })).rejects.toThrow("PROJECT_OS_TENDER_NOT_CLOSED"); // still open
    await expect(callers.leveller.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "closed" })).rejects.toThrow(DENIED); // closing is the manager's
    await callers.manager.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "closed" });
    await expect(callers.bidder.tenders.addAdjustment({ ...scope(), bidId: bidA.id, kind: "scope_gap", description: "Waterproofing omitted", amount: 250_000 })).rejects.toThrow(DENIED);
    await expect(callers.leveller.tenders.addAdjustment({ ...scope(), bidId: bidA.id, kind: "discount", description: "Wrong sign", amount: 5_000 })).rejects.toThrow("PROJECT_OS_TENDER_ADJUSTMENT_SIGN");
    await expect(callers.leveller.tenders.addAdjustment({ ...scope(), bidId: bidA.id, kind: "scope_gap", description: "Wrong sign", amount: -5_000 })).rejects.toThrow("PROJECT_OS_TENDER_ADJUSTMENT_SIGN");
    const gap = await callers.leveller.tenders.addAdjustment({ ...scope(), bidId: bidA.id, kind: "scope_gap", description: "Waterproofing omitted", amount: 250_000 });
    const withdrawn = before.bids.find(item => item.status === "withdrawn")!;
    await expect(callers.leveller.tenders.addAdjustment({ ...scope(), bidId: withdrawn.id, kind: "correction", description: "No such bid", amount: 1 })).rejects.toThrow("PROJECT_OS_TENDER_BID_STATE_INVALID");
    const table = await callers.reader.tenders.comparison({ ...scope(), packageId });
    // A 880k + 250k gap = 1.13M, B 1.1M, C 950k; E withdrew (no rank)
    expect(table.bids.map(item => [item.supplierName, item.levelledTotal, item.rank])).toEqual([["Supplier C Co.", 950_000, 1], ["Supplier B Co.", 1_100_000, 2], ["Supplier A Co.", 1_130_000, 3], ["Supplier E Co.", 400_000, null]]);
    expect(table).toMatchObject({ lowest: 950_000, comparable: 3 });
    expect(table.bids[0]).toMatchObject({ versusEstimatePercent: -5, flags: ["lowest"] });
    expect(table.bids[2].adjustmentLines).toEqual([{ id: gap.id, kind: "scope_gap", description: "Waterproofing omitted", amount: 250_000 }]);
    await callers.leveller.tenders.removeAdjustment({ ...scope(), adjustmentId: gap.id });
    expect((await callers.reader.tenders.comparison({ ...scope(), packageId })).bids.find(item => item.supplierName === "Supplier A Co.")?.levelledTotal).toBe(880_000);
    await callers.leveller.tenders.addAdjustment({ ...scope(), bidId: bidA.id, kind: "scope_gap", description: "Waterproofing omitted", amount: 250_000 });
    const list = (await callers.reader.tenders.packages(scope())).packages.find(item => item.packageCode === "P-1")!;
    expect(list).toMatchObject({ invitees: 4, bids: 3, lowestLevelled: 950_000, status: "closed" });
  }, 120_000);

  it("the award: by tender.award only, never by someone who entered a bid, to a live bid; contract and commitment appear together or not at all", async () => {
    const [{ id: packageId }] = (await callers.reader.tenders.packages(scope())).packages.filter(item => item.packageCode === "P-1");
    const table = await callers.reader.tenders.comparison({ ...scope(), packageId });
    const winner = table.bids.find(item => item.supplierName === "Supplier C Co.")!;
    const withdrawn = table.bids.find(item => item.status === "withdrawn")!;
    await expect(callers.bidder.tenders.award({ ...scope(), packageId, bidId: winner.id, contractCode: "CT-1" })).rejects.toThrow(DENIED);
    await expect(callers.leveller.tenders.award({ ...scope(), packageId, bidId: winner.id, contractCode: "CT-1" })).rejects.toThrow(DENIED);
    await expect(callers.awarder.tenders.award({ ...scope(), packageId, bidId: withdrawn.id, contractCode: "CT-1" })).rejects.toThrow("PROJECT_OS_TENDER_BID_NOT_ELIGIBLE");
    // the same person as the bidder: put the bid enterer's id on the awarder's own bid? Simulated with the owner below; here the atomicity: a contract code already used
    await connection.query("INSERT INTO contracts (id, tenantId, projectId, code, title, counterparty, counterpartyKind, contractValue, currency, status) VALUES (UUID(), ?, ?, 'CT-TAKEN', 'Pre-existing', 'Someone', 'other', 1, 'SAR', 'draft')", [tenantId, projectId]);
    const commitmentsBefore = Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM commitments WHERE projectId = ?", [projectId]))[0][0].n);
    await expect(callers.awarder.tenders.award({ ...scope(), packageId, bidId: winner.id, contractCode: "CT-TAKEN" })).rejects.toThrow("PROJECT_OS_TENDER_DUPLICATE");
    expect(Number((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM commitments WHERE projectId = ?", [projectId]))[0][0].n)).toBe(commitmentsBefore); // nothing half-made
    expect((await callers.reader.tenders.comparison({ ...scope(), packageId })).package.status).toBe("closed");
    const award = await callers.awarder.tenders.award({ ...scope(), packageId, bidId: winner.id, contractCode: "CT-P1" });
    expect(award).toMatchObject({ value: 950_000, currency: "SAR", status: "awarded" });
    const [[contract]] = await connection.query<any[]>("SELECT * FROM contracts WHERE id = ?", [award.contractId]);
    expect(contract).toMatchObject({ code: "CT-P1", counterparty: "Supplier C Co.", counterpartyKind: "supplier", status: "draft", projectId, tenantId });
    expect(Number(contract.contractValue)).toBe(950_000);
    const [[commitment]] = await connection.query<any[]>("SELECT * FROM commitments WHERE id = ?", [award.commitmentId]);
    expect(commitment).toMatchObject({ contractId: award.contractId, code: "CT-P1-C1", status: "committed" });
    expect(Number(commitment.amount)).toBe(950_000);
    expect(commitment.committedAt).not.toBeNull();
    const after = await callers.reader.tenders.comparison({ ...scope(), packageId });
    expect(after.package).toMatchObject({ status: "awarded", awardedBidId: winner.id, awardedContractId: award.contractId, awardedCommitmentId: award.commitmentId });
    // an awarded tender is final
    await expect(callers.awarder.tenders.award({ ...scope(), packageId, bidId: winner.id, contractCode: "CT-P1B" })).rejects.toThrow("PROJECT_OS_TENDER_NOT_CLOSED");
    await expect(callers.manager.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "open" })).rejects.toThrow("PROJECT_OS_TENDER_TRANSITION_INVALID");
  }, 120_000);

  it("whoever entered a bid does not award, even holding every power; a single bid needs a written justification", async () => {
    const packageId = await openPackage("P-2", ["A", "B"]);
    const own = await callers.owner.tenders.enterBid({ ...scope(), packageId, supplierId: supplier.A, amount: 700_000 });
    await callers.manager.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "closed" });
    await expect(callers.owner.tenders.award({ ...scope(), packageId, bidId: own.id, contractCode: "CT-P2" })).rejects.toThrow("PROJECT_OS_TENDER_SELF_AWARD");
    // one comparable bid: the awarder (who entered nothing) must say why
    await expect(callers.awarder.tenders.award({ ...scope(), packageId, bidId: own.id, contractCode: "CT-P2" })).rejects.toThrow("PROJECT_OS_TENDER_JUSTIFICATION_REQUIRED");
    await expect(callers.awarder.tenders.award({ ...scope(), packageId, bidId: own.id, contractCode: "CT-P2", justification: "short" })).rejects.toThrow("PROJECT_OS_TENDER_JUSTIFICATION_REQUIRED");
    const done = await callers.awarder.tenders.award({ ...scope(), packageId, bidId: own.id, contractCode: "CT-P2", justification: "Only one invited supplier answered; price within the estimate" });
    expect(done.value).toBe(700_000);
    const [[row]] = await connection.query<any[]>("SELECT awardJustification FROM tender_packages WHERE id = ?", [packageId]);
    expect(row.awardJustification).toContain("Only one invited supplier");
  }, 120_000);

  it("two people awarding the same package at once: one wins, one contract, one commitment, the other is refused", async () => {
    const packageId = await openPackage("P-3", ["A", "B"]);
    const bidA = await callers.bidder.tenders.enterBid({ ...scope(), packageId, supplierId: supplier.A, amount: 500_000 });
    await callers.bidder.tenders.enterBid({ ...scope(), packageId, supplierId: supplier.B, amount: 520_000 });
    await callers.manager.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "closed" });
    const results = await Promise.allSettled([
      callers.awarder.tenders.award({ ...scope(), packageId, bidId: bidA.id, contractCode: "CT-RACE-1" }),
      callers.awarder.tenders.award({ ...scope(), packageId, bidId: bidA.id, contractCode: "CT-RACE-2" }),
    ]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const [[counts]] = await connection.query<any[]>("SELECT (SELECT COUNT(*) FROM contracts WHERE projectId = ? AND code LIKE 'CT-RACE-%') AS c, (SELECT COUNT(*) FROM commitments WHERE projectId = ? AND code LIKE 'CT-RACE-%') AS k", [projectId, projectId]);
    expect({ contracts: Number(counts.c), commitments: Number(counts.k) }).toEqual({ contracts: 1, commitments: 1 });
  }, 120_000);

  it("disqualification needs a reason and a closed tender; cancelling ends a tender", async () => {
    const packageId = await openPackage("P-4", ["A", "B"]);
    const bid = await callers.bidder.tenders.enterBid({ ...scope(), packageId, supplierId: supplier.A, amount: 100 });
    await expect(callers.leveller.tenders.disqualifyBid({ ...scope(), bidId: bid.id, reason: "Not signed" })).rejects.toThrow("PROJECT_OS_TENDER_NOT_CLOSED");
    await callers.manager.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "closed" });
    await expect(callers.bidder.tenders.disqualifyBid({ ...scope(), bidId: bid.id, reason: "Not signed" })).rejects.toThrow(DENIED);
    await callers.leveller.tenders.disqualifyBid({ ...scope(), bidId: bid.id, reason: "Not signed by an authorised person" });
    expect((await callers.reader.tenders.comparison({ ...scope(), packageId })).bids[0]).toMatchObject({ status: "disqualified", statusReason: "Not signed by an authorised person", rank: null });
    await callers.manager.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "cancelled" });
    await expect(callers.manager.tenders.transitionPackage({ ...scope(), packageId, nextStatus: "open" })).rejects.toThrow("PROJECT_OS_TENDER_TRANSITION_INVALID");
    await expect(callers.manager.tenders.invite({ ...scope(), packageId, supplierId: supplier.C })).rejects.toThrow("PROJECT_OS_TENDER_INVITATION_CLOSED");
  }, 120_000);

  it("isolation: another company, a stranger, another project and a project-limited role reach nothing outside their scope", async () => {
    const [{ id: packageId }] = (await callers.reader.tenders.packages(scope())).packages.filter(item => item.packageCode === "P-1");
    await expect(callers.otherOwner.tenders.packages(scope())).rejects.toThrow();
    await expect(callers.stranger.tenders.comparison({ ...scope(), packageId })).rejects.toThrow();
    expect((await callers.owner.tenders.packages({ tenantId, projectId: otherProjectId })).packages).toEqual([]);
    await expect(callers.owner.tenders.comparison({ tenantId, projectId: otherProjectId, packageId })).rejects.toThrow("PROJECT_OS_TENDER_NOT_FOUND"); // a record of project 1 through project 2
    await expect(callers.otherOwner.tenders.suppliers({ tenantId: otherTenantId, projectId })).rejects.toThrow();
    expect((await callers.scoped.tenders.createPackage({ ...scope(), packageCode: "P-S1", title: "Scoped", currency: "SAR" })).status).toBe("draft");
    await expect(callers.scoped.tenders.createPackage({ tenantId, projectId: otherProjectId, packageCode: "P-S2", title: "Scoped elsewhere", currency: "SAR" })).rejects.toThrow();
    expect((await callers.reader.tenders.suppliers(scope())).map(item => item.legalName)).toContain("Supplier A Co.");
  });

  it("every write left an audit row", async () => {
    const [rows] = await connection.query<{ action: string; n: number }[]>("SELECT action, COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND (action LIKE 'tender.%' OR action IN ('project.contract_created','project.commitment_created')) GROUP BY action", [tenantId]);
    const seen = new Map(rows.map(row => [row.action, Number(row.n)]));
    for (const action of ["tender.package_created", "tender.supplier_invited", "tender.package_status_transitioned", "tender.bid_entered", "tender.bid_revised", "tender.bid_withdrawn", "tender.bid_disqualified", "tender.adjustment_added", "tender.adjustment_removed", "tender.awarded", "project.contract_created", "project.commitment_created"]) expect(seen.get(action), action).toBeGreaterThan(0);
  });
});

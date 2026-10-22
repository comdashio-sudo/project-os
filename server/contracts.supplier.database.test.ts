import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// G-103: a contract with a supplier, and a subcontract, name a supplier from the company's register. Synthetic fixtures.
const T = "7c000000-0000-4000-8000-0000000000a1";
const T2 = "7c000000-0000-4000-8000-0000000000b1";
const P = "7c000000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `7c000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [SUP, SUP_OFF, SUP_OTHER, SUP_DUP1, SUP_DUP2] = [101, 102, 103, 104, 105].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection; let userId = 0;
const callerFor = () => appRouter.createCaller({ user: { id: userId, openId: "csp-user", name: "csp", email: "csp-user@contracts.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };

async function clear() {
  for (const table of ["subcontract_contracts", "contracts", "suppliers"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, [T, T2]);
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE FROM projects WHERE tenantId IN (?, ?)", [T, T2]);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", [T, T2]);
  await connection.query("DELETE FROM users WHERE openId = 'csp-user'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("contracts and subcontracts linked to the supplier register, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('csp-user','csp','csp-user@contracts.example.test','user')");
    userId = (await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'csp-user'"))[0][0].id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Contracts Tenant', 'contracts-tenant'), (?, 'Contracts Other', 'contracts-other')", [T, T2]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'CS-A', 'Contracts project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('csp-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('csp-ent', ?, 'csp-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.commitment.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('csp-role', ?, 'CSP_ROLE', 'Commercial', 'PROJECT')", [T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'csp-role', id FROM permissions WHERE code IN ('project.read','project.commitment.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('csp-m', ?, ?, 'active')", [T, userId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('csp-mr', 'csp-m', 'csp-role', 'company')");
    await connection.query("INSERT INTO suppliers (id, tenantId, code, legalName, active, createdByUserId) VALUES (?, ?, 'S-1', 'Gulf Steel Co', true, ?), (?, ?, 'S-2', 'Retired Supplier', false, ?), (?, ?, 'S-3', 'Other Tenant Supplier', true, ?), (?, ?, 'S-4', 'Twin Name Co', true, ?), (?, ?, 'S-5', 'Twin Name Co', true, ?)", [SUP, T, userId, SUP_OFF, T, userId, SUP_OTHER, T2, userId, SUP_DUP1, T, userId, SUP_DUP2, T, userId]);
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });

  const row = async (table: string, code: string) => (await connection.query<any[]>(`SELECT * FROM ${table} WHERE tenantId = ? AND code = ?`, [T, code]))[0][0];
  const contract = (over: Record<string, unknown>) => callerFor().contracts.create({ ...scope, code: "C-1", title: "Contract", counterparty: "Typed Name", contractValue: 1000, currency: "SAR", ...over } as never);

  it("a supplier contract takes the register's name and keeps the link; a typed name cannot disagree with it", async () => {
    await contract({ code: "C-SUP", counterparty: "A name that is not the register's", counterpartyKind: "supplier", supplierId: SUP });
    expect(await row("contracts", "C-SUP")).toMatchObject({ counterparty: "Gulf Steel Co", counterpartyKind: "supplier", supplierId: SUP });
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'project.contract_created' AND metadata::jsonb ->> 'code' = 'C-SUP'", [T]);
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ counterpartyKind: "supplier", supplierId: SUP });
  });

  it("choosing a register supplier makes the contract a supplier contract by itself", async () => {
    await contract({ code: "C-AUTO", supplierId: SUP });
    expect(await row("contracts", "C-AUTO")).toMatchObject({ counterpartyKind: "supplier", counterparty: "Gulf Steel Co" });
  });

  it("a client or another party stays a name with no link", async () => {
    await contract({ code: "C-CLIENT", counterparty: "Ministry Client", counterpartyKind: "client" });
    expect(await row("contracts", "C-CLIENT")).toMatchObject({ counterparty: "Ministry Client", counterpartyKind: "client", supplierId: null });
    await contract({ code: "C-OLD", counterparty: "Legacy" }); // an old caller that sends neither field
    expect(await row("contracts", "C-OLD")).toMatchObject({ counterpartyKind: "other", supplierId: null });
  });

  it("refuses a supplier contract with no supplier, a supplier that is retired or belongs to another company, and a kind that contradicts the choice; each writes nothing", async () => {
    const before = (await connection.query<any[]>("SELECT COUNT(*) AS n FROM contracts WHERE tenantId = ?", [T]))[0][0].n;
    await expect(contract({ code: "C-X1", counterpartyKind: "supplier" })).rejects.toThrow("PROJECT_OS_CONTRACT_SUPPLIER_REQUIRED");
    await expect(contract({ code: "C-X2", supplierId: SUP_OFF })).rejects.toThrow("PROJECT_OS_SUPPLIER_INACTIVE");
    await expect(contract({ code: "C-X3", supplierId: SUP_OTHER })).rejects.toThrow("PROJECT_OS_SUPPLIER_NOT_FOUND");
    await expect(contract({ code: "C-X4", supplierId: SUP, counterpartyKind: "client" })).rejects.toThrow("PROJECT_OS_CONTRACT_COUNTERPARTY_KIND_MISMATCH");
    expect((await connection.query<any[]>("SELECT COUNT(*) AS n FROM contracts WHERE tenantId = ?", [T]))[0][0].n).toBe(before);
  });

  it("a subcontract takes the register's name when a supplier is chosen, and still accepts a typed one-off subcontractor", async () => {
    const subcontract = (over: Record<string, unknown>) => callerFor().subcontracts.create({ ...scope, code: "SC-1", title: "Structure", subcontractorName: "Typed Sub", contractValue: 500, ...over } as never);
    await subcontract({ code: "SC-REG", subcontractorName: "Wrong typed name", supplierId: SUP });
    expect(await row("subcontract_contracts", "SC-REG")).toMatchObject({ subcontractorName: "Gulf Steel Co", supplierId: SUP });
    await subcontract({ code: "SC-FREE" });
    expect(await row("subcontract_contracts", "SC-FREE")).toMatchObject({ subcontractorName: "Typed Sub", supplierId: null });
    await expect(subcontract({ code: "SC-X", supplierId: SUP_OFF })).rejects.toThrow("PROJECT_OS_SUPPLIER_INACTIVE");
    await expect(subcontract({ code: "SC-Y", supplierId: SUP_OTHER })).rejects.toThrow("PROJECT_OS_SUPPLIER_NOT_FOUND");
  });
});

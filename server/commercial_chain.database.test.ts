import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { companies, projects, users, memberships, tenantEntitlements, subscriptions, roles, permissions, rolePermissions, membershipRoles, boqItems, subcontractContracts, subcontractCertificates, subcontractCertificateLines, projectCommercialInvoices } from "../drizzle/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { getDb, getTenantAccessSnapshot } from "./db";
import { randomUUID } from "node:crypto";
import { assertTestDatabaseUrl, isTestDatabaseUrl, INTEGRATION_TEST_DATABASE } from "./testing/testDatabase";

// Runs only against the named test database, and only as the restricted app
// account (SELECT/INSERT on audit_logs). It never runs on DATABASE_URL alone.
const canRun = isTestDatabaseUrl(process.env.TEST_DATABASE_URL) && Boolean(process.env.PROJECT_OS_APP_DB_PASSWORD);

describe.skipIf(!canRun)("Commercial Chain Integration", () => {
  let tenantId: string;
  let projectId: string;
  let userId: number;
  let caller: any;

  beforeAll(async () => {
    assertTestDatabaseUrl(process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL");
    assertTestDatabaseUrl(process.env.DATABASE_URL, "DATABASE_URL");
    if (process.env.PROJECT_OS_USE_ADMIN_DATABASE_URL === "true") {
      throw new Error("Commercial chain test must run as the restricted app account; unset PROJECT_OS_USE_ADMIN_DATABASE_URL.");
    }
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Prove the connection before writing: the test database, the app account.
    const [identityRows] = (await db.execute(sql`SELECT CURRENT_USER() AS currentUser, DATABASE() AS databaseName`)) as unknown as [Array<{ currentUser: string; databaseName: string }>];
    expect(identityRows[0].databaseName).toBe(INTEGRATION_TEST_DATABASE);
    expect(identityRows[0].currentUser).toMatch(/\.project_os_app@/);

    // A synthetic user of its own: the test must not depend on a seeded database.
    await db.insert(users).values({ openId: `commercial-test-${randomUUID()}`, name: "Commercial Test User", email: "commercial-test@example.test", loginMethod: "test", role: "admin" });
    const [user] = await db.select().from(users).where(eq(users.email, "commercial-test@example.test")).orderBy(desc(users.id)).limit(1);
    userId = user.id;

    tenantId = randomUUID();
    projectId = randomUUID();

    await db.insert(companies).values({
      id: tenantId,
      legalName: "Commercial Test Co",
      slug: `comm-test-${Date.now()}`,
      createdByUserId: userId,
    });

    const membershipId = randomUUID();
    await db.insert(memberships).values({
      id: membershipId,
      tenantId,
      userId,
      status: "active",
    });

    const subId = randomUUID();
    await db.insert(subscriptions).values({
      id: subId,
      tenantId,
      packageCode: "PROJECT",
      status: "active",
      startsAt: new Date(),
    });

    await db.insert(tenantEntitlements).values({
      id: randomUUID(),
      tenantId,
      subscriptionId: subId,
      productCode: "PROJECT",
      active: true,
      startsAt: new Date(),
    });

    const roleId = randomUUID();
    await db.insert(roles).values({
      id: roleId,
      tenantId,
      code: "OWNER",
      name: "Owner",
      productCode: "PROJECT",
      systemManaged: true,
    });

    const permissionCodes = [
      "project.read", "project.write", "project.manage", "procurement.read", "procurement.manage",
      "contracts.read", "contracts.manage", "claims.read", "claims.manage",
      "materials.read", "materials.manage", "warehouses.read", "warehouses.manage",
      "boq.read", "boq.manage", "subcontracts.read", "subcontracts.manage",
      "project_invoices.read", "project_invoices.manage"
    ];

    for (const code of permissionCodes) {
      const [p] = await db.select().from(permissions).where(eq(permissions.code, code)).limit(1);
      if (p) {
        await db.insert(rolePermissions).values({
          roleId,
          permissionId: p.id,
        });
      } else {
        const pId = randomUUID();
        await db.insert(permissions).values({
          id: pId,
          code,
          name: code,
          productCode: "PROJECT",
        });
        await db.insert(rolePermissions).values({
          roleId,
          permissionId: pId,
        });
      }
    }

    await db.insert(membershipRoles).values({
      id: randomUUID(),
      membershipId,
      roleId,
      scopeType: "company",
    });

    await db.insert(projects).values({
      id: projectId,
      tenantId,
      code: "COMM-01",
      name: "Commercial Test Project",
      projectType: "construction",
      createdByUserId: userId,
    });



    const ctx: TrpcContext = {
      user: { ...user, role: 'admin' },
      req: { protocol: "https", headers: {} } as any,
      res: { clearCookie: () => {} } as any,
    };
    caller = appRouter.createCaller(ctx);
  }, 30_000);

  it("should create and list BOQ items", async () => {
    const boqId = randomUUID();
    await caller.boq.create({
      tenantId,
      projectId,
      code: "BOQ-001",
      description: "Excavation Works",
      unitOfMeasure: "m3",
      quantity: 1000,
      unitRate: 50,
    });

    const items = await caller.boq.list({ tenantId, projectId });
    expect(items.some((i: any) => i.code === "BOQ-001")).toBe(true);
  }, 15_000);

  it("should create and list subcontract contracts", async () => {
    await caller.subcontracts.create({
      tenantId,
      projectId,
      code: "SUB-01",
      title: "Earthworks Subcontract",
      subcontractorName: "Best Excavators Ltd",
      contractValue: 50000,
      retentionPercent: 10,
    });

    const contracts = await caller.subcontracts.list({ tenantId, projectId });
    expect(contracts.some((c: any) => c.code === "SUB-01")).toBe(true);
  }, 15_000);

  it("should create subcontract certificate", async () => {
    const [subcon] = await caller.subcontracts.list({ tenantId, projectId });
    const [boq] = await caller.boq.list({ tenantId, projectId });

    const result = await caller.subcontracts.createCertificate({
      tenantId,
      projectId,
      subcontractId: subcon.id,
      certificateNumber: "CERT-01",
      periodStart: new Date("2026-08-01"),
      periodEnd: new Date("2026-08-31"),
      lines: [
        { boqItemId: boq.id, currentQuantity: 200 }
      ]
    });

    expect(result.id).toBeDefined();
    
    const certs = await caller.subcontracts.listCertificates({ tenantId, projectId, subcontractId: subcon.id });
    expect(certs[0].certificateNumber).toBe("CERT-01");
    expect(certs[0].lines.length).toBe(1);
    expect(Number(certs[0].grossAmount)).toBe(10000); // 200 * 50
    expect(Number(certs[0].retentionAmount)).toBe(1000); // 10%
    expect(Number(certs[0].netAmount)).toBe(9000);
  }, 15_000);

  it("should create and list project commercial invoices", async () => {
    await caller.projectInvoices.create({
      tenantId,
      projectId,
      invoiceNumber: "INV-PROJ-01",
      invoiceDate: new Date(),
      clientName: "Main Client Corp",
      amount: 100000,
      vatAmount: 15000,
    });

    const invoices = await caller.projectInvoices.list({ tenantId, projectId });
    expect(invoices.some((i: any) => i.invoiceNumber === "INV-PROJ-01")).toBe(true);
  }, 15_000);

  afterAll(async () => {
    const db = await getDb();
    if (db) {
      // Clean up in reverse order of dependencies
      await db.delete(projectCommercialInvoices).where(eq(projectCommercialInvoices.tenantId, tenantId));
      const certRows = await db.select({ id: subcontractCertificates.id }).from(subcontractCertificates).where(eq(subcontractCertificates.tenantId, tenantId));
      if (certRows.length) {
        await db.delete(subcontractCertificateLines).where(inArray(subcontractCertificateLines.certificateId, certRows.map(c => c.id)));
      }
      await db.delete(subcontractCertificates).where(eq(subcontractCertificates.tenantId, tenantId));
      await db.delete(subcontractContracts).where(eq(subcontractContracts.tenantId, tenantId));
      await db.delete(boqItems).where(eq(boqItems.tenantId, tenantId));
      await db.delete(projects).where(eq(projects.id, projectId));
      await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, tenantId));
      await db.delete(subscriptions).where(eq(subscriptions.tenantId, tenantId));
      
      const membershipRows = await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.tenantId, tenantId));
      if (membershipRows.length) {
        await db.delete(membershipRoles).where(inArray(membershipRoles.membershipId, membershipRows.map(m => m.id)));
      }
      await db.delete(memberships).where(eq(memberships.tenantId, tenantId));
      
      const roleRows = await db.select({ id: roles.id }).from(roles).where(eq(roles.tenantId, tenantId));
      if (roleRows.length) {
        await db.delete(rolePermissions).where(inArray(rolePermissions.roleId, roleRows.map(r => r.id)));
        await db.delete(roles).where(inArray(roles.id, roleRows.map(r => r.id)));
      }
      
      // audit_logs is append-only for the app account, and its rows keep the
      // test company referenced, so both stay in the test database.
    }
  }, 30_000);
});

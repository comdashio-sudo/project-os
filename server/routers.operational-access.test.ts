import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseDouble = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));
const storageDouble = vi.hoisted(() => ({ storagePut: vi.fn(async () => ({ key: "tenant/project/document.bin", url: "/manus-storage/tenant/project/document.bin" })) }));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => databaseDouble),
}));
vi.mock("./storage", () => ({ storagePut: storageDouble.storagePut }));

import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const projectA = "77777777-7777-4777-8777-777777777777";
const projectB = "33333333-3333-4333-8333-333333333333";
const wbsB = "44444444-4444-4444-8444-444444444444";

function queryResult<T>(result: T) {
  const query = {
    from: () => query,
    where: () => query,
    orderBy: () => query,
    innerJoin: () => query,
    limit: async () => result,
    then: <TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  };
  return query;
}

function context(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "operational-access-user",
      email: "user@example.com",
      name: "Operational Access User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function configureActiveMembershipWithoutProjectEntitlement() {
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");
    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult([{ code: "project.write" }]);
    throw new Error(`Unexpected select shape: ${keys}`);
  });
}

function configureAuthorizedOperationalAccess(input: { productCode: "PMO" | "EXECUTIVE" | "PROJECT"; permissionCode: "pmo.write" | "tenant.manage" | "project.write" }) {
  const transactionDouble = {
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");
    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([{ productCode: input.productCode }]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult([{ code: input.permissionCode }]);
    if (keys === "id") return queryResult([{ id: projectB }]);
    throw new Error(`Unexpected select shape: ${keys}`);
  });
  databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
  return transactionDouble;
}

function configureAuthorizedTenantMemberAssignment() {
  const transactionDouble = {
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  let idSelectionCount = 0;
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");
    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([{ productCode: "EXECUTIVE" }]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult([{ code: "tenant.manage" }]);
    if (keys === "id") {
      idSelectionCount += 1;
      return queryResult(idSelectionCount === 1 ? [{ id: "target-user" }] : []);
    }
    if (keys === "id,tenantId") return queryResult([{ id: "55555555-5555-4555-8555-555555555555", tenantId: tenantA }]);
    throw new Error(`Unexpected select shape: ${keys}`);
  });
  databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
  return transactionDouble;
}

function configureAuthorizedRoleCreation(permissionProductCode: "EXECUTIVE" | "PMO" | "PROJECT" = "EXECUTIVE") {
  const transactionDouble = {
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");
    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([{ productCode: "EXECUTIVE" }]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult([{ code: "tenant.manage" }]);
    if (keys === "id") return queryResult([]);
    if (keys === "code,id,productCode") return queryResult([{ id: "permission-1", code: "tenant.manage", productCode: permissionProductCode }]);
    throw new Error(`Unexpected select shape: ${keys}`);
  });
  databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
  return transactionDouble;
}

function configureAuthorizedMembershipRoleAssignment(input: { membershipTenantId?: string; membershipUserId?: number; existingAssignment?: boolean } = {}) {
  const transactionDouble = {
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");
    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([{ productCode: "EXECUTIVE" }]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult([{ code: "tenant.manage" }]);
    if (keys === "id") return queryResult([]);
    if (keys === "id,tenantId,userId") return queryResult([{ id: "member-target", tenantId: input.membershipTenantId ?? tenantA, userId: input.membershipUserId ?? 99 }]);
    if (keys === "id,tenantId") return queryResult([{ id: "55555555-5555-4555-8555-555555555555", tenantId: tenantA }]);
    if (keys === "id") return queryResult(input.existingAssignment ? [{ id: "existing-role-assignment" }] : []);
    throw new Error(`Unexpected select shape: ${keys}`);
  });
  databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
  return transactionDouble;
}

function configureAuthorizedMembershipRoleRevocation(input: { assignmentTenantId?: string; assignmentUserId?: number } = {}) {
  const transactionDouble = {
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");
    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([{ productCode: "EXECUTIVE" }]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult([{ code: "tenant.manage" }]);
    if (keys === "assignmentId,membershipId,roleId,scopeId,scopeType,tenantId,userId") return queryResult([{ assignmentId: "77777777-7777-4777-8777-777777777777", membershipId: "member-target", roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company", scopeId: null, tenantId: input.assignmentTenantId ?? tenantA, userId: input.assignmentUserId ?? 99 }]);
    throw new Error(`Unexpected select shape: ${keys}`);
  });
  databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
  return transactionDouble;
}

function configureAuthorizedRoleUpdate(input: { systemManaged?: boolean; actorHasRole?: boolean } = {}) {
  const transactionDouble = {
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");
    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([{ productCode: "EXECUTIVE" }]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult([{ code: "tenant.manage" }]);
    if (keys === "id,productCode,systemManaged,tenantId") return queryResult([{ id: "55555555-5555-4555-8555-555555555555", tenantId: tenantA, productCode: "EXECUTIVE", systemManaged: input.systemManaged ?? false }]);
    if (keys === "membershipId") return queryResult(input.actorHasRole ? [{ membershipId: "membership-a" }] : []);
    if (keys === "code,id,productCode") return queryResult([{ id: "permission-1", code: "tenant.manage", productCode: "EXECUTIVE" }]);
    throw new Error(`Unexpected select shape: ${keys}`);
  });
  databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
  return transactionDouble;
}

describe("operational API authorization", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://router-access-test";
    databaseDouble.select.mockReset();
    databaseDouble.transaction.mockReset();
    storageDouble.storagePut.mockClear();
  });

  it("rejects a direct request for another tenant's project before loading the resource or writing data", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(
      caller.costs.createActual({ tenantId: tenantB, projectId: projectB, wbsItemId: wbsB, amount: 100, incurredAt: new Date("2026-08-17T00:00:00.000Z") }),
    ).rejects.toThrow("Tenant membership is not available");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects tenant administration data for a tenant without active membership", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.administration({ tenantId: tenantB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
  });

  it("rejects assignable-user lookup for a tenant without active membership before inspecting user identities", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.findAssignableUser({ tenantId: tenantB, email: "candidate@example.com" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
  });

  it("returns an exact-match user only after tenant-manager checks and only when that user is not already a member", async () => {
    let membershipCheckCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "EXECUTIVE" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "tenant.manage" }]);
      if (keys === "email,id,name") return queryResult([{ id: 99, name: "Candidate User", email: "candidate@example.com" }]);
      if (keys === "id") {
        membershipCheckCount += 1;
        return queryResult(membershipCheckCount === 1 ? [] : [{ id: "existing-membership" }]);
      }
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.findAssignableUser({ tenantId: tenantA, email: "candidate@example.com" })).resolves.toEqual({ id: 99, name: "Candidate User", email: "candidate@example.com" });
    await expect(caller.tenant.findAssignableUser({ tenantId: tenantA, email: "candidate@example.com" })).resolves.toBeNull();
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects custom-role creation for a tenant without active membership before inspecting roles or permissions", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.createRole({ tenantId: tenantB, code: "CUSTOM_MANAGER", name: "Custom Manager", productCode: "EXECUTIVE", permissionCodes: ["tenant.manage"] })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects a membership invitation for a tenant without active membership before inspecting invite data", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.createInvitation({ tenantId: tenantB, email: "invitee@example.com", roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects portfolio creation for a tenant without active membership before writing master data", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.createPortfolio({ tenantId: tenantB, code: "PORT-A", name: "Portfolio A" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects project-program linking for a tenant without active membership before loading the project", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.linkProject({ tenantId: tenantB, projectId: projectB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects a project link when the project is outside the tenant before writing", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.linkProject({ tenantId: tenantA, projectId: projectA })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid project lifecycle transition before writing", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id,lifecycleStage") return queryResult([{ id: projectA, lifecycleStage: "planning" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.projects.transitionLifecycle({ tenantId: tenantA, projectId: projectA, lifecycleStage: "handover" })).rejects.toThrow("PROJECT_OS_LIFECYCLE_TRANSITION_INVALID");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("transitions an authorized project lifecycle with audit evidence in one transaction", async () => {
    const transactionDouble = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id,lifecycleStage") return queryResult([{ id: projectA, lifecycleStage: "planning" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.projects.transitionLifecycle({ tenantId: tenantA, projectId: projectA, lifecycleStage: "execution" });

    expect(result).toEqual({ projectId: projectA, lifecycleStage: "execution" });
    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects contract creation for a tenant without active membership before loading the project", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.contracts.create({ tenantId: tenantB, projectId: projectB, code: "CTR-01", title: "Civil Works", counterparty: "Build Co", contractValue: 1000, currency: "USD" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects document creation for a tenant without active membership before storage or project lookup", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.createWithVersion({ tenantId: tenantB, projectId: projectB, documentNumber: "DRW-01", title: "Foundation drawing", category: "drawing", originalName: "foundation.pdf", mimeType: "application/pdf", contentBase64: "aGVsbG8=" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(storageDouble.storagePut).not.toHaveBeenCalled();
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("creates an authorized project document and first version with audit evidence in one transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.createWithVersion({ tenantId: tenantA, projectId: projectA, documentNumber: "DRW-01", title: "Foundation drawing", category: "drawing", originalName: "foundation.pdf", mimeType: "application/pdf", contentBase64: "aGVsbG8=" })).resolves.toMatchObject({ id: expect.any(String), versionNumber: 1 });

    expect(storageDouble.storagePut).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(3);
  });

  it("adds an authorized successive document version with audit evidence in one transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") { idSelectionCount += 1; return queryResult([{ id: idSelectionCount === 1 ? projectA : "99999999-9999-4999-8999-999999999999" }]); }
      if (keys === "versionNumber") return queryResult([{ versionNumber: 1 }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.addVersion({ tenantId: tenantA, projectId: projectA, documentId: "99999999-9999-4999-8999-999999999999", originalName: "foundation-r1.pdf", mimeType: "application/pdf", contentBase64: "aGVsbG8=" })).resolves.toMatchObject({ versionNumber: 2 });

    expect(storageDouble.storagePut).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects document-register reading for a tenant without active membership before selecting project documents", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.getProjectRegister({ tenantId: tenantB, projectId: projectB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid document workflow transition before writing", async () => {
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") {
        idSelectionCount += 1;
        return queryResult(idSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : [{ id: "document-a", status: "draft" }]);
      }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.transitionStatus({ tenantId: tenantA, projectId: projectA, documentId: "99999999-9999-4999-8999-999999999999", nextStatus: "approved" })).rejects.toThrow("PROJECT_OS_DOCUMENT_WORKFLOW_TRANSITION_INVALID");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects a document workflow transition for a document outside the project before writing", async () => {
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") {
        idSelectionCount += 1;
        return queryResult(idSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : []);
      }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.transitionStatus({ tenantId: tenantA, projectId: projectA, documentId: "99999999-9999-4999-8999-999999999999", nextStatus: "for_review" })).rejects.toThrow("PROJECT_OS_DOCUMENT_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("transitions an authorized document to review with audit evidence in one transaction", async () => {
    const transactionDouble = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
      insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    };
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") {
        idSelectionCount += 1;
        return queryResult(idSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : [{ id: "document-a", status: "draft" }]);
      }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.transitionStatus({ tenantId: tenantA, projectId: projectA, documentId: "99999999-9999-4999-8999-999999999999", nextStatus: "for_review" })).resolves.toMatchObject({ previousStatus: "draft", status: "for_review" });

    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects document-register reading when the project is outside the tenant before returning documents", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.read" }]);
      if (keys === "id") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.getProjectRegister({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects a successive document version outside the project before storage or writing", async () => {
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") { idSelectionCount += 1; return queryResult(idSelectionCount === 1 ? [{ id: projectA }] : []); }
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.documents.addVersion({ tenantId: tenantA, projectId: projectA, documentId: "99999999-9999-4999-8999-999999999999", originalName: "foreign.pdf", mimeType: "application/pdf", contentBase64: "aGVsbG8=" })).rejects.toThrow("PROJECT_OS_DOCUMENT_NOT_FOUND");

    expect(storageDouble.storagePut).not.toHaveBeenCalled();
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects NCR creation for a tenant without active membership before loading the project", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.ncrs.create({ tenantId: tenantB, projectId: projectB, ncrNumber: "NCR-01", title: "Reinforcement deviation", description: "Reinforcement does not match the approved drawing." })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid NCR status transition before writing", async () => {
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") { idSelectionCount += 1; return queryResult(idSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : [{ id: "ncr-a", status: "open" }]); }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.ncrs.transitionStatus({ tenantId: tenantA, projectId: projectA, ncrId: "99999999-9999-4999-8999-999999999999", nextStatus: "closed" })).rejects.toThrow("PROJECT_OS_NCR_TRANSITION_INVALID");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("creates an authorized NCR with audit evidence in one transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.ncrs.create({ tenantId: tenantA, projectId: projectA, ncrNumber: "NCR-01", title: "Reinforcement deviation", description: "Reinforcement does not match the approved drawing." })).resolves.toMatchObject({ id: expect.any(String), status: "open" });
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("transitions an authorized NCR to investigation with audit evidence in one transaction", async () => {
    const transactionDouble = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") { idSelectionCount += 1; return queryResult(idSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : [{ id: "ncr-a", status: "open" }]); }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.ncrs.transitionStatus({ tenantId: tenantA, projectId: projectA, ncrId: "99999999-9999-4999-8999-999999999999", nextStatus: "under_investigation" })).resolves.toMatchObject({ previousStatus: "open", status: "under_investigation" });
    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects NCR reading outside the authorized project before returning any register data", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.read" }]);
      if (keys === "id") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.ncrs.list({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an NCR transition outside the requested project before update or audit", async () => {
    let idStatusSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") { idStatusSelectionCount += 1; return queryResult(idStatusSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : []); }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.ncrs.transitionStatus({ tenantId: tenantA, projectId: projectA, ncrId: "99999999-9999-4999-8999-999999999999", nextStatus: "under_investigation" })).rejects.toThrow("PROJECT_OS_NCR_NOT_FOUND");
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects RFI creation for a tenant without active membership before loading the project", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.rfis.create({ tenantId: tenantB, projectId: projectB, rfiNumber: "RFI-01", subject: "Foundation detail", question: "Please clarify foundation reinforcement details." })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid RFI status transition before writing", async () => {
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") { idSelectionCount += 1; return queryResult(idSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : [{ id: "rfi-a", status: "draft" }]); }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.rfis.transitionStatus({ tenantId: tenantA, projectId: projectA, rfiId: "99999999-9999-4999-8999-999999999999", nextStatus: "closed" })).rejects.toThrow("PROJECT_OS_RFI_TRANSITION_INVALID");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("creates an authorized RFI with audit evidence in one transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.rfis.create({ tenantId: tenantA, projectId: projectA, rfiNumber: "RFI-01", subject: "Foundation detail", question: "Please clarify foundation reinforcement details." })).resolves.toMatchObject({ id: expect.any(String), status: "draft" });

    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("transitions an authorized RFI to submitted with audit evidence in one transaction", async () => {
    const transactionDouble = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") { idSelectionCount += 1; return queryResult(idSelectionCount === 1 ? [{ id: "membership-a", status: "active" }] : [{ id: "rfi-a", status: "draft" }]); }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.rfis.transitionStatus({ tenantId: tenantA, projectId: projectA, rfiId: "99999999-9999-4999-8999-999999999999", nextStatus: "submitted" })).resolves.toMatchObject({ previousStatus: "draft", status: "submitted" });

    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects RFI-register reading for a tenant without active membership before selecting RFIs", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.rfis.list({ tenantId: tenantB, projectId: projectB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
  });

  it("rejects RFI-register reading when the project is outside the tenant before returning RFIs", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.read" }]);
      if (keys === "id") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.rfis.list({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an RFI status transition outside the project before writing", async () => {
    let idStatusCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") { idStatusCount += 1; return queryResult(idStatusCount === 1 ? [{ id: "membership-a", status: "active" }] : []); }
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.rfis.transitionStatus({ tenantId: tenantA, projectId: projectA, rfiId: "99999999-9999-4999-8999-999999999999", nextStatus: "submitted" })).rejects.toThrow("PROJECT_OS_RFI_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects project-health capture for a tenant without active membership before loading operational sources", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.controls.captureProjectHealthSnapshot({ tenantId: tenantB, projectId: projectB, periodAt: new Date("2026-08-18T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("captures authorized project health with a snapshot and audit evidence in one transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "bac,cpi,eac,spi") return queryResult([{ cpi: "0.88", spi: "0.95", eac: "120", bac: "100" }]);
      if (keys === "probability,severity,status") return queryResult([{ probability: 4, severity: 4, status: "open" }]);
      if (keys === "dueAt,status") return queryResult([{ dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "open" }]);
      if (keys === "dueAt,rfiNumber,status") return queryResult([{ rfiNumber: "RFI-01", dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "submitted" }]);
      if (keys === "dueAt,ncrNumber,status") return queryResult([{ ncrNumber: "NCR-01", dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "under_investigation" }]);
      if (keys === "dueAt,observationNumber,status") return queryResult([{ observationNumber: "HSE-01", dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "remediation" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.controls.captureProjectHealthSnapshot({ tenantId: tenantA, projectId: projectA, periodAt: new Date("2026-08-18T00:00:00.000Z") });

    expect(result).toMatchObject({ score: 13, status: "red", sources: { latestEvmFound: true, highRiskCount: 1, overdueActionCount: 1, overdueRfiCount: 1, overdueNcrCount: 1, overdueHseCount: 1 } });
    expect(transactionDouble.insert).toHaveBeenCalledTimes(3);
  });

  it("does not count an overdue RFI outside the project in the project-health source", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "bac,cpi,eac,spi") return queryResult([{ cpi: "0.88", spi: "0.95", eac: "120", bac: "100" }]);
      if (keys === "probability,severity,status") return queryResult([{ probability: 4, severity: 4, status: "open" }]);
      if (keys === "dueAt,status") return queryResult([{ dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "open" }]);
      if (keys === "dueAt,rfiNumber,status") return queryResult([]);
      if (keys === "dueAt,ncrNumber,status") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.controls.captureProjectHealthSnapshot({ tenantId: tenantA, projectId: projectA, periodAt: new Date("2026-08-18T00:00:00.000Z") });

    expect(result.sources.overdueRfiCount).toBe(0);
    expect(result.score).toBe(37);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(3);
  });

  it("does not count an overdue NCR outside the project in the project-health source", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "bac,cpi,eac,spi") return queryResult([{ cpi: "0.88", spi: "0.95", eac: "120", bac: "100" }]);
      if (keys === "probability,severity,status") return queryResult([{ probability: 4, severity: 4, status: "open" }]);
      if (keys === "dueAt,status") return queryResult([{ dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "open" }]);
      if (keys === "dueAt,rfiNumber,status") return queryResult([]);
      if (keys === "dueAt,ncrNumber,status") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.controls.captureProjectHealthSnapshot({ tenantId: tenantA, projectId: projectA, periodAt: new Date("2026-08-18T00:00:00.000Z") });

    expect(result.sources.overdueNcrCount).toBe(0);
    expect(result.score).toBe(37);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(3);
  });

  it("does not count an overdue HSE observation outside the project in the project-health source", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "bac,cpi,eac,spi") return queryResult([{ cpi: "0.88", spi: "0.95", eac: "120", bac: "100" }]);
      if (keys === "probability,severity,status") return queryResult([{ probability: 4, severity: 4, status: "open" }]);
      if (keys === "dueAt,status") return queryResult([{ dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "open" }]);
      if (keys === "dueAt,rfiNumber,status") return queryResult([]);
      if (keys === "dueAt,ncrNumber,status") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const result = await appRouter.createCaller(context()).controls.captureProjectHealthSnapshot({ tenantId: tenantA, projectId: projectA, periodAt: new Date("2026-08-18T00:00:00.000Z") });
    expect(result.sources.overdueHseCount).toBe(0);
    expect(result.score).toBe(37);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(3);
  });

  it("rejects a commitment whose contract belongs outside the requested tenant project before writing", async () => {
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") { idSelectionCount += 1; return queryResult(idSelectionCount === 1 ? [{ id: projectA }] : []); }
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.contracts.createCommitment({ tenantId: tenantA, projectId: projectA, contractId: "99999999-9999-4999-8999-999999999999", code: "COM-01", description: "Steel package", amount: 250, currency: "USD" })).rejects.toThrow("PROJECT_OS_CONTRACT_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("creates an authorized contract with audit evidence in the same transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.contracts.create({ tenantId: tenantA, projectId: projectA, code: "CTR-01", title: "Civil Works", counterparty: "Build Co", contractValue: 1000, currency: "USD" })).resolves.toMatchObject({ id: expect.any(String) });

    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("creates an authorized commitment with audit evidence in the same transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    let idSelectionCount = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") { idSelectionCount += 1; return queryResult([{ id: idSelectionCount === 1 ? projectA : "contract-a" }]); }
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.contracts.createCommitment({ tenantId: tenantA, projectId: projectA, contractId: "99999999-9999-4999-8999-999999999999", code: "COM-01", description: "Steel package", amount: 250, currency: "USD" })).resolves.toMatchObject({ id: expect.any(String) });

    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects contract-register reading for a tenant without active membership before reading project records", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.contracts.getProjectRegister({ tenantId: tenantB, projectId: projectB })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
  });

  it("rejects contract-register reading when the project is outside the tenant before returning contracts", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.read" }]);
      if (keys === "id") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.contracts.getProjectRegister({ tenantId: tenantA, projectId: projectB })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects a project link when the selected program is outside the tenant before writing", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "id,portfolioId") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.linkProject({ tenantId: tenantA, projectId: projectA, programId: "99999999-9999-4999-8999-999999999999" })).rejects.toThrow("PROJECT_OS_PROGRAM_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("links an authorized project to a tenant-owned program with audit evidence in one transaction", async () => {
    const transactionDouble = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "id,portfolioId") return queryResult([{ id: "program-a", portfolioId: null }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.pmo.linkProject({ tenantId: tenantA, projectId: projectA, programId: "99999999-9999-4999-8999-999999999999" });

    expect(result).toMatchObject({ projectId: projectA, programId: "99999999-9999-4999-8999-999999999999", portfolioId: null });
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects a project link when the selected portfolio is outside the tenant before writing", async () => {
    let idLookups = 0;
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") {
        idLookups += 1;
        return queryResult(idLookups === 1 ? [{ id: projectA }] : []);
      }
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.linkProject({ tenantId: tenantA, projectId: projectA, portfolioId: "99999999-9999-4999-8999-999999999999" })).rejects.toThrow("PROJECT_OS_PORTFOLIO_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects a program linked to a portfolio outside the tenant before writing", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.createProgram({ tenantId: tenantA, portfolioId: "88888888-8888-4888-8888-888888888888", code: "PRG-A", name: "Program A" })).rejects.toThrow("PROJECT_OS_PORTFOLIO_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("creates an authorized portfolio with audit evidence in the same transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.pmo.createPortfolio({ tenantId: tenantA, code: "port-a", name: "Portfolio A" });

    expect(result.id).toEqual(expect.any(String));
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("creates an authorized program linked to a tenant-owned portfolio with audit evidence in the same transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([{ id: "portfolio-a" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.pmo.createProgram({ tenantId: tenantA, portfolioId: "99999999-9999-4999-8999-999999999999", code: "prg-a", name: "Program A" });

    expect(result.id).toEqual(expect.any(String));
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("creates an authorized program without a portfolio with audit evidence in the same transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    const result = await caller.pmo.createProgram({ tenantId: tenantA, code: "prg-b", name: "Independent Program" });

    expect(result.id).toEqual(expect.any(String));
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid invitation token without creating a membership or writing audit evidence", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.acceptInvitation({ inviteToken: "abcdefghijklmnopqrstuvwxyz1234567890" })).rejects.toThrow("PROJECT_OS_INVITATION_INVALID_OR_EXPIRED");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects custom-role permissions outside the selected product before writing", async () => {
    configureAuthorizedRoleCreation("PMO");
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.createRole({ tenantId: tenantA, code: "CUSTOM_MANAGER", name: "Custom Manager", productCode: "EXECUTIVE", permissionCodes: ["tenant.manage"] })).rejects.toThrow("PROJECT_OS_INVALID_ROLE_PERMISSIONS");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("creates an authorized custom role with catalog permissions and audit evidence in one transaction", async () => {
    const transactionDouble = configureAuthorizedRoleCreation();
    const caller = appRouter.createCaller(context());

    const result = await caller.tenant.createRole({ tenantId: tenantA, code: "custom_manager", name: "Custom Manager", productCode: "EXECUTIVE", permissionCodes: ["tenant.manage"] });

    expect(result).toMatchObject({ id: expect.any(String), code: "CUSTOM_MANAGER", permissionCount: 1 });
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(3);
  });

  it("rejects an additional membership-role assignment for a tenant without active membership before loading the membership", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.assignMembershipRole({ tenantId: tenantB, membershipId: "66666666-6666-4666-8666-666666666666", roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an additional role assignment with a project scope outside the tenant before loading the membership", async () => {
    configureAuthorizedMembershipRoleAssignment();
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.assignMembershipRole({ tenantId: tenantA, membershipId: "66666666-6666-4666-8666-666666666666", roleId: "55555555-5555-4555-8555-555555555555", scopeType: "project", scopeId: "88888888-8888-4888-8888-888888888888" })).rejects.toThrow("PROJECT_OS_INVALID_SCOPE");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects a role assignment that would change the acting manager's own privileges", async () => {
    configureAuthorizedMembershipRoleAssignment({ membershipUserId: 42 });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.assignMembershipRole({ tenantId: tenantA, membershipId: "66666666-6666-4666-8666-666666666666", roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" })).rejects.toThrow("PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an additional role assignment when the membership belongs to another tenant", async () => {
    configureAuthorizedMembershipRoleAssignment({ membershipTenantId: tenantB });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.assignMembershipRole({ tenantId: tenantA, membershipId: "66666666-6666-4666-8666-666666666666", roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" })).rejects.toThrow("PROJECT_OS_MEMBER_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("assigns an authorized additional role and records audit evidence in the same transaction", async () => {
    const transactionDouble = configureAuthorizedMembershipRoleAssignment();
    const caller = appRouter.createCaller(context());

    const result = await caller.tenant.assignMembershipRole({ tenantId: tenantA, membershipId: "66666666-6666-4666-8666-666666666666", roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" });

    expect(result).toMatchObject({ assignmentId: expect.any(String), membershipId: "member-target", roleId: "55555555-5555-4555-8555-555555555555" });
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects role-assignment revocation for a tenant without active membership before loading the assignment", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.revokeMembershipRole({ tenantId: tenantB, assignmentId: "77777777-7777-4777-8777-777777777777" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects revocation of a role assignment owned by the acting manager", async () => {
    configureAuthorizedMembershipRoleRevocation({ assignmentUserId: 42 });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.revokeMembershipRole({ tenantId: tenantA, assignmentId: "77777777-7777-4777-8777-777777777777" })).rejects.toThrow("PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects role-assignment revocation when the assignment belongs to another tenant", async () => {
    configureAuthorizedMembershipRoleRevocation({ assignmentTenantId: tenantB });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.revokeMembershipRole({ tenantId: tenantA, assignmentId: "77777777-7777-4777-8777-777777777777" })).rejects.toThrow("PROJECT_OS_ROLE_ASSIGNMENT_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("revokes an authorized role assignment and records audit evidence in the same transaction", async () => {
    const transactionDouble = configureAuthorizedMembershipRoleRevocation();
    const caller = appRouter.createCaller(context());

    const result = await caller.tenant.revokeMembershipRole({ tenantId: tenantA, assignmentId: "77777777-7777-4777-8777-777777777777" });

    expect(result).toEqual({ assignmentId: "77777777-7777-4777-8777-777777777777", membershipId: "member-target" });
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.delete).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects custom-role updates for a tenant without active membership before loading the role", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.updateRole({ tenantId: tenantB, roleId: "55555555-5555-4555-8555-555555555555", name: "Updated role", permissionCodes: ["tenant.manage"] })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects updates to a system-managed role before inspecting the actor's assignments or writing", async () => {
    configureAuthorizedRoleUpdate({ systemManaged: true });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.updateRole({ tenantId: tenantA, roleId: "55555555-5555-4555-8555-555555555555", name: "Updated role", permissionCodes: ["tenant.manage"] })).rejects.toThrow("PROJECT_OS_SYSTEM_ROLE_IMMUTABLE");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects updates to a role assigned to the acting manager", async () => {
    configureAuthorizedRoleUpdate({ actorHasRole: true });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.updateRole({ tenantId: tenantA, roleId: "55555555-5555-4555-8555-555555555555", name: "Updated role", permissionCodes: ["tenant.manage"] })).rejects.toThrow("PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("updates an authorized custom role and its catalog permissions with audit evidence in one transaction", async () => {
    const transactionDouble = configureAuthorizedRoleUpdate();
    const caller = appRouter.createCaller(context());

    const result = await caller.tenant.updateRole({ tenantId: tenantA, roleId: "55555555-5555-4555-8555-555555555555", name: "Updated role", permissionCodes: ["tenant.manage"] });

    expect(result).toEqual({ id: "55555555-5555-4555-8555-555555555555", permissionCount: 1 });
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.delete).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects member assignment for a tenant without active membership before inspecting the target user or role", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.assignMember({ tenantId: tenantB, targetUserId: 99, roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");

    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects member assignment when the EXECUTIVE entitlement is absent before inspecting the target user or role", async () => {
    configureActiveMembershipWithoutProjectEntitlement();
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.assignMember({ tenantId: tenantA, targetUserId: 99, roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" })).rejects.toThrow("not licensed");

    expect(databaseDouble.select).toHaveBeenCalledTimes(4);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an assignment that would alter the acting manager's own privileges before inspecting target data or writing", async () => {
    configureAuthorizedOperationalAccess({ productCode: "EXECUTIVE", permissionCode: "tenant.manage" });
    const caller = appRouter.createCaller(context());

    await expect(caller.tenant.assignMember({ tenantId: tenantA, targetUserId: 42, roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" })).rejects.toThrow("PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN");

    expect(databaseDouble.select).toHaveBeenCalledTimes(4);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("allows an authorized member assignment only after access checks, and writes membership, role, and audit evidence atomically", async () => {
    const transactionDouble = configureAuthorizedTenantMemberAssignment();
    const caller = appRouter.createCaller(context());

    const result = await caller.tenant.assignMember({ tenantId: tenantA, targetUserId: 99, roleId: "55555555-5555-4555-8555-555555555555", scopeType: "company" });

    expect(result).toMatchObject({ membershipId: expect.any(String), assignmentId: expect.any(String), status: "invited" });
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["EVM snapshot", (caller: ReturnType<typeof appRouter.createCaller>) => caller.controls.saveEvmSnapshot({ tenantId: tenantA, projectId: projectB, periodAt: new Date("2026-08-17T00:00:00.000Z"), pv: 100, ev: 90, ac: 95, bac: 120, eacMethod: "bac_over_cpi" })],
    ["operational EVM snapshot", (caller: ReturnType<typeof appRouter.createCaller>) => caller.controls.captureOperationalEvmSnapshot({ tenantId: tenantA, projectId: projectB, periodAt: new Date("2026-08-17T00:00:00.000Z"), eacMethod: "ac_plus_remaining" })],
    ["WBS", (caller: ReturnType<typeof appRouter.createCaller>) => caller.wbs.create({ tenantId: tenantA, projectId: projectB, code: "1", name: "Foundation", plannedValue: 100 })],
    ["actual cost", (caller: ReturnType<typeof appRouter.createCaller>) => caller.costs.createActual({ tenantId: tenantA, projectId: projectB, amount: 100, incurredAt: new Date("2026-08-17T00:00:00.000Z") })],
    ["activity", (caller: ReturnType<typeof appRouter.createCaller>) => caller.activities.create({ tenantId: tenantA, projectId: projectB, code: "A-01", name: "Activity without project entitlement", plannedStartAt: new Date("2026-08-17T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-18T00:00:00.000Z") })],
    ["progress", (caller: ReturnType<typeof appRouter.createCaller>) => caller.progress.create({ tenantId: tenantA, projectId: projectB, wbsItemId: wbsB, percentComplete: 50, reportedAt: new Date("2026-08-17T00:00:00.000Z") })],
    ["budget", (caller: ReturnType<typeof appRouter.createCaller>) => caller.budgets.create({ tenantId: tenantA, projectId: projectB, costCode: "CIVIL", originalAmount: 100, currentAmount: 100 })],
  ])("rejects %s through the API when the PROJECT entitlement is absent", async (_operation, execute) => {
    configureActiveMembershipWithoutProjectEntitlement();
    const caller = appRouter.createCaller(context());

    await expect(execute(caller)).rejects.toThrow("not licensed");
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["risk", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createRisk({ tenantId: tenantB, projectId: projectB, code: "R-01", title: "Cross-tenant risk", probability: 3, severity: 4 })],
    ["issue", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createIssue({ tenantId: tenantB, projectId: projectB, code: "I-01", title: "Cross-tenant issue", priority: "high" })],
    ["action", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createAction({ tenantId: tenantB, projectId: projectB, title: "Cross-tenant action", priority: "high" })],
    ["decision", (caller: ReturnType<typeof appRouter.createCaller>) => caller.executive.createDecision({ tenantId: tenantB, projectId: projectB, problem: "Cross-tenant decision", options: "Do not permit this write." })],
  ])("rejects a %s write for a tenant without an active membership before querying the project or writing", async (_operation, execute) => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(execute(caller)).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["risk", "PMO", "pmo.write", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createRisk({ tenantId: tenantA, projectId: projectB, code: "R-01", title: "Unlicensed risk", probability: 3, severity: 4 })],
    ["issue", "PMO", "pmo.write", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createIssue({ tenantId: tenantA, projectId: projectB, code: "I-01", title: "Unlicensed issue", priority: "high" })],
    ["action", "PMO", "pmo.write", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createAction({ tenantId: tenantA, projectId: projectB, title: "Unlicensed action", priority: "high" })],
    ["decision", "EXECUTIVE", "tenant.manage", (caller: ReturnType<typeof appRouter.createCaller>) => caller.executive.createDecision({ tenantId: tenantA, projectId: projectB, problem: "Unlicensed decision", options: "Block the write." })],
  ])("rejects an unlicensed %s write before querying the project or writing", async (_operation, _productCode, _permissionCode, execute) => {
    configureActiveMembershipWithoutProjectEntitlement();
    const caller = appRouter.createCaller(context());

    await expect(execute(caller)).rejects.toThrow("not licensed");
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
    expect(databaseDouble.select).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["risk", "PMO", "pmo.write", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createRisk({ tenantId: tenantA, projectId: projectB, code: "R-02", title: "Authorized risk", probability: 3, severity: 4 })],
    ["issue", "PMO", "pmo.write", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createIssue({ tenantId: tenantA, projectId: projectB, code: "I-02", title: "Authorized issue", priority: "medium" })],
    ["action", "PMO", "pmo.write", (caller: ReturnType<typeof appRouter.createCaller>) => caller.pmo.createAction({ tenantId: tenantA, projectId: projectB, title: "Authorized action", priority: "medium" })],
    ["decision", "EXECUTIVE", "tenant.manage", (caller: ReturnType<typeof appRouter.createCaller>) => caller.executive.createDecision({ tenantId: tenantA, projectId: projectB, problem: "Authorized decision", options: "Approve with controls." })],
  ])("allows an authorized %s write only after access and project-scope checks, with an atomic audit write", async (_operation, productCode, permissionCode, execute) => {
    const transactionDouble = configureAuthorizedOperationalAccess({ productCode: productCode as "PMO" | "EXECUTIVE", permissionCode: permissionCode as "pmo.write" | "tenant.manage" });
    const caller = appRouter.createCaller(context());

    const result = await execute(caller);

    expect(result.id).toEqual(expect.any(String));
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects an activity write for a tenant without membership before loading the project", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.activities.create({ tenantId: tenantB, projectId: projectB, code: "A-02", name: "Cross-tenant activity", plannedStartAt: new Date("2026-08-17T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-18T00:00:00.000Z") })).rejects.toThrow("Tenant membership is not available");
    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("allows an entitled activity write and records its audit evidence in the same transaction", async () => {
    const transactionDouble = configureAuthorizedOperationalAccess({ productCode: "PROJECT", permissionCode: "project.write" });
    const caller = appRouter.createCaller(context());

    const result = await caller.activities.create({ tenantId: tenantA, projectId: projectB, code: "A-03", name: "Authorized activity", plannedValue: 100, plannedStartAt: new Date("2026-08-17T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-18T00:00:00.000Z") });

    expect(result.id).toEqual(expect.any(String));
    expect(databaseDouble.transaction).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });

  it("rejects a backwards activity schedule after authorization and before any write", async () => {
    configureAuthorizedOperationalAccess({ productCode: "PROJECT", permissionCode: "project.write" });
    const caller = appRouter.createCaller(context());

    await expect(caller.activities.create({ tenantId: tenantA, projectId: projectB, code: "A-04", name: "Invalid schedule", plannedStartAt: new Date("2026-08-18T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-17T00:00:00.000Z") })).rejects.toThrow("PROJECT_OS_ACTIVITY_SCHEDULE_INVALID");
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects escalation of an issue outside the requested project before writing", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "escalationStatus,id,priority,status") return queryResult([]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.transitionIssueEscalation({ tenantId: tenantA, projectId: projectA, issueId: "99999999-9999-4999-8999-999999999999", nextStatus: "pending" })).rejects.toThrow("PROJECT_OS_ISSUE_NOT_FOUND");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("rejects an action escalation that is not overdue before writing", async () => {
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "dueAt,escalationStatus,id,status") return queryResult([{ id: "99999999-9999-4999-8999-999999999999", dueAt: new Date("2099-01-01T00:00:00.000Z"), status: "open", escalationStatus: "none" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.transitionActionEscalation({ tenantId: tenantA, projectId: projectA, actionId: "99999999-9999-4999-8999-999999999999", nextStatus: "pending" })).rejects.toThrow("PROJECT_OS_ESCALATION_NOT_ELIGIBLE");

    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("transitions an eligible critical issue escalation with audit evidence in one transaction", async () => {
    const transactionDouble = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "escalationStatus,id,priority,status") return queryResult([{ id: "99999999-9999-4999-8999-999999999999", priority: "critical", status: "open", escalationStatus: "none" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.transitionIssueEscalation({ tenantId: tenantA, projectId: projectA, issueId: "99999999-9999-4999-8999-999999999999", nextStatus: "pending" })).resolves.toEqual({ id: "99999999-9999-4999-8999-999999999999", previousStatus: "none", status: "pending" });

    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("transitions an eligible overdue action escalation with audit evidence in one transaction", async () => {
    const transactionDouble = { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })), insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PMO" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "pmo.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      if (keys === "dueAt,escalationStatus,id,status") return queryResult([{ id: "99999999-9999-4999-8999-999999999999", dueAt: new Date("2020-01-01T00:00:00.000Z"), status: "open", escalationStatus: "none" }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.pmo.transitionActionEscalation({ tenantId: tenantA, projectId: projectA, actionId: "99999999-9999-4999-8999-999999999999", nextStatus: "pending" })).resolves.toEqual({ id: "99999999-9999-4999-8999-999999999999", previousStatus: "none", status: "pending" });

    expect(transactionDouble.update).toHaveBeenCalledTimes(1);
    expect(transactionDouble.insert).toHaveBeenCalledTimes(1);
  });

  it("rejects HSE-observation creation for a tenant without active membership before loading the project", async () => {
    databaseDouble.select.mockReturnValue(queryResult([]));
    const caller = appRouter.createCaller(context());

    await expect(caller.hse.create({ tenantId: tenantB, projectId: projectB, observationNumber: "HSE-01", title: "Open edge", description: "An unprotected edge requires immediate control.", category: "safety", severity: "high" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(databaseDouble.select).toHaveBeenCalledTimes(1);
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });

  it("creates an authorized HSE observation with audit evidence in one transaction", async () => {
    const transactionDouble = { insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })) };
    databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
      const keys = Object.keys(selection).sort().join(",");
      if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
      if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
      if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
      if (keys === "code") return queryResult([{ code: "project.write" }]);
      if (keys === "id") return queryResult([{ id: projectA }]);
      throw new Error(`Unexpected select shape: ${keys}`);
    });
    databaseDouble.transaction.mockImplementation(async (callback: (tx: typeof transactionDouble) => Promise<unknown>) => callback(transactionDouble));
    const caller = appRouter.createCaller(context());

    await expect(caller.hse.create({ tenantId: tenantA, projectId: projectA, observationNumber: "HSE-01", title: "Open edge", description: "An unprotected edge requires immediate control.", category: "safety", severity: "high" })).resolves.toMatchObject({ id: expect.any(String), status: "open" });
    expect(transactionDouble.insert).toHaveBeenCalledTimes(2);
  });
});

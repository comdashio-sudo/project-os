import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseDouble = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => databaseDouble),
}));

import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const projectB = "33333333-3333-4333-8333-333333333333";
const wbsB = "44444444-4444-4444-8444-444444444444";

function queryResult<T>(result: T) {
  const query = {
    from: () => query,
    where: () => query,
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
});

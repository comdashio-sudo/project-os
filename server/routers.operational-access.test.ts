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

  it.each([
    ["EVM snapshot", (caller: ReturnType<typeof appRouter.createCaller>) => caller.controls.saveEvmSnapshot({ tenantId: tenantA, projectId: projectB, periodAt: new Date("2026-08-17T00:00:00.000Z"), pv: 100, ev: 90, ac: 95, bac: 120, eacMethod: "bac_over_cpi" })],
    ["WBS", (caller: ReturnType<typeof appRouter.createCaller>) => caller.wbs.create({ tenantId: tenantA, projectId: projectB, code: "1", name: "Foundation", plannedValue: 100 })],
    ["actual cost", (caller: ReturnType<typeof appRouter.createCaller>) => caller.costs.createActual({ tenantId: tenantA, projectId: projectB, amount: 100, incurredAt: new Date("2026-08-17T00:00:00.000Z") })],
    ["progress", (caller: ReturnType<typeof appRouter.createCaller>) => caller.progress.create({ tenantId: tenantA, projectId: projectB, wbsItemId: wbsB, percentComplete: 50, reportedAt: new Date("2026-08-17T00:00:00.000Z") })],
    ["budget", (caller: ReturnType<typeof appRouter.createCaller>) => caller.budgets.create({ tenantId: tenantA, projectId: projectB, costCode: "CIVIL", originalAmount: 100, currentAmount: 100 })],
  ])("rejects %s through the API when the PROJECT entitlement is absent", async (_operation, execute) => {
    configureActiveMembershipWithoutProjectEntitlement();
    const caller = appRouter.createCaller(context());

    await expect(execute(caller)).rejects.toThrow("not licensed");
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });
});

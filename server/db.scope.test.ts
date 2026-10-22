import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseDouble = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => databaseDouble),
}));

import { createBudgetLine, createCostEntry, createProgressEntry, createWbsItem } from "./db";
import { operationalPermissionCatalog } from "./domain/operationalRoles";

// The fully authorised user of these doubles is the tenant owner: the generic write permission plus every operational one.
const ownerPermissionRows = [{ code: "project.write" }, ...operationalPermissionCatalog.map(permission => ({ code: permission.code }))];

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

function configureTenantAndProjectWithForeignWbs() {
  let idSelectionCount = 0;
  databaseDouble.select.mockImplementation((selection: Record<string, unknown>) => {
    const keys = Object.keys(selection).sort().join(",");

    if (keys === "id,status") return queryResult([{ id: "membership-a", status: "active" }]);
    if (keys === "productCode") return queryResult([{ productCode: "PROJECT" }]);
    if (keys === "scopeId,scopeType") return queryResult([{ scopeType: "company", scopeId: null }]);
    if (keys === "code") return queryResult(ownerPermissionRows);

    if (keys === "id") {
      idSelectionCount += 1;
      return queryResult(idSelectionCount === 1 ? [{ id: "project-a" }] : []);
    }

    throw new Error(`Unexpected select shape: ${keys}`);
  });
}

describe("operational write scope guards", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://scope-test/project_os_integration_test";
    databaseDouble.select.mockReset();
    databaseDouble.transaction.mockReset();
    configureTenantAndProjectWithForeignWbs();
  });

  it.each([
    ["actual cost", () => createCostEntry({ userId: 42, tenantId: "tenant-a", projectId: "project-a", wbsItemId: "wbs-from-project-b", amount: 100, incurredAt: new Date("2026-08-17T00:00:00.000Z") })],
    ["progress", () => createProgressEntry({ userId: 42, tenantId: "tenant-a", projectId: "project-a", wbsItemId: "wbs-from-project-b", percentComplete: 20, reportedAt: new Date("2026-08-17T00:00:00.000Z") })],
    ["budget", () => createBudgetLine({ userId: 42, tenantId: "tenant-a", projectId: "project-a", wbsItemId: "wbs-from-project-b", costCode: "CIVIL", originalAmount: 200, currentAmount: 225 })],
    ["WBS child", () => createWbsItem({ userId: 42, tenantId: "tenant-a", projectId: "project-a", parentId: "wbs-from-project-b", code: "1.1", name: "Foreign parent" })],
  ])("rejects a %s write that supplies a direct foreign WBS identifier", async (_operation, execute) => {
    await expect(execute()).rejects.toThrow("PROJECT_OS_WBS_SCOPE_MISMATCH");
    expect(databaseDouble.transaction).not.toHaveBeenCalled();
  });
});

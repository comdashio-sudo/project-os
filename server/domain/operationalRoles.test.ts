import { describe, expect, it } from "vitest";
import { assertOperationalRoleSeparation, operationalRoleDefinitions } from "./operationalRoles";

describe("operational role separation", () => {
  it.each([
    ["PROCUREMENT_OFFICER", "WAREHOUSE_CUSTODIAN"],
    ["ACCOUNTANT", "FINANCE_MANAGER"],
    ["HR_MANAGER", "ACCOUNTANT"],
  ])("rejects %s with %s in an overlapping scope", (existingRole, nextRole) => {
    expect(() => assertOperationalRoleSeparation([existingRole], nextRole)).toThrow("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
  });

  it("grants the project manager coordinated controls without conflicting execution approvals", () => {
    expect(() => assertOperationalRoleSeparation(["WAREHOUSE_CUSTODIAN"], "SITE_ENGINEER")).not.toThrow();
    expect(operationalRoleDefinitions.map(role => role.code)).toEqual(expect.arrayContaining(["WAREHOUSE_CUSTODIAN", "PROCUREMENT_OFFICER", "FINANCE_MANAGER", "ACCOUNTANT", "HR_MANAGER", "PLANNING_ENGINEER", "SITE_ENGINEER", "PROJECT_MANAGER"]));
    const projectManager = operationalRoleDefinitions.find(role => role.code === "PROJECT_MANAGER");
    expect(projectManager?.permissions).toEqual(expect.arrayContaining(["project.manage", "project.budget.manage", "project.wbs.manage", "project.schedule.manage", "project.evm.manage", "project.progress.manage", "project.quality.manage", "project.hse.manage", "project.rfi.manage", "project.ncr.manage", "project.performance.manage"]));
    expect(projectManager?.permissions).not.toEqual(expect.arrayContaining(["project.procurement.manage", "project.inventory.manage", "project.payroll.run", "project.payroll.approve"]));
  });
});

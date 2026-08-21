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

  it("allows a project role that does not conflict with the existing scope", () => {
    expect(() => assertOperationalRoleSeparation(["WAREHOUSE_CUSTODIAN"], "SITE_ENGINEER")).not.toThrow();
    expect(operationalRoleDefinitions.map(role => role.code)).toEqual(expect.arrayContaining(["WAREHOUSE_CUSTODIAN", "PROCUREMENT_OFFICER", "FINANCE_MANAGER", "ACCOUNTANT", "HR_MANAGER", "PLANNING_ENGINEER", "SITE_ENGINEER", "PROJECT_MANAGER"]));
  });
});

import { describe, expect, it } from "vitest";
import { operationalRoleDefinitions, projectInviteRoleRefusal } from "./operationalRoles";

// Q-12 (c): which roles a project inviter (project.team.invite) may give.
const template = (code: string) => operationalRoleDefinitions.find(role => role.code === code)!;
const refusal = (code: string) => projectInviteRoleRefusal({ productCode: "productCode" in template(code) ? (template(code) as { productCode?: string }).productCode ?? "PROJECT" : "PROJECT" }, template(code).permissions);

describe("project invitation role rule", () => {
  it("allows the site team: site engineer, QA/QC, HSE, coordinator", () => {
    for (const code of ["SITE_ENGINEER", "QA_QC_MANAGER", "HSE_MANAGER", "PROJECT_COORDINATOR"]) expect(refusal(code)).toBeNull();
  });
  it("refuses a role that could invite in turn, a company-level role, and staff or pay data", () => {
    expect(refusal("PLANNING_ENGINEER")).toBe("project.team.invite");
    expect(refusal("PROJECT_MANAGER")).toBe("project.team.invite");
    expect(refusal("EXECUTIVE")).toBe("EXECUTIVE");
    expect(refusal("HR_MANAGER")).toMatch(/^project\.(hr|payroll|attendance)\./);
    expect(projectInviteRoleRefusal({ productCode: "PROJECT" }, ["project.read", "tenant.manage"])).toBe("tenant.manage");
  });
});

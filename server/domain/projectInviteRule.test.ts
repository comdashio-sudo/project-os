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
    expect(refusal("PLANNING_ENGINEER")).toBe("project.create"); // company-wide set-up (Q-12 d), and it invites in turn
    expect(refusal("PROJECT_MANAGER")).toBe("project.team.invite");
    expect(refusal("EXECUTIVE")).toBe("EXECUTIVE");
    expect(refusal("HR_MANAGER")).toMatch(/^project\.(hr|payroll|attendance)\./);
    expect(projectInviteRoleRefusal({ productCode: "PROJECT" }, ["project.read", "tenant.manage"])).toBe("tenant.manage");
  });
  it("Q-12 (d): whoever sets projects up may also give the project manager's role; never project.create, staff or pay data", () => {
    const setUp = { setsUpProjects: true };
    expect(projectInviteRoleRefusal({ productCode: "PROJECT" }, template("PROJECT_MANAGER").permissions, setUp)).toBeNull();
    expect(projectInviteRoleRefusal({ productCode: "PROJECT" }, template("PLANNING_ENGINEER").permissions, setUp)).toBe("project.create");
    expect(projectInviteRoleRefusal({ productCode: "PROJECT" }, template("HR_MANAGER").permissions, setUp)).toMatch(/^project\.(hr|payroll)\./);
    expect(projectInviteRoleRefusal({ productCode: "PROJECT" }, ["project.read", "project.payroll.run"], setUp)).toBe("project.payroll.run");
    expect(projectInviteRoleRefusal({ productCode: "PROJECT" }, ["project.read", "project.create"], {})).toBe("project.create");
  });
});

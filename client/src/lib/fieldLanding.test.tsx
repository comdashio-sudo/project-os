import { describe, expect, it } from "vitest";
import { fieldLandingPath, singleActiveTenant } from "./fieldLanding";

// Q-4 part 2: who opens straight on «Progress update».
const engineer = { member: true, permissions: ["project.pmc.read", "project.pmc.update"], scopes: [{ scopeType: "project", scopeId: "p1" }] };

describe("fieldLanding (Q-4 part 2)", () => {
  it("one active company, project roles on one project with the update permission: straight to Progress update", () => {
    expect(singleActiveTenant([{ tenantId: "t1", status: "active" }, { tenantId: "t2", status: "invited" }])).toBe("t1");
    expect(fieldLandingPath("t1", engineer)).toBe("/m/t1/p1/progress");
    expect(fieldLandingPath("t1", { ...engineer, scopes: [{ scopeType: "project", scopeId: "p1" }, { scopeType: "project", scopeId: "p1" }] })).toBe("/m/t1/p1/progress");
  });

  it("stays on the workspace: two companies, a company-wide role, two projects, no update permission, or not a member", () => {
    expect(singleActiveTenant([{ tenantId: "t1", status: "active" }, { tenantId: "t2", status: "active" }])).toBeNull();
    expect(fieldLandingPath(null, engineer)).toBeNull();
    expect(fieldLandingPath("t1", { ...engineer, scopes: [{ scopeType: "company", scopeId: null }] })).toBeNull();
    expect(fieldLandingPath("t1", { ...engineer, scopes: [{ scopeType: "project", scopeId: "p1" }, { scopeType: "project", scopeId: "p2" }] })).toBeNull();
    expect(fieldLandingPath("t1", { ...engineer, permissions: ["project.pmc.read"] })).toBeNull();
    expect(fieldLandingPath("t1", { ...engineer, member: false })).toBeNull();
  });
});

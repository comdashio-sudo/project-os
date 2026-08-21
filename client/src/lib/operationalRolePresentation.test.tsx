import { describe, expect, it } from "vitest";
import { getOperationalRoleName } from "./operationalRolePresentation";

describe("operational role presentation", () => {
  it("localizes a system-managed role in Arabic and English", () => {
    expect(getOperationalRoleName({ code: "PROJECT_MANAGER", name: "Project Manager" }, true)).toBe("مدير المشروع");
    expect(getOperationalRoleName({ code: "PROJECT_MANAGER", name: "Project Manager" }, false)).toBe("Project Manager");
  });

  it("preserves the tenant-defined name for custom roles", () => {
    expect(getOperationalRoleName({ code: "CUSTOM_COST_REVIEWER", name: "Cost reviewer" }, true)).toBe("Cost reviewer");
  });
});

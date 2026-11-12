import { describe, expect, it } from "vitest";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "./operationalRoles";

// Q-5: «QC only». The site engineer also manages quality inspections, so the QC receipt has its own permission, held by the QA/QC role alone.
const holders = operationalRoleDefinitions.filter(role => (role.permissions as readonly string[]).includes("project.qc.receive")).map(role => role.code);

describe("project.qc.receive (Q-5)", () => {
  it("is in the catalogue and only the QA/QC role holds it; the site engineer, who updates progress, does not", () => {
    expect(operationalPermissionCatalog.some(permission => permission.code === "project.qc.receive")).toBe(true);
    expect(holders).toEqual(["QA_QC_MANAGER"]);
  });
});

import { describe, expect, it } from "vitest";
import { isGeneralImportModule } from "@shared/importPermissions";
import { EXTERNAL_MODULES } from "./externalImports";

// The import log hides «Confirm import» on an external row because the server confirms it through authorizeExternalImport (plan feature, company-level HR),
// which the client cannot read. That only holds while no external module is also a general one: a module in both would get the general button and the external check.
describe("external import modules and the general importer's modules never overlap (ENG review of #157)", () => {
  it("no external module is a general import module", () => {
    expect(EXTERNAL_MODULES.length).toBeGreaterThan(0);
    expect(EXTERNAL_MODULES.filter(code => isGeneralImportModule(code))).toEqual([]);
  });
  it("the general modules are recognised and an unknown or inherited name is not", () => {
    for (const code of ["wbs", "budget", "contracts", "materials", "openingBalances", "schedule"]) expect(isGeneralImportModule(code)).toBe(true);
    for (const code of ["pmc.locations", "masterPlanMapping", "costs", "employees", "toString", "constructor", ""]) expect(isGeneralImportModule(code)).toBe(false);
  });
});

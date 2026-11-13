import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRICT_RLS_SUITES } from "./strictRlsSuites";

// G-141 (D-32): the list of database suites run without the fallback context names real files, once each, and keeps its size (a suite dropped
// from it silently is a weaker test).
describe("strict row-level-security suites list", () => {
  it("names existing database suites, each once", () => {
    expect(STRICT_RLS_SUITES.length).toBeGreaterThanOrEqual(70);
    expect(new Set(STRICT_RLS_SUITES).size).toBe(STRICT_RLS_SUITES.length);
    for (const file of STRICT_RLS_SUITES) {
      expect(file).toMatch(/\.database\.test\.ts$/);
      expect(existsSync(new URL(`../${file}`, import.meta.url)), file).toBe(true);
    }
  });
  it("includes the suites that exercise requests end to end", () => {
    for (const file of ["companyScope.database.test.ts", "importCycle.database.test.ts", "fieldEntry.database.test.ts", "pmc.import.database.test.ts"]) expect(STRICT_RLS_SUITES).toContain(file);
  });
});

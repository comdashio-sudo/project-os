import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// G-046: each of the seven PMC rules has a unit test AND an integration test, and a production path that actually
// applies it. This file ties the three together so that a rule cannot lose its evidence silently: deleting or renaming
// a unit test, a live test or the production call fails here by rule number. The table is mirrored, with the numbers
// the live tests check by hand, in docs/PMC_RULES_TRACE.md.
const read = (file: string) => readFileSync(join(__dirname, "..", file.replace(/^server\//, "")), "utf8");

const rules = [
  { rule: 1, what: "weighted unit progress with the tenant's status factors", unit: "Rule 1:", production: [["pmcService.ts", "calculateUnitProgress"]], live: [["pmc.database.test.ts", "toBe(96)"]] },
  { rule: 2, what: "project progress weighted by unit weight", unit: "Rule 2:", production: [["pmcService.ts", "calculateProjectProgress"]], live: [["pmc.database.test.ts", "toBe(48)"], ["pmc.database.test.ts", "toBe(72)"]] },
  { rule: 3, what: "completion never above 100%", unit: "Rule 3:", production: [["pmcService.ts", "calculateActivityCompletion"], ["pmcService.ts", "PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL"]], live: [["pmc.database.test.ts", "PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL"]] },
  { rule: 4, what: "a model's activity weights total exactly 100%", unit: "Rule 4:", production: [["pmcService.ts", "MODEL_WEIGHTS_NOT_100"], ["domain/pmcImport.ts", "PMC_MODEL_WEIGHTS_NOT_100"]], live: [["pmc.database.test.ts", "do not total 100"], ["pmc.import.database.test.ts", "PMC_MODEL_WEIGHTS_NOT_100"]] },
  { rule: 5, what: "no activity row without group, stage and activity", unit: "Rule 5:", production: [["domain/pmcImport.ts", "PMC_CLASSIFICATION_BLANK"]], live: [["pmc.import.database.test.ts", "PMC_CLASSIFICATION_BLANK"]] },
  { rule: 6, what: "report ranges run from the first to the last unit number", unit: "Rule 6:", production: [["domain/pmcScreens.ts", "normalizeUnitRange"]], live: [["pmc.screens.database.test.ts", "e.unitFrom, e.unitTo"]] },
  { rule: 7, what: "earned value follows PMC progress of the linked WBS items", unit: "Rule 7:", production: [["pmcEvmBridge.ts", "wbsProgressFromPmc"], ["domain/pmcEvmBridge.ts", "wbsProgressFromPmc"]], live: [["pmc.programme.database.test.ts", "evBefore: 0, evAfter: 250"]] },
] as const;

describe("every PMC rule keeps its unit test, its production path and its live test (G-046)", () => {
  it("has exactly the seven rules", () => expect(rules.map(r => r.rule)).toEqual([1, 2, 3, 4, 5, 6, 7]));
  for (const rule of rules) {
    it(`rule ${rule.rule}: ${rule.what}`, () => {
      expect(read("domain/pmc.test.ts"), `unit test for rule ${rule.rule}`).toContain(rule.unit);
      // a production path: at least one of the listed places applies the rule (rule 7 lives in the domain bridge, the others in the services)
      const applied = rule.production.filter(([file, marker]) => { try { return read(file).includes(marker); } catch { return false; } });
      expect(applied.length, `production path for rule ${rule.rule}`).toBeGreaterThan(0);
      for (const [file, marker] of rule.live) expect(read(file), `live test ${file} for rule ${rule.rule}`).toContain(marker);
    });
  }
});

import { describe, expect, it } from "vitest";
import { calculateProjectHealth } from "../../../server/domain/projectHealth";
import { indicatorBasis, indicatorBasisLine } from "./indicatorBasis";

const base = { cpi: 1, spi: 1, eac: 100, bac: 100, highRiskCount: 0, overdueActionCount: 0, overdueApprovalCount: 0, overdueRfiCount: 0, overdueNcrCount: 0, overdueHseCount: 0 };

describe("the health indicator quotes the server's own numbers", () => {
  const text = indicatorBasis.health.formula.en;
  it("deducts what the text says it deducts", () => {
    expect(calculateProjectHealth({ ...base, cpi: 0.85 }).score).toBe(75); expect(text).toContain("CPI<0.9 (25)");
    expect(calculateProjectHealth({ ...base, cpi: 0.95 }).score).toBe(90); expect(text).toContain("<1 (10)");
    expect(calculateProjectHealth({ ...base, spi: 0.85 }).score).toBe(75); expect(text).toContain("SPI<0.9 (25)");
    expect(calculateProjectHealth({ ...base, eac: 120 }).score).toBe(80); expect(text).toContain("EAC>BAC (20)");
    expect(calculateProjectHealth({ ...base, highRiskCount: 2 }).score).toBe(90); expect(calculateProjectHealth({ ...base, highRiskCount: 9 }).score).toBe(80); expect(text).toContain("5 each up to 20");
    expect(calculateProjectHealth({ ...base, overdueActionCount: 2 }).score).toBe(94); expect(calculateProjectHealth({ ...base, overdueActionCount: 9 }).score).toBe(85); expect(text).toContain("3 each up to 15");
    expect(calculateProjectHealth({ ...base, overdueApprovalCount: 1 }).score).toBe(90); expect(calculateProjectHealth({ ...base, overdueRfiCount: 1 }).score).toBe(92); expect(calculateProjectHealth({ ...base, overdueNcrCount: 1 }).score).toBe(92); expect(calculateProjectHealth({ ...base, overdueHseCount: 1 }).score).toBe(92); expect(text).toContain("(10/8/8/8)");
  });
  it("uses the thresholds the text says: green from 85, amber from 65", () => {
    expect(calculateProjectHealth({ ...base, overdueActionCount: 5 }).status).toBe("green"); // 100 - 15 = 85
    expect(calculateProjectHealth({ ...base, overdueActionCount: 5, overdueRfiCount: 1 }).status).toBe("amber"); // 77
    expect(calculateProjectHealth({ ...base, cpi: 0.85, spi: 0.85, overdueApprovalCount: 1 }).status).toBe("red"); // 40
    expect(text).toContain("Green ≥85"); expect(text).toContain("amber ≥65");
  });
  it("has an Arabic sentence with the same numbers", () => {
    for (const number of ["85", "65", "25", "20"]) expect(indicatorBasis.health.formula.ar).toContain(number);
  });
});

describe("indicatorBasisLine", () => {
  it("puts formula, source and date in one line, in both languages", () => {
    const en = indicatorBasisLine("evm", false, new Date("2026-09-30T00:00:00.000Z"));
    expect(en).toBe("Formula: CPI = EV ÷ AC, SPI = EV ÷ PV, EAC by the method saved with the snapshot (default BAC ÷ CPI). · Source: latest saved EVM snapshot · as of Sep 30, 2026");
    const arDated = indicatorBasisLine("evm", true, new Date("2026-09-30T00:00:00.000Z"));
    // Western digits and the Gregorian year, never Arabic-Indic digits or a Hijri date
    expect(arDated).toContain("2026"); expect(arDated).not.toMatch(/[٠-٩]|هـ/);
    const ar = indicatorBasisLine("remaining", true, null);
    expect(ar.startsWith("المعادلة: ")).toBe(true); expect(ar).toContain("المصدر: "); expect(ar.endsWith("بتاريخ العرض")).toBe(true);
  });
  it("says so when a snapshot-based indicator has no snapshot", () => {
    expect(indicatorBasisLine("health", false, null).endsWith("no snapshot saved yet")).toBe(true);
    expect(indicatorBasisLine("health", true, undefined).endsWith("لا لقطة محفوظة بعد")).toBe(true);
  });
});

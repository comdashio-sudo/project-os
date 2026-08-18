import { describe, expect, it } from "vitest";
import { calculateProjectHealth } from "./projectHealth";

const healthy = { cpi: 1.05, spi: 1.01, eac: 950, bac: 1000, highRiskCount: 0, overdueActionCount: 0, overdueApprovalCount: 0, overdueRfiCount: 0, overdueNcrCount: 0 };

describe("calculateProjectHealth", () => {
  it("returns a high-confidence green health result for controlled project data", () => {
    expect(calculateProjectHealth(healthy)).toMatchObject({ score: 100, status: "green", confidence: "high", exceptions: [] });
  });

  it("raises cost and schedule exceptions with an actionable red status", () => {
    const result = calculateProjectHealth({ ...healthy, cpi: 0.75, spi: 0.8, eac: 1300, highRiskCount: 3, overdueActionCount: 2 });
    expect(result.status).toBe("red");
    expect(result.exceptions.map(item => item.code)).toEqual(expect.arrayContaining(["CPI_CRITICAL", "SPI_CRITICAL", "EAC_OVER_BAC", "HIGH_RISK", "OVERDUE_ACTION"]));
  });

  it("reports low confidence where control measures are unavailable", () => {
    expect(calculateProjectHealth({ ...healthy, cpi: null, spi: null, eac: null, bac: null }).confidence).toBe("low");
  });

  it("records an overdue HSE observation as a governed health exception", () => {
    const result = calculateProjectHealth({ ...healthy, overdueHseCount: 1 });
    expect(result).toMatchObject({ score: 92, status: "green" });
    expect(result.exceptions.map(item => item.code)).toContain("OVERDUE_HSE");
  });

  it("rejects invalid exception counts", () => {
    expect(() => calculateProjectHealth({ ...healthy, highRiskCount: -1 })).toThrow(/highRiskCount/);
    expect(() => calculateProjectHealth({ ...healthy, overdueActionCount: 1.5 })).toThrow(/overdueActionCount/);
  });
});

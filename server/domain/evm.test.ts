import { describe, expect, it } from "vitest";
import { calculateEvm } from "./evm";

describe("calculateEvm", () => {
  it("calculates PV, EV, AC variances and BAC/CPI forecast", () => {
    const result = calculateEvm({ pv: 500, ev: 450, ac: 600, bac: 1000, eacMethod: "bac_over_cpi" });
    expect(result).toMatchObject({ cv: -150, sv: -50, cpi: 0.75, spi: 0.9, eac: 1333.3333, etc: 733.3333, vac: -333.3333, tcpi: 1.375 });
  });

  it("calculates AC plus remaining work EAC", () => {
    const result = calculateEvm({ pv: 400, ev: 300, ac: 350, bac: 1000, eacMethod: "ac_plus_remaining" });
    expect(result.eac).toBe(1050);
    expect(result.etc).toBe(700);
    expect(result.vac).toBe(-50);
  });

  it("calculates the combined CPI and SPI EAC", () => {
    const result = calculateEvm({ pv: 500, ev: 400, ac: 500, bac: 1000, eacMethod: "ac_plus_remaining_over_cpi_spi" });
    expect(result.eac).toBe(1437.5);
    expect(result.etc).toBe(937.5);
  });

  it("accepts an approved manual EAC", () => {
    const result = calculateEvm({ pv: 200, ev: 250, ac: 300, bac: 1000, eacMethod: "manual", manualEac: 1125 });
    expect(result.eac).toBe(1125);
    expect(result.vac).toBe(-125);
  });

  it("returns null ratios instead of dividing by zero when there is no earned cost or plan", () => {
    const result = calculateEvm({ pv: 0, ev: 0, ac: 0, bac: 1000, eacMethod: "ac_plus_remaining" });
    expect(result.cpi).toBeNull();
    expect(result.spi).toBeNull();
    expect(result.tcpi).toBe(1);
  });

  it("rejects invalid negative values and impossible earned value", () => {
    expect(() => calculateEvm({ pv: -1, ev: 0, ac: 0, bac: 1, eacMethod: "ac_plus_remaining" })).toThrow(/PV/);
    expect(() => calculateEvm({ pv: 1, ev: 101, ac: 1, bac: 100, eacMethod: "ac_plus_remaining" })).toThrow(/EV cannot exceed BAC/);
  });

  it("rejects an undefined manual forecast and zero efficiency forecast", () => {
    expect(() => calculateEvm({ pv: 100, ev: 0, ac: 100, bac: 1000, eacMethod: "manual" })).toThrow(/Manual EAC/);
    expect(() => calculateEvm({ pv: 100, ev: 0, ac: 100, bac: 1000, eacMethod: "bac_over_cpi" })).toThrow(/CPI/);
  });
});

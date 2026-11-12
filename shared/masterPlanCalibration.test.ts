// Synthetic points only.
import { describe, expect, it } from "vitest";
import { calibrationProblem, measureMeters, metersPerUnit, parseBackground, parseCalibration } from "./masterPlanCalibration";

describe("two-point calibration (Q-7)", () => {
  // a 3-4-5 triangle: 500 drawing units between the two points are 125 m on the ground
  const calibration = { a: { x: 100, y: 200 }, b: { x: 400, y: 600 }, meters: 125 };

  it("measures a known length on the same drawing within 1% (here exactly)", () => {
    expect(metersPerUnit(calibration)).toBeCloseTo(0.25, 12);
    const known = 37.5; // a 150-unit edge drawn at 0.25 m per unit
    const measured = measureMeters(calibration, { x: 10, y: 10 }, { x: 160, y: 10 });
    expect(Math.abs(measured - known) / known).toBeLessThan(0.01);
    expect(measured).toBeCloseTo(known, 9);
  });

  it("stays within 1% when each calibration click lands half a unit off on a 1,000-unit span", () => {
    const off = { a: { x: 0.5, y: -0.5 }, b: { x: 1000.5, y: 0.5 }, meters: 250 };
    const measured = measureMeters(off, { x: 0, y: 0 }, { x: 400, y: 0 });
    expect(Math.abs(measured - 100) / 100).toBeLessThan(0.01);
  });

  it("refuses coinciding points, a distance that is not positive or too long, and non-numeric points", () => {
    expect(calibrationProblem(calibration)).toBeNull();
    expect(calibrationProblem({ ...calibration, b: { ...calibration.a } })).toBe("SAME_POINTS");
    expect(calibrationProblem({ ...calibration, meters: 0 })).toBe("BAD_DISTANCE");
    expect(calibrationProblem({ ...calibration, meters: -1 })).toBe("BAD_DISTANCE");
    expect(calibrationProblem({ ...calibration, meters: 100_001 })).toBe("BAD_DISTANCE");
    expect(calibrationProblem({ ...calibration, meters: Number.NaN })).toBe("BAD_DISTANCE");
    expect(calibrationProblem({ ...calibration, a: { x: Number.POSITIVE_INFINITY, y: 0 } })).toBe("BAD_POINT");
  });

  it("reads stored values back and treats anything malformed as not set", () => {
    expect(parseCalibration(JSON.stringify(calibration))).toEqual(calibration);
    expect(parseCalibration(null)).toBeNull();
    expect(parseCalibration("{")).toBeNull();
    expect(parseCalibration(JSON.stringify({ ...calibration, meters: 0 }))).toBeNull();
    expect(parseBackground(JSON.stringify({ width: 1200, height: 800, page: 2 }))).toEqual({ width: 1200, height: 800, page: 2 });
    expect(parseBackground(JSON.stringify({ width: 0, height: 800, page: 1 }))).toBeNull();
    expect(parseBackground("nope")).toBeNull();
  });
});

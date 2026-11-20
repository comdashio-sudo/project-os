import { describe, expect, it } from "vitest";
import { permitState, safetyRates } from "./safetyIndicators";

describe("Q-28: safety rates", () => {
  it("LTIFR and TRIR by hand: 1 lost-time and 1 medical over 500,000 man-hours → LTIFR 2, TRIR 0.8; near misses and first aid count in neither", () => {
    const rates = safetyRates({ manHours: 500_000, incidents: [{ kind: "lost_time" }, { kind: "medical_treatment" }, { kind: "near_miss" }, { kind: "first_aid" }, { kind: "property_damage" }] });
    expect(rates).toMatchObject({ lostTime: 1, recordable: 2, ltifr: 2, trir: 0.8 });
    expect(rates.byKind).toMatchObject({ lost_time: 1, medical_treatment: 1, near_miss: 1, first_aid: 1, property_damage: 1, fatality: 0 });
  });
  it("a fatality is both lost-time and recordable; restricted work is recordable only", () => {
    expect(safetyRates({ manHours: 1_000_000, incidents: [{ kind: "fatality" }, { kind: "restricted_work" }] })).toMatchObject({ lostTime: 1, recordable: 2, ltifr: 1, trir: 0.4 });
  });
  it("NEGATIVE: no man-hours → the rates are null, never 0 nor infinite", () => {
    expect(safetyRates({ manHours: 0, incidents: [{ kind: "lost_time" }] })).toMatchObject({ ltifr: null, trir: null, lostTime: 1 });
    expect(safetyRates({ manHours: Number.NaN, incidents: [] })).toMatchObject({ ltifr: null, trir: null, manHours: 0 });
  });
  it("a permit is expired only while active after its end; not yet started before its start; closed and cancelled stay so", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(permitState({ status: "active", validFrom: "2026-11-20T06:00:00Z", validTo: "2026-11-20T09:00:00Z" }, now)).toBe("expired");
    expect(permitState({ status: "active", validFrom: "2026-11-20T06:00:00Z", validTo: "2026-11-20T18:00:00Z" }, now)).toBe("active");
    expect(permitState({ status: "active", validFrom: "2026-11-21T06:00:00Z", validTo: "2026-11-21T18:00:00Z" }, now)).toBe("not_started");
    expect(permitState({ status: "closed", validFrom: "2026-11-01T06:00:00Z", validTo: "2026-11-01T09:00:00Z" }, now)).toBe("closed");
  });
});

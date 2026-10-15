import { describe, expect, it } from "vitest";
import { activitiesMatrix, approvals, filterDataset, freshnessOf, inspections, latestUpdates, pendingAtVerifier, periodReport, stagesView, zones, type PmcDataset } from "./pmcScreens";

// The dataset and every expected number below are worked by hand in
// docs/PMC_PHASE_C_HAND_CHECKS.md. Four units of one model (WALLS 60, PAINT 40).
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const unit = (n: number, zoneCode: string, blockCode: string) => ({ id: `u${n}`, number: n, modelCode: "A", weight: 1, zoneCode, blockCode });
const ds: PmcDataset = {
  now: new Date("2026-10-15T12:00:00.000Z"),
  factors: { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 1 },
  units: [unit(1, "Z1", "B1"), unit(2, "Z1", "B1"), unit(3, "Z2", "B2"), unit(4, "Z2", "B2")],
  definitions: [
    { id: "d1", modelCode: "A", code: "WALLS", name: "Walls", weightPercent: 60, groupCode: "CIV", groupName: "Civil", stageCode: "INT", stageName: "Internal" },
    { id: "d2", modelCode: "A", code: "PAINT", name: "Paint", weightPercent: 40, groupCode: "FIN", groupName: "Finishing", stageCode: "EXT", stageName: "External" },
  ],
  cells: [
    { id: "c1", unitId: "u1", definitionId: "d1", status: "COMPLETE", verificationStatusId: "V2", assignedUserId: 10, lastChangedAt: at("2026-10-13") },
    { id: "c2", unitId: "u2", definitionId: "d1", status: "COMPLETE", verificationStatusId: "V1", assignedUserId: 10, lastChangedAt: at("2026-10-13") },
    { id: "c3", unitId: "u3", definitionId: "d1", status: "COMPLETE", verificationStatusId: "V1", assignedUserId: 11, lastChangedAt: new Date("2026-10-15T08:00:00.000Z") },
    { id: "c4", unitId: "u1", definitionId: "d2", status: "COMPLETE", verificationStatusId: "V2", assignedUserId: 11, lastChangedAt: at("2026-10-05") },
    { id: "c5", unitId: "u4", definitionId: "d2", status: "COMPLETE", verificationStatusId: null, assignedUserId: 10, lastChangedAt: at("2026-09-20") },
  ],
  history: [
    { unitId: "u1", definitionId: "d1", from: null, to: "COMPLETE", userId: 10, at: at("2026-10-13") },
    { unitId: "u2", definitionId: "d1", from: null, to: "COMPLETE", userId: 10, at: at("2026-10-13") },
    { unitId: "u3", definitionId: "d1", from: null, to: "IN_PROGRESS", userId: 11, at: at("2026-10-14") },
    { unitId: "u3", definitionId: "d1", from: "IN_PROGRESS", to: "COMPLETE", userId: 11, at: at("2026-10-15") },
    { unitId: "u1", definitionId: "d2", from: null, to: "COMPLETE", userId: 11, at: at("2026-10-05") },
    { unitId: "u4", definitionId: "d2", from: null, to: "COMPLETE", userId: 10, at: at("2026-09-20") },
  ],
  verification: [{ id: "V1", code: "PENDING", label: "Verifier pending", pending: true, sortOrder: 1 }, { id: "V2", code: "PAID", label: "Paid", pending: false, sortOrder: 2 }],
  requests: [
    { id: "r1", code: "IR-1", definitionId: "d1", contractor: "C1", consultant: "X", response: "A", requestedAt: at("2026-10-10"), unitNumbers: [1, 2], steps: [] },
    { id: "r2", code: "IR-2", definitionId: "d1", contractor: "C1", consultant: "X", response: "B", requestedAt: at("2026-10-11"), unitNumbers: [3], steps: [] },
    { id: "r3", code: "IR-3", definitionId: "d2", contractor: "C2", consultant: "Y", response: null, requestedAt: at("2026-10-12"), unitNumbers: [1], steps: [{ code: "CONFIGURATIONS", status: "complete", holder: null, order: 1 }, { code: "MANAGER_APPROVAL", status: "in_progress", holder: "Manager", order: 2 }] },
    { id: "r4", code: "IR-4", definitionId: "d2", contractor: "C2", consultant: "X", response: null, requestedAt: at("2026-10-01"), unitNumbers: [4], steps: [{ code: "WAITING_CONSULTANT", status: "in_progress", holder: "Consultant X", order: 4 }] },
  ],
  baselines: new Map([["d1", [{ at: at("2026-09-01"), percent: 50 }, { at: at("2026-10-01"), percent: 80 }, { at: at("2026-11-01"), percent: 100 }]], ["d2", [{ at: at("2026-10-01"), percent: 50 }]]]),
  people: new Map([[10, "Eng One"], [11, "Eng Two"]]),
  sources: [{ source: "cells", lastAt: new Date("2026-10-15T08:00:00.000Z") }, { source: "baseline", lastAt: null }],
};

describe("PMC screens, checked against the hand calculations", () => {
  it("screen 1: per engineer, updates, active days, unit range, percentage added and its split by group", () => {
    const result = latestUpdates(ds);
    expect(result.engineers.map(e => e.name)).toEqual(["Eng One", "Eng Two"]); // 3 updates each, ordered by name
    const one = result.engineers[0];
    expect(one).toMatchObject({ updates: 3, activeDays: 2, unitFrom: 1, unitTo: 4, addedProjectPercent: 40 });
    expect(one.byGroup).toEqual([{ groupCode: "CIV", groupName: "Civil", addedProjectPercent: 30, updates: 2 }, { groupCode: "FIN", groupName: "Finishing", addedProjectPercent: 10, updates: 1 }]);
    expect(result.engineers[1]).toMatchObject({ updates: 3, unitFrom: 1, unitTo: 3, addedProjectPercent: 25 });
    // 40 + 25 = 65 = the project's current progress (260 weight points over 4 units).
    expect(result.totals).toEqual({ updates: 6, addedProjectPercent: 65 });
  });

  it("screens 7 and 8: the same history by week and by month", () => {
    const weekly = periodReport(ds, "week").periods;
    expect(weekly.map(p => [p.from, p.updates, p.addedProjectPercent])).toEqual([["2026-10-12", 4, 45], ["2026-10-05", 1, 10], ["2026-09-14", 1, 10]]);
    expect(weekly[0].byStatus).toEqual([{ status: "IN_PROGRESS", updates: 1 }, { status: "COMPLETE", updates: 3 }]);
    expect(weekly[0].byGroup).toEqual([{ groupCode: "CIV", addedProjectPercent: 45 }]);
    const monthly = periodReport(ds, "month").periods;
    expect(monthly.map(p => [p.from, p.updates, p.addedProjectPercent])).toEqual([["2026-10-01", 5, 55], ["2026-09-01", 1, 10]]);
  });

  it("screen 2: replies per consultant, per day and per activity", () => {
    const result = approvals(ds);
    expect(result.byConsultant).toEqual([{ key: "X", A: 1, B: 1, C: 0, UR: 0, pending: 1, total: 3 }, { key: "Y", A: 0, B: 0, C: 0, UR: 0, pending: 1, total: 1 }]);
    expect(result.byDay.map(d => [d.key, d.total, d.pending])).toEqual([["2026-10-01", 1, 1], ["2026-10-10", 1, 0], ["2026-10-11", 1, 0], ["2026-10-12", 1, 1]]);
    expect(result.byActivity).toEqual([{ key: "PAINT", A: 0, B: 0, C: 0, UR: 0, pending: 2, total: 2 }, { key: "WALLS", A: 1, B: 1, C: 0, UR: 0, pending: 0, total: 2 }]);
    expect(result.requests[0].code).toBe("IR-3"); // newest first
    expect(filterDataset(ds, { consultant: "Y" }).requests.map(r => r.code)).toEqual(["IR-3"]);
    expect(filterDataset(ds, { contractor: "C1" }).requests.map(r => r.code)).toEqual(["IR-1", "IR-2"]);
  });

  it("screen 4: where each request stands, who holds it, and the most stalled activity", () => {
    const result = inspections(ds);
    expect(result.byStage).toEqual([{ stage: "MANAGER_APPROVAL", count: 1, percent: 25 }, { stage: "WAITING_CONSULTANT", count: 1, percent: 25 }, { stage: "ANSWERED", count: 2, percent: 50 }]);
    expect(result.heldBy).toEqual([{ holder: "Consultant X", count: 1 }, { holder: "Manager", count: 1 }]);
    expect(result.stalledActivities).toEqual([{ activityCode: "PAINT", activityName: "Paint", open: 2, oldestDays: 14 }]);
  });

  it("screen 5: group and activity against verification status, by count and weight", () => {
    const result = activitiesMatrix(ds);
    expect(result.columns.map(c => c.code)).toEqual(["PENDING", "PAID", "—"]);
    const civil = result.groups.find(g => g.groupCode === "CIV")!;
    const walls = civil.activities[0];
    expect(walls.total).toBe(4);
    expect(walls.cells.map(c => [c.count, c.weightPoints, c.sharePercent])).toEqual([[2, 120, 50], [1, 60, 25], [1, 60, 25]]);
    const paint = result.groups.find(g => g.groupCode === "FIN")!.activities[0];
    expect(paint.cells.map(c => [c.count, c.weightPoints, c.sharePercent])).toEqual([[0, 0, 0], [1, 40, 25], [3, 120, 75]]);
  });

  it("screen 6: zone and stage by engineer, with completion", () => {
    const rows = zones(ds).rows;
    expect(rows.find(r => r.zoneCode === "Z1" && r.stageCode === "INT" && r.engineer === "Eng One")).toMatchObject({ cells: 2, completeCells: 2, weightComplete: 120, completionPercent: 100 });
    expect(rows.find(r => r.zoneCode === "Z1" && r.stageCode === "EXT" && r.engineer === null)).toMatchObject({ cells: 1, completeCells: 0, completionPercent: 0 });
    expect(rows.find(r => r.zoneCode === "Z2" && r.stageCode === "EXT" && r.engineer === "Eng One")).toMatchObject({ cells: 1, completeCells: 1, weightComplete: 40 });
    expect(rows.reduce((sum, r) => sum + r.cells, 0)).toBe(8); // every unit x activity is somewhere
  });

  it("screen 9: cells waiting at the verifier, oldest first, with their age in days", () => {
    const result = pendingAtVerifier(ds);
    expect(result.total).toBe(2);
    expect(result.rows.map(r => [r.unitNumber, r.activityCode, r.ageDays])).toEqual([[2, "WALLS", 2], [3, "WALLS", 0]]);
    expect(result.buckets).toEqual([{ label: "0-7", count: 2 }, { label: "8-14", count: 0 }, { label: "15-30", count: 0 }, { label: "31+", count: 0 }]);
  });

  it("screen 11: stage against status, and the activity that is late against its baseline", () => {
    const result = stagesView(ds);
    const internal = result.stages.find(s => s.stageCode === "INT")!;
    expect(internal.byStatus.filter(s => s.count).map(s => [s.status, s.count, s.weightPoints, s.percent])).toEqual([["NOT_STARTED", 1, 60, 25], ["COMPLETE", 3, 180, 75]]);
    expect(internal.lateActivities).toEqual([{ activityCode: "WALLS", actualPercent: 75, plannedPercent: 80 }]);
    const external = result.stages.find(s => s.stageCode === "EXT")!;
    expect(external.byStatus.filter(s => s.count).map(s => [s.status, s.count, s.percent])).toEqual([["NOT_STARTED", 2, 50], ["COMPLETE", 2, 50]]);
    expect(external.lateActivities).toEqual([]); // actual 50 against planned 50: on time
  });

  it("filters narrow every screen to the zone, and the percentages are of that scope", () => {
    const z2 = filterDataset(ds, { zone: "Z2" });
    expect(z2.units.map(u => u.number)).toEqual([3, 4]);
    // Unit weights now total 2, so completing WALLS in unit 3 adds 60 / 2 = 30 points of this scope.
    expect(latestUpdates(z2).engineers.find(e => e.name === "Eng Two")).toMatchObject({ updates: 2, addedProjectPercent: 30 });
    expect(periodReport(filterDataset(ds, { since: at("2026-10-01") }), "month").periods.map(p => p.from)).toEqual(["2026-10-01"]);
    expect(activitiesMatrix(filterDataset(ds, { group: "FIN" })).groups.map(g => g.groupCode)).toEqual(["FIN"]);
  });

  it("freshness lists each source with its age, and 'never' as null", () => {
    expect(freshnessOf(ds)).toEqual([{ source: "cells", lastAt: new Date("2026-10-15T08:00:00.000Z"), ageDays: 0 }, { source: "baseline", lastAt: null, ageDays: null }]);
  });
});

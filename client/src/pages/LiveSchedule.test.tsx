// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-23 (second batch): the live schedule screen shows only what schedule.live returned. Synthetic data only.
const h = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string }>; value: string; onValueChange: (value: string) => void }) => (
  <select id={id} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
// Q-61 (3): the stage mapping has its own test (client/src/components/ScheduleStageMapping.test.tsx)
vi.mock("@/components/ScheduleStageMapping", () => ({ ScheduleStageMapping: () => null }));
vi.mock("@/components/VillaPlannedCurve", () => ({ VillaPlannedCurve: () => null }));
vi.mock("@/components/ScheduleBaselineAdopt", () => ({ ScheduleBaselineAdopt: () => null }));
vi.mock("@/lib/trpc", () => ({ trpc: { schedule: { live: { useQuery: () => ({ data: h.data, isLoading: false, isError: false, error: null, refetch: vi.fn() }) }, compare: { useQuery: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }) } } } }));

import LiveSchedule from "./LiveSchedule";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const row = (code: string, extra: Record<string, unknown>) => ({ id: `id-${code}`, code, name: `Activity ${code}`, status: "not_started", percentComplete: 0, totalFloatHours: 16, baselineStart: d("2026-11-01"), baselineFinish: d("2026-11-10"), forecastStart: d("2026-11-01"), forecastFinish: d("2026-11-10"), actualStart: null, actualFinish: null, startVarianceDays: 0, finishVarianceDays: 0, critical: false, inBaseline: true, ...extra });
const live = {
  dataDate: d("2026-11-19"), lookAheadDays: 14,
  baseline: { id: "b", source: "p6_import", dataDate: d("2026-09-30"), isBaseline: true, activityCount: 3, createdAt: d("2026-10-01") },
  latest: { id: "u", source: "p6_update", dataDate: d("2026-11-19"), isBaseline: false, activityCount: 3, createdAt: d("2026-11-19") },
  snapshots: [{}, {}],
  summary: { activities: 3, critical: 1, plannedToStart: 3, started: 1, plannedToFinish: 2, finished: 0, lateFinishing: 1, lookAhead: 1 },
  rows: [row("A1", { critical: true, totalFloatHours: 0, finishVarianceDays: 4, forecastFinish: d("2026-11-14") }), row("A2", {}), row("A3", { forecastStart: d("2026-11-24"), forecastFinish: d("2026-12-05") })],
  lookAhead: ["id-A3"],
};
afterEach(() => cleanup());

describe("LiveSchedule (Q-23)", () => {
  it("shows the server's summary and every activity; «Critical» narrows to the critical one and «Next two weeks» to the look-ahead", () => {
    h.data = live;
    render(<LiveSchedule />);
    expect(document.querySelectorAll("[data-activity]").length).toBe(3);
    expect(screen.getByText("+4")).toBeTruthy(); // finish variance as the server returned it, signed
    fireEvent.change(document.querySelector("select")!, { target: { value: "critical" } });
    expect(Array.from(document.querySelectorAll("[data-activity]")).map(node => node.getAttribute("data-activity"))).toEqual(["A1"]);
    fireEvent.change(document.querySelector("select")!, { target: { value: "lookAhead" } });
    expect(Array.from(document.querySelectorAll("[data-activity]")).map(node => node.getAttribute("data-activity"))).toEqual(["A3"]);
  });

  it("with no baseline the planned counts read «Not available», never 0, and the page says how a baseline is made", () => {
    h.data = { ...live, baseline: null, latest: null, snapshots: [], rows: [], lookAhead: [], summary: { activities: 0, critical: null, plannedToStart: null, started: 0, plannedToFinish: null, finished: 0, lateFinishing: null, lookAhead: 0 } };
    render(<LiveSchedule />);
    expect(document.querySelector("[data-no-baseline]")).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBe(4);
    expect(screen.getByText("No activity matches.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("«Export CSV» saves exactly the rows shown", async () => {
    h.data = live;
    const blobs: Blob[] = [];
    Object.assign(URL, { createObjectURL: (blob: Blob) => { blobs.push(blob); return "blob:x"; }, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<LiveSchedule />);
    fireEvent.change(document.querySelector("select")!, { target: { value: "critical" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(click).toHaveBeenCalled();
    const lines = (await blobs[0].text()).replace(/^﻿/, "").split("\n");
    expect(lines.length).toBe(2);
    expect(lines[1].startsWith("A1,Activity A1,2026-11-01,2026-11-10,2026-11-01,2026-11-14,0,4,0,1")).toBe(true);
    click.mockRestore();
  });
});

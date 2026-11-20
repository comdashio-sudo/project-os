// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-23: two schedule updates compared. Synthetic snapshots and activities only.
const h = vi.hoisted(() => ({ calls: [] as Array<{ input: unknown; enabled: boolean }>, data: undefined as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false }) }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string }>; value: string; onValueChange: (value: string) => void }) => (
  <select id={id} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
vi.mock("@/lib/trpc", () => ({ trpc: { schedule: { compare: { useQuery: (input: unknown, options: { enabled: boolean }) => { h.calls.push({ input, enabled: options.enabled }); return { data: options.enabled ? h.data : undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() }; } } } } }));

import { ScheduleCompare } from "./ScheduleCompare";

const snapshots = [
  { id: "s3", source: "p6_update", dataDate: "2026-11-15", createdAt: "2026-11-15T08:00:00Z" },
  { id: "s2", source: "p6_update", dataDate: "2026-11-08", createdAt: "2026-11-08T08:00:00Z" },
  { id: "s1", source: "p6_import", dataDate: "2026-11-01", createdAt: "2026-11-01T08:00:00Z" },
];
const summary = { changed: 2, added: 0, removed: 0, started: 1, finished: 0, finishLater: 1, finishEarlier: 0, becameCritical: 1, noLongerCritical: 0 };
const change = (code: string, kinds: string[], moved: number | null) => ({ activityId: code, code, kinds, from: { status: "not_started", plannedFinish: "2026-12-01", actualStart: null, actualFinish: null, totalFloatHours: 8 }, to: { status: "in_progress", plannedFinish: "2026-12-04", actualStart: "2026-11-10", actualFinish: null, totalFloatHours: 0 }, finishMovedDays: moved });
afterEach(() => { cleanup(); h.calls = []; h.data = undefined; });

describe("ScheduleCompare (Q-23)", () => {
  it("POSITIVE: compares the update before the latest with the latest by default, and shows what the server says changed", () => {
    h.data = { summary, changes: [change("A-100", ["started", "finish_moved", "became_critical"], 3), change("A-200", ["start_moved"], null)] };
    render(<ScheduleCompare tenantId="t" projectId="p" snapshots={snapshots} sourceLabel={source => source} />);
    expect(h.calls.at(-1)).toEqual({ input: { tenantId: "t", projectId: "p", fromSnapshotId: "s2", toSnapshotId: "s3" }, enabled: true });
    expect(document.querySelector("[data-compare-summary]")!.textContent).toContain("Became critical: 1");
    const row = document.querySelector('[data-change="A-100"]')!;
    expect(row.textContent).toContain("Finish moved");
    expect(row.textContent).toContain("+3");
    expect(document.querySelector('[data-change="A-200"]')!.textContent).toContain("—");
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "s1" } });
    expect(h.calls.at(-1)?.input).toMatchObject({ fromSnapshotId: "s1", toSnapshotId: "s3" });
  });

  it("NEGATIVE: the same snapshot on both sides is not sent; fewer than two snapshots draws nothing; no change says so", () => {
    render(<ScheduleCompare tenantId="t" projectId="p" snapshots={snapshots} sourceLabel={source => source} />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "s3" } });
    expect(h.calls.at(-1)?.enabled).toBe(false);
    expect(document.querySelector("[data-compare-same]")).toBeTruthy();
    cleanup();
    h.data = { summary: { ...summary, changed: 0, started: 0, finishLater: 0, becameCritical: 0 }, changes: [] };
    render(<ScheduleCompare tenantId="t" projectId="p" snapshots={snapshots} sourceLabel={source => source} />);
    expect(screen.getByText("Nothing changed between the two updates.")).toBeTruthy();
    cleanup();
    const { container } = render(<ScheduleCompare tenantId="t" projectId="p" snapshots={snapshots.slice(0, 1)} sourceLabel={source => source} />);
    expect(container.innerHTML).toBe("");
  });
});

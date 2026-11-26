// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-61 (4): the planned curve section shows only what schedule.plannedCurve returned. Synthetic data only.
const h = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown, can: new Set<string>() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ useCan: (permission: string) => h.can.has(permission) }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ options, value, onValueChange, "aria-label": label }: { options: Array<{ value: string; label: string }>; value: string; onValueChange: (value: string) => void; "aria-label"?: string }) => (
  <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
vi.mock("@/lib/trpc", () => ({ trpc: { schedule: { plannedCurve: { useQuery: (_: unknown, options: { enabled: boolean }) => ({ data: options.enabled && !h.error ? h.data : undefined, error: options.enabled ? h.error : null, refetch: vi.fn() }) } } } }));

import { VillaPlannedCurve } from "./VillaPlannedCurve";

const ready = {
  ready: true, readiness: { ready: true, unlinked: [], stale: [], stagesWithoutGroup: [] }, baseline: { id: "b", dataDate: null, createdAt: new Date() }, asOf: new Date(),
  months: ["2026-01", "2026-02"], project: [{ month: "2026-01", planned: 15.5 }, { month: "2026-02", planned: 49 }],
  blocks: [{ key: "25", curve: [{ month: "2026-01", planned: 31 }, { month: "2026-02", planned: 70 }] }], models: [{ key: "C", curve: [] }],
  projectNow: 10, projectActual: 1.25,
  villas: [], behind: [{ unitNumber: 602, blockCode: "25", modelCode: "C", plannedNow: 20, actual: 0, gap: -20 }],
  gaps: [{ unitNumber: 640, groupCodes: ["W3"] }], activitiesWithoutDates: 0, villasWithoutActivities: [650],
};
afterEach(() => { cleanup(); h.error = null; });

describe("VillaPlannedCurve (Q-61 (4))", () => {
  it("hidden without project.pmc.read", () => {
    h.data = ready; h.can = new Set();
    render(<VillaPlannedCurve tenantId="t" projectId="p" />);
    expect(document.querySelector("[data-planned-curve]")).toBeNull();
  });

  it("shows today's planned and actual, the villas behind plan, the villas with a gap and those without activities; the scope picks a block", () => {
    h.data = ready; h.can = new Set(["project.pmc.read"]);
    render(<VillaPlannedCurve tenantId="t" projectId="p" />);
    expect(document.querySelector('[data-metric="planned"]')!.textContent).toContain("10.0%");
    expect(document.querySelector('[data-metric="actual"]')!.textContent).toContain("1.3%");
    expect(document.querySelector('[data-metric="behind"]')!.textContent).toContain("1");
    expect(document.querySelector('[data-behind="602"]')!.textContent).toContain("-20.0");
    expect(document.querySelector("[data-curve-gaps]")!.textContent).toContain("640: W3");
    expect(screen.getByText(/650/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "block:25" } });
    expect((screen.getByLabelText("Show") as HTMLSelectElement).value).toBe("block:25");
  });

  it("NEGATIVE: not ready — the reason by name (no baseline; the weighted groups not linked); no actual yet reads «No site record yet», never 0", () => {
    h.can = new Set(["project.pmc.read"]);
    h.data = { ready: false, reason: "LINKS_INCOMPLETE", readiness: { ready: false, unlinked: ["W3", "W5"], stale: [], stagesWithoutGroup: [] } };
    const { unmount } = render(<VillaPlannedCurve tenantId="t" projectId="p" />);
    expect(document.querySelector("[data-planned-curve]")!.getAttribute("data-planned-curve-reason")).toBe("LINKS_INCOMPLETE");
    expect(screen.getByText("W3, W5")).toBeTruthy();
    unmount();
    h.data = { ready: false, reason: "NO_BASELINE", readiness: { ready: false, unlinked: [], stale: [], stagesWithoutGroup: [] } };
    const second = render(<VillaPlannedCurve tenantId="t" projectId="p" />);
    expect(screen.getByText(/No baseline yet/)).toBeTruthy();
    second.unmount();
    h.data = { ...ready, projectActual: null, behind: [] };
    render(<VillaPlannedCurve tenantId="t" projectId="p" />);
    expect(document.querySelector('[data-metric="actual"]')!.textContent).toContain("No site record yet");
  });

  it("NEGATIVE: a failed read is said", () => {
    h.can = new Set(["project.pmc.read"]); h.error = { message: "boom" };
    render(<VillaPlannedCurve tenantId="t" projectId="p" />);
    expect(screen.getByRole("alert").textContent).toMatch(/Could not load/);
  });
});

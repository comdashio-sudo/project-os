// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-14 (a): the stalled-units screen. Synthetic data only.
const h = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useCan: () => true }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
const rows = [
  { unitId: "u1", villa: "1", blockCode: "B1", modelCode: "A", lastMovedOn: "2026-10-15", workingDays: 20, state: "long", lastActivity: { code: "WALL", name: "Walls" }, nextActivity: { code: "PAINT", name: "Paint" } },
  { unitId: "u2", villa: "2", blockCode: "B2", modelCode: "A", lastMovedOn: "2026-11-05", workingDays: 5, state: "stalled", lastActivity: { code: "FOOT", name: "Footings" }, nextActivity: { code: "WALL", name: "Walls" } },
  { unitId: "u3", villa: "3", blockCode: "B2", modelCode: "B", lastMovedOn: "2026-11-11", workingDays: 1, state: "active", lastActivity: { code: "FOOT", name: "Footings" }, nextActivity: { code: "WALL", name: "Walls" } },
];
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: {
  stalledUnits: { useQuery: () => ({ data: { threshold: 3, longDays: 14, counts: { stalled: 1, long: 1, active: 1 }, rows }, isError: false, error: null, refetch: vi.fn() }) },
  setStallThreshold: { useMutation: () => ({ mutate: h.save, isPending: false, error: null, isSuccess: false }) },
} } }));

import StalledUnits from "./StalledUnits";

beforeEach(() => h.save.mockReset());
afterEach(() => cleanup());

describe("StalledUnits (Q-14 a)", () => {
  it("lists the stalled villas by working days with last and next activity, each opening its card; the active ones are hidden until asked for", () => {
    render(<StalledUnits />);
    expect(document.querySelector("[data-stall-counts]")!.textContent).toContain("Long stalled: 1");
    const items = Array.from(document.querySelectorAll("[data-stall-rows] a"));
    expect(items.map(item => item.getAttribute("href"))).toEqual(["/m/t/p/unit/1", "/m/t/p/unit/2"]);
    expect(items[0].textContent).toContain("Long stalled · 20 working days");
    expect(items[0].textContent).toContain("Next activity: Paint");
    fireEvent.click(screen.getByLabelText("Show the active ones too"));
    expect(document.querySelectorAll("[data-stall-rows] a")).toHaveLength(3);
  });

  it("filters by block, and the threshold is saved as a number", () => {
    render(<StalledUnits />);
    fireEvent.change(document.getElementById(screen.getByText("Block").closest("label")!.getAttribute("for")!)!, { target: { value: "B2" } });
    expect(Array.from(document.querySelectorAll("[data-stall-rows] a")).map(item => item.getAttribute("href"))).toEqual(["/m/t/p/unit/2"]);
    fireEvent.change(screen.getAllByRole("spinbutton")[0], { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the threshold" }));
    expect(h.save).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", thresholdDays: 5 });
  });
});

/** @vitest-environment jsdom */
// Synthetic fixtures only. Plan, unit codes and drawing are built here; no real project or drawing data.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterPlanDrawing } from "./MasterPlanDrawing";

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  error: null as unknown,
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false, isRtl: false }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    masterPlans: {
      list: { useQuery: () => ({ data: state.data, isLoading: state.isLoading, error: state.error, refetch: vi.fn() }) },
    },
  },
}));

const PLAN = { id: "plan-1", code: "MP-1", title: "Delivery map", status: "active", createdAt: new Date("2026-10-01") };
const VERSION = { id: "version-2", masterPlanId: "plan-1", versionNumber: 2 };
const OLD_VERSION = { id: "version-1", masterPlanId: "plan-1", versionNumber: 1 };
const unit = (id: string, code: string, status = "not_started", versionId = "version-2") => ({
  id, masterPlanVersionId: versionId, code, name: `Unit ${code}`, entityType: "unit", status, progressPercent: "0",
});

function plan(entities = [unit("unit-1", "B1-U-0001"), unit("unit-2", "B1-U-0002", "completed"), unit("unit-3", "B1-U-0003")]) {
  return { plans: [PLAN], versions: [VERSION, OLD_VERSION], entities: [...entities, unit("old-1", "B1-U-0001", "blocked", "version-1")] };
}

type Group = [number, string | number];
const group = (code: number, value: string | number): string => `${code}\r\n${value}\r\n`;
const entity = (type: string, groups: Group[]): string => group(0, type) + groups.map(([code, value]) => group(code, value)).join("");
function dxf(entities: string): string {
  return (
    group(0, "SECTION") + group(2, "HEADER") + group(9, "$ACADVER") + group(1, "AC1027") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "TABLES") + group(0, "TABLE") + group(2, "LAYER") + group(70, 1) +
    group(0, "LAYER") + group(2, "UNITS") + group(70, 0) + group(62, 7) + group(6, "CONTINUOUS") +
    group(0, "ENDTAB") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "ENTITIES") + entities + group(0, "ENDSEC") + group(0, "EOF")
  );
}
const square = (x: number, y: number): string =>
  entity("LWPOLYLINE", [[8, "UNITS"], [90, 4], [70, 1], [10, x], [20, y], [10, x + 10], [20, y], [10, x + 10], [20, y + 10], [10, x], [20, y + 10]]);
const label = (x: number, y: number, value: string): string => entity("TEXT", [[8, "UNITS"], [10, x], [20, y], [40, 2.5], [1, value]]);
const DRAWING = dxf(square(0, 0) + label(5, 5, "B1-U-0001") + square(20, 0) + label(25, 5, "B1-U-0002") + square(40, 0));

async function upload(container: HTMLElement, content: string) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], "plan.dxf", { type: "application/dxf" });
  fireEvent.change(input, { target: { files: [file] } });
}

afterEach(() => {
  cleanup();
  state.data = undefined;
  state.isLoading = false;
  state.error = null;
  vi.restoreAllMocks();
});

describe("MasterPlanDrawing", () => {
  it("tells the reviewer that the plan has no units yet", () => {
    state.data = { plans: [PLAN], versions: [VERSION], entities: [] };
    render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    expect(screen.getByRole("note").textContent).toMatch(/no units/);
  });

  it("shows a section error, not an empty plan, when the plan list cannot be read", () => {
    state.data = undefined;
    state.error = { message: "unavailable" };
    render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("matches an uploaded drawing and counts links as proposals until confirmed", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => expect(screen.getByText(/Confirmed: 0 · Proposed: 2 · Unlinked: 1 · Units remaining: 3 of 3/)).toBeTruthy());
  });

  it("confirms a proposal and reflects it in the summary", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => screen.getByText(/Proposed: 2/));
    fireEvent.click(screen.getByRole("button", { name: /Shape 1 · Proposed · B1-U-0001/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText(/Confirmed: 1 · Proposed: 1 · Unlinked: 1 · Units remaining: 2 of 3/)).toBeTruthy());
  });

  it("shows the unit status of a confirmed shape", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => screen.getByText(/Proposed: 2/));
    fireEvent.click(screen.getByRole("button", { name: /Shape 2 · Proposed · B1-U-0002/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText("Completed")).toBeTruthy());
  });

  it("shows a read error for a file that is not a DXF drawing", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "this is not a drawing");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/Confirmed:/)).toBeNull();
  });

  it("exports only confirmed links as CSV", async () => {
    state.data = plan();
    const created: Blob[] = [];
    // jsdom has no object URLs, so the export is captured here instead of downloaded.
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => screen.getByText(/Proposed: 2/));
    fireEvent.click(screen.getByRole("button", { name: /Shape 1 · Proposed · B1-U-0001/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Export confirmed links (CSV)" }));
    const csv = await created[0].text();
    expect(csv.split("\n")[0]).toBe("polygon_id,unit_code,unit_id");
    expect(csv).toContain("B1-U-0001");
    expect(csv).not.toContain("B1-U-0002");
  });
});

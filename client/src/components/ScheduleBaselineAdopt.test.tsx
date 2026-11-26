// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-61 (5): «adopt this import as the new baseline» — only for a P6 import that is not the baseline, only with the permission, only with a reason. Synthetic data.
const h = vi.hoisted(() => ({ can: false, adopt: vi.fn(), error: null as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ useCan: () => h.can }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ schedule: { live: { invalidate: vi.fn() }, plannedCurve: { invalidate: vi.fn() } } }),
  schedule: { adoptBaseline: { useMutation: () => ({ mutate: h.adopt, isPending: false, error: h.error, reset: vi.fn() }) } },
} }));

import { ScheduleBaselineAdopt } from "./ScheduleBaselineAdopt";

const snapshots = [
  { id: "s3", source: "p6_update", dataDate: "2026-03-01", isBaseline: false, createdAt: "2026-03-01" },
  { id: "s2", source: "p6_import", dataDate: "2026-02-01", isBaseline: false, createdAt: "2026-02-01" },
  { id: "s1", source: "p6_import", dataDate: "2026-01-01", isBaseline: true, createdAt: "2026-01-01" },
];
afterEach(() => { cleanup(); h.adopt.mockReset(); h.error = null; });

describe("ScheduleBaselineAdopt (Q-61 (5))", () => {
  it("lists the imports only (not the updates), marks the baseline, and offers the button for the other import to whoever may", () => {
    h.can = true;
    render(<ScheduleBaselineAdopt tenantId="t" projectId="p" snapshots={snapshots} />);
    expect(Array.from(document.querySelectorAll("[data-import]")).map(node => node.getAttribute("data-import"))).toEqual(["s2", "s1"]);
    expect(document.querySelector('[data-import="s1"]')!.getAttribute("data-is-baseline")).toBe("true");
    expect(document.querySelector('[data-adopt="s1"]')).toBeNull();
    expect(document.querySelector('[data-adopt="s2"]')).toBeTruthy();
  });

  it("NEGATIVE: without the permission there is no button", () => {
    h.can = false;
    render(<ScheduleBaselineAdopt tenantId="t" projectId="p" snapshots={snapshots} />);
    expect(document.querySelector("[data-adopt]")).toBeNull();
  });

  it("the reason is required (five characters) before the decision is sent; then it is sent with the snapshot", () => {
    h.can = true;
    render(<ScheduleBaselineAdopt tenantId="t" projectId="p" snapshots={snapshots} />);
    fireEvent.click(document.querySelector('[data-adopt="s2"]')!);
    const confirm = document.querySelector("[data-confirm-adopt]") as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "ok" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Approved version replaces the submitted one" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(h.adopt).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", snapshotId: "s2", reason: "Approved version replaces the submitted one" });
  });

  it("NEGATIVE: the server's refusal is shown in the page's language", () => {
    h.can = true; h.error = { message: "x", data: { projectError: { code: "PROJECT_OS_SCHEDULE_BASELINE_NOT_IMPORT" } } };
    render(<ScheduleBaselineAdopt tenantId="t" projectId="p" snapshots={snapshots} />);
    fireEvent.click(document.querySelector('[data-adopt="s2"]')!);
    expect(document.querySelector("[data-adopt-error]")!.textContent).toMatch(/Only a full P6 import/);
  });
});

/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportCorrections } from "./ReportCorrections";

// Q-72 (5): the correction of a sent daily report is an extra record — listed with its part and time, added by someone who may write reports, never an edit of the report.
const h = vi.hoisted(() => ({ mutate: vi.fn(), error: null as unknown }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized: correction refused" }));
vi.mock("@/lib/trpc", () => ({ trpc: { siteReports: { addCorrection: { useMutation: () => ({ mutate: h.mutate, isPending: false, error: h.error }) } } } }));
afterEach(() => { cleanup(); h.mutate.mockReset(); h.error = null; });

const scope = { tenantId: "t", projectId: "p" };
const rows = [{ id: "c1", section: "labour", note: "Labour was 12, not 10 (synthetic)", createdByUserId: 1, createdAt: "2026-11-27T08:00:00Z" }];

describe("ReportCorrections", () => {
  it("lists the corrections with their part and records a new one on the chosen part", () => {
    render(<ReportCorrections scope={scope} reportId="r1" corrections={rows} canAdd onAdded={() => undefined} />);
    expect(screen.getByText("Labour was 12, not 10 (synthetic)")).toBeTruthy();
    const add = screen.getByRole("button", { name: "Add a correction" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true); // nothing written yet
    fireEvent.change(screen.getByLabelText("Part"), { target: { value: "hse" } });
    fireEvent.change(screen.getByLabelText("What is corrected, and what is right?"), { target: { value: "Two near misses, not one" } });
    fireEvent.click(add);
    expect(h.mutate).toHaveBeenCalledWith({ ...scope, reportId: "r1", section: "hse", note: "Two near misses, not one" });
  });
  it("a reader who may not write reports sees the corrections but no form; none says so", () => {
    const view = render(<ReportCorrections scope={scope} reportId="r1" corrections={rows} canAdd={false} onAdded={() => undefined} />);
    expect(screen.queryByRole("button", { name: "Add a correction" })).toBeNull();
    view.rerender(<ReportCorrections scope={scope} reportId="r1" corrections={[]} canAdd={false} onAdded={() => undefined} />);
    expect(screen.getByText("No corrections.")).toBeTruthy();
  });
  it("a refusal is shown with its reason", () => {
    h.error = new Error("refused");
    render(<ReportCorrections scope={scope} reportId="r1" corrections={[]} canAdd onAdded={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toBe("localized: correction refused");
  });
});

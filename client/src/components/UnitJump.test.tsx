// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-67 (5): the unit card opens from the project's villas, not a typed number. Synthetic data only.
const h = vi.hoisted(() => ({ navigate: vi.fn(), query: {} as { data?: unknown; isError?: boolean }, enabled: [] as boolean[] }));
vi.mock("wouter", () => ({ useLocation: () => ["/", h.navigate] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: { progressPicker: { useQuery: (_input: unknown, options: { enabled: boolean }) => { h.enabled.push(options.enabled); return h.query; } } } } }));
import { UnitJump } from "./UnitJump";

const fallback = <input aria-label="Unit number" />;
beforeEach(() => { h.navigate.mockReset(); h.enabled = []; h.query = { data: { villas: [{ villa: "700", block: "BLK 33", phase: "PH1", model: "C" }, { villa: "701", block: "BLK 34", phase: null, model: "D" }] }, isError: false }; });
afterEach(() => cleanup());

describe("UnitJump (Q-67 5)", () => {
  it("POSITIVE: a searchable list of the project's villas (found by block too) opens the chosen villa's card", () => {
    render(<UnitJump tenantId="t" projectId="p" canRead placeholder="Unit card" fallback={fallback} />);
    expect(screen.queryByRole("textbox", { name: "Unit number" })).toBeNull();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("textbox", { name: "Unit card" }), { target: { value: "BLK 34" } });
    expect(screen.getAllByRole("option").map(option => option.getAttribute("data-value"))).toEqual(["701"]);
    fireEvent.click(screen.getByRole("option"));
    expect(h.navigate).toHaveBeenCalledWith("/m/t/p/unit/701");
  });

  it("NEGATIVE: no PMC villas, a list that failed, or a person without the progress screen's read keeps the typed number (and asks nothing of the server)", () => {
    h.query = { data: { villas: [] }, isError: false };
    const { rerender } = render(<UnitJump tenantId="t" projectId="p" canRead placeholder="Unit card" fallback={fallback} />);
    expect(screen.getByRole("textbox", { name: "Unit number" })).toBeTruthy();
    h.query = { data: undefined, isError: true };
    rerender(<UnitJump tenantId="t" projectId="p" canRead placeholder="Unit card" fallback={fallback} />);
    expect(screen.getByRole("textbox", { name: "Unit number" })).toBeTruthy();
    h.enabled = []; h.query = {};
    rerender(<UnitJump tenantId="t" projectId="p" canRead={false} placeholder="Unit card" fallback={fallback} />);
    expect(h.enabled.every(enabled => enabled === false)).toBe(true);
    expect(screen.getByRole("textbox", { name: "Unit number" })).toBeTruthy();
  });
});

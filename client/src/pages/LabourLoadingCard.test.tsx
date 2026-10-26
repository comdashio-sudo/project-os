/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LabourLoadingCard from "./LabourLoadingCard";

const h = vi.hoisted(() => ({
  arabic: false,
  canEdit: true,
  isDefault: false,
  empty: false,
  fail: false,
  save: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic, language: (h.arabic) ? "ar" : "en", isRtl: h.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  profitability: { labour: { useQuery: () => h.fail ? { isLoading: false, error: new Error("x"), data: undefined, refetch: h.refetch } : { isLoading: false, error: null, refetch: h.refetch, data: h.empty ? { approvedEntries: 0, loadedEntries: 0, resourceEntries: 0, hours: 0, loadedCost: 0, effectiveLoadingFactor: null, isDefault: true, settings: {} } : { approvedEntries: 3, loadedEntries: 2, resourceEntries: 1, hours: 24, loadedCost: 1122.64, effectiveLoadingFactor: 1.1788, isDefault: false, settings: {} } } } },
  labourSettings: {
    get: { useQuery: () => ({ isLoading: false, error: null, refetch: h.refetch, data: { employerGosiRateSaudi: 0.1175, employerGosiRateNonSaudi: 0.02, indirectLoadingPercent: 10, hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4], eosFirstPeriodYears: 5, eosFirstPeriodMonthsPerYear: 0.5, eosLaterMonthsPerYear: 1, isDefault: h.isDefault, canEdit: h.canEdit } }) },
    save: { useMutation: (options: { onSuccess?: () => void }) => ({ mutate: (input: unknown) => { h.save(input); options.onSuccess?.(); }, error: null, isPending: false }) },
  },
} }));

afterEach(() => { cleanup(); Object.assign(h, { arabic: false, canEdit: true, isDefault: false, empty: false, fail: false }); vi.clearAllMocks(); });
const render_ = () => render(<LabourLoadingCard tenantId="t" projectId="p" currency="SAR" />);

describe("LabourLoadingCard", () => {
  it("shows the effective loading factor, how the hours were priced, and the tenant's settings, without any individual's pay", () => {
    render_();
    expect(screen.getByTestId("labour-factor").textContent).toBe("×1.18");
    expect(screen.getByText(/2 time entries priced from payroll and 1 from the resource plan rate/)).toBeTruthy();
    expect(screen.getByTestId("labour-settings").textContent).toContain("Employer insurance — Saudi (%) 11.75%");
    expect(screen.getByTestId("labour-settings").textContent).toContain("Employer insurance — non-Saudi (%) 2%");
    expect(screen.getByTestId("labour-estimate-note").textContent).toContain("not a legal calculation"); // the owner asked for this sentence on the screen
    expect(screen.getByTestId("labour-settings").textContent).toContain("Sunday, Monday, Tuesday, Wednesday, Thursday");
    expect(screen.getByText(/1,123 SAR/)).toBeTruthy();
  });

  it("says plainly when nothing was priced from payroll yet", () => {
    h.empty = true;
    render_();
    expect(screen.getByTestId("labour-factor").textContent).toBe("—");
    expect(screen.getByText("No hours have been priced from payroll yet")).toBeTruthy();
  });

  it("names a rate above its maximum beside its field and saves nothing", () => {
    render_();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Employer insurance — Saudi (%)"), { target: { value: "99" } });
    fireEvent.submit(document.getElementById("labour-gosi")!.closest("form") as HTMLFormElement);
    expect(screen.getByText("The value is outside the allowed range.")).toBeTruthy();
    expect(h.save).not.toHaveBeenCalled();
  });

  it("lets a permitted user edit and save the factors and the working days, in the units the server stores", () => {
    render_();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Employer insurance — Saudi (%)"), { target: { value: "9.5" } });
    fireEvent.change(screen.getByLabelText("Employer insurance — non-Saudi (%)"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Years at the first rate"), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Months per year in that period"), { target: { value: "0.6" } });
    fireEvent.change(screen.getByLabelText("Months per year after it"), { target: { value: "1.2" } });
    fireEvent.change(screen.getByLabelText("Indirect loading (%)"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Hours per day"), { target: { value: "9" } });
    fireEvent.click(screen.getByLabelText("Friday")); // add Friday
    fireEvent.click(screen.getByLabelText("Sunday")); // drop Sunday
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.save).toHaveBeenCalledWith({ tenantId: "t", employerGosiRateSaudi: 0.095, employerGosiRateNonSaudi: 0.015, indirectLoadingPercent: 12, hoursPerDay: 9, workingDays: [1, 2, 3, 4, 5], eosFirstPeriodYears: 4, eosFirstPeriodMonthsPerYear: 0.6, eosLaterMonthsPerYear: 1.2 });
    expect(screen.getByText("Settings saved")).toBeTruthy();
    expect(h.refetch).toHaveBeenCalled();
  });

  it("cannot save with no working day, and offers no edit to someone who may only read", () => {
    render_();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]) fireEvent.click(screen.getByLabelText(day));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    h.canEdit = false;
    render_();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("marks default settings, shows an error with retry, and has Arabic labels", () => {
    h.isDefault = true;
    render_();
    expect(screen.getByTestId("labour-settings").textContent).toContain("Default settings");
    cleanup();
    h.isDefault = false; h.fail = true;
    render_();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.refetch).toHaveBeenCalled();
    cleanup();
    h.fail = false; h.arabic = true;
    render_();
    expect(screen.getByText("تكلفة العمالة المحمّلة")).toBeTruthy();
    expect(screen.getByTestId("labour-settings").textContent).toContain("الأحد، الاثنين");
  });
});

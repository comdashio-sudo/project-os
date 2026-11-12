/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectReferenceLists } from "./ProjectReferenceLists";

// D-84 (P-37): the reference-list screens on the procedures of #233.
const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", canEdit: true, calls: {} as Record<string, ReturnType<typeof vi.fn>>, errors: {} as Record<string, unknown>,
  roles: [] as Array<{ id: string; name: string; category: "direct" | "indirect"; defaultKey: string | null; active: boolean; sortOrder: number }>,
  machines: [] as Array<{ id: string; equipmentType: string; model: string | null; plateOrSize: string | null; ownerCompanyId: string | null; ownerName: string | null; active: boolean }>,
  activities: [] as Array<{ id: string; code: string; name: string; measureUnit: "villa" | "lm" | "m2" | "piece"; totalQuantity: number | null }>,
  rolesError: null as unknown, companiesEnabled: [] as boolean[],
}));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/permissions", () => ({
  useCan: () => h.canEdit,
  WriteGate: ({ children, reason }: { children: React.ReactNode; reason?: { en: string; ar: string } }) => (h.canEdit ? <>{children}</> : <p role="note">{h.language === "ar" ? reason?.ar : reason?.en}</p>),
}));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: (error: { message: string }) => `localized: ${error.message}` }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string, result: unknown = {}) => ({ useMutation: (config?: { onSuccess?: (result: unknown) => void }) => ({
    mutate: (input: unknown) => { (h.calls[name] ??= vi.fn())(input); if (!h.errors[name]) config?.onSuccess?.(typeof result === "function" ? (result as (input: unknown) => unknown)(input) : result); },
    isPending: false, error: h.errors[name] ?? null, variables: undefined,
  }) });
  const query = (read: () => unknown, error: () => unknown = () => null) => ({ useQuery: () => ({ data: error() ? undefined : read(), isLoading: false, isFetching: false, error: error(), refetch: vi.fn() }) });
  return { trpc: { projects: {
    labourRoles: { list: query(() => h.roles, () => h.rolesError), save: mutation("roleSave", { id: "r-new" }), setActive: mutation("roleActive"), seedDefaults: mutation("seed", { added: 80, offered: 80 }) },
    equipment: { list: query(() => h.machines), save: mutation("machineSave", { id: "m-new" }), setActive: mutation("machineActive") },
    companies: { list: { useQuery: (_input: unknown, options?: { enabled?: boolean }) => { h.companiesEnabled.push(options?.enabled !== false); return { data: [{ id: "c-main", name: "Main Contractor Co.", role: "main", active: true }, { id: "c-old", name: "Former Sub Co.", role: "sub", active: false }], isLoading: false, isFetching: false, error: null, refetch: vi.fn() }; } } },
    siteActivities: { list: query(() => h.activities), setMeasure: mutation("setMeasure", (input: { siteActivityId: string }) => ({ id: input.siteActivityId })) },
  } } };
});

beforeEach(() => {
  h.language = "en"; h.canEdit = true; h.calls = {}; h.errors = {}; h.rolesError = null; h.companiesEnabled = [];
  h.roles = [{ id: "r1", name: "Masons", category: "direct", defaultKey: null, active: true, sortOrder: 1 }, { id: "r2", name: "Site engineer", category: "indirect", defaultKey: null, active: true, sortOrder: 2 }, { id: "r3", name: "Old trade", category: "direct", defaultKey: null, active: false, sortOrder: 3 }];
  h.machines = [{ id: "m1", equipmentType: "Mixer", model: "MX-2", plateOrSize: "PLT-100", ownerCompanyId: "c-main", ownerName: "Main Contractor Co.", active: true }];
  h.activities = [{ id: "a1", code: "BLK", name: "Blockwork", measureUnit: "villa", totalQuantity: null }, { id: "a2", code: "CRB", name: "Kerbs", measureUnit: "villa", totalQuantity: null }];
});
afterEach(cleanup);
const tab = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const type = (label: string, value: string, index = 0) => fireEvent.change(screen.getAllByLabelText(new RegExp(`^${label}`))[index]!, { target: { value } });

describe("labour roles", () => {
  it("lists direct and indirect apart, marks a stopped role, adds, edits and stops", () => {
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    const direct = screen.getByRole("group", { name: "Direct" });
    expect(within(direct).getByText("Old trade").textContent).toContain("Old trade");
    expect(within(direct).getByText("Stopped")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Indirect" })).getByText("Site engineer")).toBeTruthy();
    type("Name", "Steel fixers"); fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(h.calls.roleSave).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", id: undefined, name: "Steel fixers", category: "direct" });
    fireEvent.click(within(document.querySelector('[data-role="r2"]')!).getByRole("button", { name: "Edit" }));
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("Site engineer");
    type("Name", "Site engineers"); fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.calls.roleSave).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", id: "r2", name: "Site engineers", category: "indirect" });
    fireEvent.click(within(document.querySelector('[data-role="r1"]')!).getByRole("button", { name: "Stop" }));
    fireEvent.click(within(document.querySelector('[data-role="r3"]')!).getByRole("button", { name: "Activate" }));
    expect(h.calls.roleActive!.mock.calls.map(call => call[0])).toEqual([{ tenantId: "t", projectId: "p", id: "r1", active: false }, { tenantId: "t", projectId: "p", id: "r3", active: true }]);
  });

  it("an empty list offers the default list as its next step, in the screen's language", () => {
    h.roles = [];
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    expect(screen.getByText("No labour roles yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy the default list" }));
    expect(h.calls.seed).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", language: "en" });
    expect(screen.getByText("80 roles added.")).toBeTruthy();
  });

  it("someone without project.manage reads the lists with one translated sentence and no button or field", () => {
    h.canEdit = false; h.roles = [];
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    expect(screen.getByRole("note").textContent).toBe("You cannot change the reference lists; you can only view them. The project manager changes them.");
    expect(screen.queryByText("Copy the default list")).toBeNull();
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
    tab("Equipment");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(h.companiesEnabled.every(enabled => !enabled)).toBe(true); // review of #250: no owners list fetched for a reader
    expect(document.querySelectorAll("input, select")).toHaveLength(0);
  });

  it("a refusal from the server is said in the page's language and the form stays", () => {
    h.errors.roleSave = { message: "PROJECT_OS_LABOUR_ROLE_EXISTS" };
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    type("Name", "masons"); fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert").textContent).toBe("localized: PROJECT_OS_LABOUR_ROLE_EXISTS");
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("masons");
  });

  it("a list that failed to load says so and offers a retry, not an empty list", () => {
    h.rolesError = { message: "boom" };
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    expect(screen.getByText("Could not load: Labour roles")).toBeTruthy();
    expect(screen.queryByText("No labour roles yet")).toBeNull();
  });
});

describe("equipment", () => {
  it("offers the project's active companies as owners only, and sends empty optional fields as null", () => {
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    tab("Equipment");
    expect(within(document.querySelector('[data-machine="m1"]')!).getByText("Main Contractor Co.")).toBeTruthy();
    const owner = screen.getByLabelText(/^Owner/) as HTMLSelectElement;
    expect((screen.getByLabelText(/^Plate or size/) as HTMLInputElement).maxLength).toBe(80); // the server's limit (review of #250)
    expect(Array.from(owner.options).map(option => option.textContent)).toEqual(["No owner", "Main Contractor Co."]);
    type("Type", "Excavator"); fireEvent.click(screen.getByRole("button", { name: "Add equipment" }));
    expect(h.calls.machineSave).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", id: undefined, equipmentType: "Excavator", model: null, plateOrSize: null, ownerCompanyId: null });
    fireEvent.click(within(document.querySelector('[data-machine="m1"]')!).getByRole("button", { name: "Edit" }));
    fireEvent.change(owner, { target: { value: "__none" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(h.calls.machineSave).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", id: "m1", equipmentType: "Mixer", model: "MX-2", plateOrSize: "PLT-100", ownerCompanyId: null });
  });

  it("an empty register says what to do next", () => {
    h.machines = [];
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    tab("Equipment");
    expect(screen.getByText("No equipment yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add equipment" })).toBeTruthy();
  });
});

describe("activities and their units", () => {
  it("a unit other than villa needs a total quantity: refused beside the field, nothing sent; villa stores no quantity", () => {
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    tab("Activities and units");
    const row = within(document.querySelector('[data-activity="a2"]')!);
    fireEvent.change(row.getByLabelText(/^Unit of measure/), { target: { value: "lm" } });
    fireEvent.click(row.getByRole("button", { name: "Save" }));
    const total = row.getByLabelText(/^Total quantity/);
    expect(document.getElementById(total.getAttribute("aria-describedby")!)?.textContent).toBe("A total quantity is required for any unit but villa.");
    expect(h.calls.setMeasure).toBeUndefined();
    fireEvent.change(total, { target: { value: "1250" } });
    fireEvent.click(row.getByRole("button", { name: "Save" }));
    expect(h.calls.setMeasure).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", siteActivityId: "a2", measureUnit: "lm", totalQuantity: 1250 });
    const first = within(document.querySelector('[data-activity="a1"]')!);
    fireEvent.change(first.getByLabelText(/^Unit of measure/), { target: { value: "m2" } });
    fireEvent.change(first.getByLabelText(/^Unit of measure/), { target: { value: "villa" } });
    fireEvent.click(first.getByRole("button", { name: "Save" }));
    expect(h.calls.setMeasure).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", siteActivityId: "a1", measureUnit: "villa", totalQuantity: null });
  });
});

describe("three languages", () => {
  it.each([["ar", ["أدوار العمالة", "المعدات", "الأنشطة ووحداتها"]], ["ur", ["مزدوروں کے کردار", "سازوسامان", "سرگرمیاں اور اکائیاں"]]] as const)("%s: the tabs", (language, tabs) => {
    h.language = language;
    render(<ProjectReferenceLists tenantId="t" projectId="p" />);
    expect(screen.getAllByRole("radio").map(node => node.textContent)).toEqual([...tabs]);
  });
});

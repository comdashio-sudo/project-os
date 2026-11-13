/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectMaterials } from "./ProjectMaterials";
import { TYPING_TEST } from "@/test/typing";

const state = vi.hoisted(() => ({ error: null as unknown, isArabic: false, create: vi.fn(), override: vi.fn(), refetch: vi.fn() }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized material error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { materials: { list: { useQuery: () => ({ isLoading: false, error: null, refetch: state.refetch, data: [{ id: "11111111-1111-4111-8111-111111111111", code: "MAT-01", description: "Concrete", unitOfMeasure: "m3", category: "Concrete", override: null }] }) }, createMaster: { useMutation: () => ({ mutate: state.create, isPending: false, error: state.error }) }, saveProjectOverride: { useMutation: () => ({ mutate: state.override, isPending: false, error: null }) } } } }));

describe("ProjectMaterials interaction", TYPING_TEST, () => {
  beforeEach(() => { cleanup(); state.error = null; state.isArabic = false; state.create.mockReset(); state.override.mockReset(); state.refetch.mockReset(); });
  it("submits a bounded tenant material and a project override", async () => {
    const user = userEvent.setup(); render(<ProjectMaterials tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Material code"), "MAT-02"); await user.type(screen.getByLabelText("Description"), "Rebar"); await user.type(screen.getByLabelText("Unit of measure"), "ton"); await user.type(screen.getByLabelText("Category"), "Steel"); await user.click(screen.getByRole("button", { name: "Save material" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", code: "MAT-02", unitOfMeasure: "ton" }));
    await user.selectOptions(screen.getByLabelText("Material"), "11111111-1111-4111-8111-111111111111"); await user.type(screen.getByLabelText("Project description"), "Approved rebar"); await user.type(screen.getByLabelText("Reorder level"), "12.5"); await user.click(screen.getByRole("button", { name: "Save override" }));
    expect(state.override).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", projectDescription: "Approved rebar", reorderLevel: 12.5, active: true }));
  });
  it("names a missing material code beside its field and creates nothing", async () => {
    const user = userEvent.setup(); render(<ProjectMaterials tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Description"), "Rebar"); await user.type(screen.getByLabelText("Unit of measure"), "ton"); await user.type(screen.getByLabelText("Category"), "Steel");
    await user.click(screen.getByRole("button", { name: "Save material" }));
    expect(screen.getByText("This field is required.")).toBeTruthy();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("renders only the localized error for a failed material write", async () => {
    const user = userEvent.setup(); state.error = {}; render(<ProjectMaterials tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Material code"), "MAT-FAIL"); await user.type(screen.getByLabelText("Description"), "Cable"); await user.type(screen.getByLabelText("Unit of measure"), "m"); await user.type(screen.getByLabelText("Category"), "Electrical"); await user.click(screen.getByRole("button", { name: "Save material" }));
    expect(screen.getByRole("alert").textContent).toBe("Localized material error");
  });

  it("D-75: the material list has no native «required»: saving an override with no material chosen sends nothing", async () => {
    const user = userEvent.setup(); state.override.mockClear(); render(<ProjectMaterials tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Save override" }));
    expect(state.override).not.toHaveBeenCalled();
  });

  it("sends null to remove a reorder level and keeps its Arabic validation message local", async () => {
    const user = userEvent.setup(); render(<ProjectMaterials tenantId="tenant-1" projectId="project-1" />);
    await user.selectOptions(screen.getByLabelText("Material"), "11111111-1111-4111-8111-111111111111"); await user.click(screen.getByRole("button", { name: "Save override" }));
    expect(state.override).toHaveBeenCalledWith(expect.objectContaining({ reorderLevel: null }));

    cleanup(); state.override.mockReset(); state.isArabic = true; render(<ProjectMaterials tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByLabelText("حد إعادة الطلب")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("المادة"), "11111111-1111-4111-8111-111111111111"); await user.type(screen.getByLabelText("حد إعادة الطلب"), "0"); await user.click(screen.getByRole("button", { name: "حفظ التخصيص" }));
    expect(state.override).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("يجب أن يكون حد إعادة الطلب رقمًا أكبر من صفر.");
  });
});

/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PmoControlLinks } from "./PmoControlLinks";

const state = vi.hoisted(() => ({ arabic: false, create: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized link error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { controlLinks: {
  list: { useQuery: () => ({ data: [], refetch: vi.fn(), isLoading: false, error: null }) },
  create: { useMutation: () => ({ mutate: state.create, isPending: false, isSuccess: false, error: null }) },
} } }));

const projects = [{ id: "00000000-0000-4000-8000-0000000000a2", code: "PRJ-01", name: "North Link" }];
const records = [
  { id: "00000000-0000-4000-8000-0000000000r1", projectId: projects[0].id, type: "risk" as const, label: "RISK-01 · Access risk" },
  { id: "00000000-0000-4000-8000-0000000000a3", projectId: projects[0].id, type: "action" as const, label: "Mitigate access restriction" },
  { id: "00000000-0000-4000-8000-0000000000d2", projectId: projects[0].id, type: "decision" as const, label: "Approve access plan" },
  { id: "00000000-0000-4000-8000-0000000000f1", projectId: projects[0].id, type: "rfi" as const, label: "RFI-01 · Foundation clarification" },
  { id: "00000000-0000-4000-8000-0000000000n1", projectId: projects[0].id, type: "ncr" as const, label: "NCR-01 · Concrete deviation" },
];

describe("PmoControlLinks", () => {
  it("creates a governed risk-to-action link from authorized project records", async () => {
    cleanup(); state.arabic = false; state.create.mockClear();
    const user = userEvent.setup();
    render(<PmoControlLinks tenantId="00000000-0000-4000-8000-0000000000a1" projects={projects} records={records} />);
    await user.selectOptions(screen.getByLabelText("Source record"), "risk:00000000-0000-4000-8000-0000000000r1");
    await user.selectOptions(screen.getByLabelText("Linked record"), "action:00000000-0000-4000-8000-0000000000a3");
    await user.click(screen.getByRole("button", { name: "Save link" }));
    expect(state.create).toHaveBeenCalledWith({ tenantId: "00000000-0000-4000-8000-0000000000a1", projectId: projects[0].id, sourceType: "risk", sourceId: "00000000-0000-4000-8000-0000000000r1", targetType: "action", targetId: "00000000-0000-4000-8000-0000000000a3" });
    await user.selectOptions(screen.getByLabelText("Linked record"), "rfi:00000000-0000-4000-8000-0000000000f1");
    await user.click(screen.getByRole("button", { name: "Save link" }));
    expect(state.create).toHaveBeenLastCalledWith({ tenantId: "00000000-0000-4000-8000-0000000000a1", projectId: projects[0].id, sourceType: "risk", sourceId: "00000000-0000-4000-8000-0000000000r1", targetType: "rfi", targetId: "00000000-0000-4000-8000-0000000000f1" });
  });

  it("localizes the governance-link controls in Arabic", () => {
    cleanup(); state.arabic = true;
    render(<PmoControlLinks tenantId="00000000-0000-4000-8000-0000000000a1" projects={projects} records={records} />);
    expect(screen.getByText("روابط سجلات الحوكمة")).toBeTruthy();
    expect(screen.getByLabelText("سجل المصدر")).toBeTruthy();
    expect(screen.getByLabelText("السجل المرتبط")).toBeTruthy();
    expect(screen.getByText("طلب معلومات · RFI-01 · Foundation clarification")).toBeTruthy();
    expect(screen.getByText("حالة عدم مطابقة · NCR-01 · Concrete deviation")).toBeTruthy();
    expect(screen.getByRole("button", { name: "حفظ الرابط" })).toBeTruthy();
    state.arabic = false;
  });
});

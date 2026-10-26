/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleTemplateUpdatesCard } from "./RoleTemplateUpdatesCard";

const state = vi.hoisted(() => ({
  list: { data: undefined as unknown, isLoading: false, isError: false },
  decide: { mutate: vi.fn(), error: null as unknown, isPending: false },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: true, language: "ar", isRtl: true }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "رسالة خطأ" }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ tenant: { roleTemplateRemovals: { invalidate: vi.fn() }, administration: { invalidate: vi.fn() } } }), tenant: { roleTemplateRemovals: { useQuery: () => state.list }, decideRoleTemplateRemovals: { useMutation: () => state.decide } } } }));

const item = { id: "r1", roleId: "x", roleCode: "QA_QC_MANAGER", roleName: "مدير الجودة", permissionCode: "project.read", permissionName: "Read", holders: 3, status: "pending", proposedAt: new Date().toISOString() };
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); state.list = { data: [item], isLoading: false, isError: false }; state.decide = { mutate: vi.fn(), error: null, isPending: false }; });

describe("RoleTemplateUpdatesCard", () => {
  it("renders nothing when there is nothing to decide, while loading, or when the server refuses the read", () => {
    for (const list of [{ data: [], isLoading: false, isError: false }, { data: undefined, isLoading: true, isError: false }, { data: undefined, isLoading: false, isError: true }]) {
      state.list = list;
      const { container } = render(<RoleTemplateUpdatesCard tenantId="t1" />);
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });

  it("shows the role, the permission and how many people would lose it, and changes nothing until a button is pressed", () => {
    render(<RoleTemplateUpdatesCard tenantId="t1" />);
    expect(screen.getByText("مدير الجودة")).toBeTruthy();
    expect(screen.getByText("project.read")).toBeTruthy();
    expect(screen.getByText("3 شخصًا يحملون هذا الدور وسيفقدونها")).toBeTruthy();
    expect(state.decide.mutate).not.toHaveBeenCalled();
  });

  it("approve and decline each send exactly that decision for that proposal", async () => {
    render(<RoleTemplateUpdatesCard tenantId="t1" />);
    await userEvent.click(screen.getByRole("button", { name: "أوافق على السحب" }));
    expect(state.decide.mutate).toHaveBeenLastCalledWith({ tenantId: "t1", ids: ["r1"], decision: "approve" });
    await userEvent.click(screen.getByRole("button", { name: "أُبقيها كما هي" }));
    expect(state.decide.mutate).toHaveBeenLastCalledWith({ tenantId: "t1", ids: ["r1"], decision: "decline" });
  });
});

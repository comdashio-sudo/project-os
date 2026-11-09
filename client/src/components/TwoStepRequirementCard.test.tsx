// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TwoStepRequirementCard } from "./TwoStepRequirementCard";

// D-81: the company's switch, off by default; refused reads (not the administrator) render nothing.
const state = vi.hoisted(() => ({ query: { data: { requireTwoStep: false } as { requireTwoStep: boolean } | undefined, isLoading: false, isError: false }, mutate: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ tenant: { securitySettings: { invalidate: vi.fn() } }, mfa: { status: { invalidate: vi.fn() } } }),
  tenant: { securitySettings: { useQuery: () => state.query }, setRequireTwoStep: { useMutation: () => ({ mutate: state.mutate, error: null, isPending: false }) } },
} }));
afterEach(() => { cleanup(); state.mutate.mockReset(); });

describe("TwoStepRequirementCard (D-81)", () => {
  it("shows the requirement OFF by default and switches it on for the company", async () => {
    state.query = { data: { requireTwoStep: false }, isLoading: false, isError: false };
    const user = userEvent.setup();
    render(<TwoStepRequirementCard tenantId="00000000-0000-4000-8000-000000000001" />);
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("e-mail code alone");
    await user.click(box);
    expect(state.mutate).toHaveBeenCalledWith({ tenantId: "00000000-0000-4000-8000-000000000001", requireTwoStep: true });
  });

  it("NEGATIVE: renders nothing when the server refuses the read (not the company's administrator)", () => {
    state.query = { data: undefined, isLoading: false, isError: true };
    const { container } = render(<TwoStepRequirementCard tenantId="00000000-0000-4000-8000-000000000001" />);
    expect(container.innerHTML).toBe("");
  });
});

/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectClaims } from "./ProjectClaims";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

const state = vi.hoisted(() => ({ create: vi.fn(), transition: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized claim error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { claims: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "claim-1", claimNumber: "CLM-01", title: "Delay claim", description: "An approved extension event requires valuation.", claimedAmount: "100.00", approvedAmount: null, currency: "SAR", status: "under_review" }], refetch: vi.fn() }) }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) }, transitionStatus: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) } } } }));

describe("ProjectClaims workflow", () => {
  beforeEach(() => { cleanup(); state.create.mockReset(); state.transition.mockReset(); });

  it("creates a project-scoped claim and approves it with an explicit bounded amount", async () => {
    const user = userEvent.setup();
    render(<ProjectClaims tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Claim number"), "CLM-02");
    await user.type(screen.getByLabelText("Claim title"), "Additional works");
    await user.type(screen.getByLabelText("Description"), "Additional approved scope requires commercial review.");
    await user.type(screen.getByLabelText("Claimed amount"), "200");
    await user.click(screen.getByRole("button", { name: "Register claim" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", claimNumber: "CLM-02", claimedAmount: 200 }));

    await user.type(screen.getByLabelText("Approved amount CLM-01"), "80");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", claimId: "claim-1", nextStatus: "approved", approvedAmount: 80 });
  });
});

describe("ProjectClaims form checks itself in the page's language (D-64)", () => {
  it("an empty claim records nothing and says so in English under its first field", () => {
    cleanup(); state.create.mockReset();
    render(<ProjectClaims tenantId="tenant-1" projectId="project-1" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "en", state.create);
  });
});

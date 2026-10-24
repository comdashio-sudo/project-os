/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectContracts } from "./ProjectContracts";

const state = vi.hoisted(() => ({ contractError: null as unknown, commitmentError: null as unknown, contractMutate: vi.fn(), commitmentMutate: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    procurement: { register: { useQuery: () => ({ data: { suppliers: [{ id: "sup-1", code: "SUP-01", legalName: "Gulf Steel Co", active: true }] } }) } },
    contracts: {
      getProjectRegister: { useQuery: () => ({ isLoading: false, error: null, data: { contracts: [], commitments: [] }, refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: state.contractMutate, isPending: false, error: state.contractError }) },
      createCommitment: { useMutation: () => ({ mutate: state.commitmentMutate, isPending: false, error: state.commitmentError }) },
    },
  },
}));

describe("ProjectContracts failed-submission retention", () => {
  beforeEach(() => { cleanup(); state.contractError = null; state.commitmentError = null; state.contractMutate.mockReset(); state.commitmentMutate.mockReset(); });

  it("keeps contract fields visible after a failed contract submission", async () => {
    const user = userEvent.setup();
    state.contractMutate.mockImplementation(() => { state.contractError = {}; });
    const view = render(<ProjectContracts tenantId="tenant-1" projectId="project-1" />);
    const [contractCode] = screen.getAllByLabelText("Code");
    await user.type(contractCode, "CTR-NEW");
    await user.type(screen.getByLabelText("Contract title"), "Access road");
    await user.type(screen.getByLabelText("Counterparty"), "Works Co");
    await user.type(screen.getByLabelText("Contract value"), "1500");
    await user.click(screen.getByRole("button", { name: "Record contract" }));
    view.rerender(<ProjectContracts tenantId="tenant-1" projectId="project-1" />);

    expect(state.contractMutate).toHaveBeenCalledOnce();
    expect((contractCode as HTMLInputElement).value).toBe("CTR-NEW");
    expect((screen.getByLabelText("Contract title") as HTMLInputElement).value).toBe("Access road");
    expect(screen.getByText("Localized error")).toBeTruthy();
  });

  it("keeps commitment fields visible after a failed commitment submission", async () => {
    const user = userEvent.setup();
    state.commitmentMutate.mockImplementation(() => { state.commitmentError = {}; });
    const view = render(<ProjectContracts tenantId="tenant-1" projectId="project-1" />);
    const codes = screen.getAllByLabelText("Code");
    await user.type(codes[1], "COM-NEW");
    await user.type(screen.getByLabelText("Commitment description"), "Concrete package");
    await user.type(screen.getByLabelText("Commitment amount"), "375");
    await user.click(screen.getByRole("button", { name: "Record commitment" }));
    view.rerender(<ProjectContracts tenantId="tenant-1" projectId="project-1" />);

    expect(state.commitmentMutate).toHaveBeenCalledOnce();
    expect((codes[1] as HTMLInputElement).value).toBe("COM-NEW");
    expect((screen.getByLabelText("Commitment description") as HTMLInputElement).value).toBe("Concrete package");
    expect(screen.getByText("Localized error")).toBeTruthy();
  });

  it("sends a supplier contract with the register entry chosen and its name, and a client contract as a typed name", async () => {
    const user = userEvent.setup();
    render(<ProjectContracts tenantId="tenant-1" projectId="project-1" />);
    const [contractCode] = screen.getAllByLabelText("Code");
    await user.type(contractCode, "CTR-SUP");
    await user.type(screen.getByLabelText("Contract title"), "Steel supply");
    await user.type(screen.getByLabelText("Contract value"), "900");
    await user.selectOptions(screen.getByLabelText("Counterparty type"), "supplier");
    expect(screen.queryByLabelText("Counterparty")).toBeNull(); // the name comes from the register, not from typing
    await user.selectOptions(screen.getByLabelText("Choose the supplier"), "sup-1");
    await user.click(screen.getByRole("button", { name: "Record contract" }));
    expect(state.contractMutate).toHaveBeenLastCalledWith(expect.objectContaining({ code: "CTR-SUP", counterparty: "Gulf Steel Co", counterpartyKind: "supplier", supplierId: "sup-1" }));
    await user.selectOptions(screen.getByLabelText("Counterparty type"), "client");
    await user.type(screen.getByLabelText("Counterparty"), "Ministry Client");
    await user.click(screen.getByRole("button", { name: "Record contract" }));
    expect(state.contractMutate).toHaveBeenLastCalledWith(expect.objectContaining({ counterparty: "Ministry Client", counterpartyKind: "client", supplierId: undefined }));
  });
});

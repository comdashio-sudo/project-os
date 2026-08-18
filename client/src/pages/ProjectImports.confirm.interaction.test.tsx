/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectImports } from "./ProjectImports";

const state = vi.hoisted(() => ({ confirmMutate: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { dataImports: {
  list: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
  analyze: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: { id: "00000000-0000-4000-8000-0000000000f2", status: "validated", totalRows: 1, errors: [] } }) },
  confirm: { useMutation: () => ({ mutate: state.confirmMutate, isPending: false, error: null, data: null }) },
} } }));

describe("ProjectImports confirmation", () => {
  it("requires an explicit confirmation after a valid analysis", async () => {
    const user = userEvent.setup();
    render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(state.confirmMutate).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", importId: "00000000-0000-4000-8000-0000000000f2" });
  });
});

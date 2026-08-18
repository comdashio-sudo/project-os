/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDataExport } from "./ProjectDataExport";

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized export error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { dataImports: { export: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null, data: null }) } } } }));

describe("ProjectDataExport", () => {
  it("exports the selected project module and format in the current language", async () => {
    const user = userEvent.setup(); render(<ProjectDataExport tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Budget" })); await user.click(screen.getByRole("button", { name: "CSV" })); await user.click(screen.getByRole("button", { name: "Generate and download: Budget" }));
    expect(state.mutate).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "budget", format: "csv", locale: "en" });
  });
});

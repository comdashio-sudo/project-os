/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectDataExport } from "./ProjectDataExport";

const state = vi.hoisted(() => ({ mutate: vi.fn(), pending: false }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized export error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { dataImports: { export: { useMutation: () => ({ mutate: state.mutate, isPending: state.pending, error: null, data: null }) } } } }));

describe("ProjectDataExport", () => {
  it("exports the selected project module and format in the current language", async () => {
    const user = userEvent.setup(); render(<ProjectDataExport tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Budget" })); await user.click(screen.getByRole("button", { name: "CSV" })); await user.click(screen.getByRole("button", { name: "Generate and download: Budget" }));
    expect(state.mutate).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "budget", format: "csv", locale: "en" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("G-158: while the file is being made the button keeps the module's name, is busy, and a status line says so", () => {
    state.pending = true;
    try {
      render(<ProjectDataExport tenantId="tenant-1" projectId="project-1" />);
      const button = screen.getByRole("button", { name: "Generate and download: WBS" });
      expect(button.hasAttribute("disabled")).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect(screen.getByRole("status").textContent).toBe("Creating the WBS file…");
    } finally { state.pending = false; }
  });
});

/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProjectRegistry from "./ProjectRegistry";

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav aria-label="Project navigation" /> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    projects: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      transitionLifecycle: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

describe("ProjectRegistry keyboard access", () => {
  it("provides labelled creation fields and a predictable keyboard focus path", async () => {
    const user = userEvent.setup();
    render(<ProjectRegistry />);
    const workspace = screen.getByRole("link", { name: "Workspace" });
    const language = screen.getByRole("button", { name: "Language" });
    const projectCode = screen.getByLabelText("Project code");
    expect(screen.getByLabelText("Project name")).toBeTruthy();
    expect(screen.getByLabelText("Project type")).toBeTruthy();
    expect(screen.getByLabelText("Currency")).toBeTruthy();
    await user.tab();
    expect(document.activeElement).toBe(workspace);
    await user.tab();
    expect(document.activeElement).toBe(language);
    await user.tab();
    expect(document.activeElement).toBe(projectCode);
  });
});

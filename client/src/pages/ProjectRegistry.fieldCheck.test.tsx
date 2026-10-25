/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectRegistry from "./ProjectRegistry";

const state = vi.hoisted(() => ({ createProject: vi.fn() }));

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav aria-label="Project navigation" /> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    projects: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: state.createProject, isPending: false, error: null }) },
      transitionLifecycle: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

beforeEach(() => { state.createProject.mockReset(); });

describe("ProjectRegistry creation form checks its own fields", () => {
  it("names an empty project code beside its field and sends nothing", async () => {
    const user = userEvent.setup();
    render(<ProjectRegistry />);
    await user.type(screen.getByLabelText("Project name"), "Tower A");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(screen.getByText("This field is required.")).toBeTruthy();
    expect(state.createProject).not.toHaveBeenCalled();
  });
});

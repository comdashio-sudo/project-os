// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-12 (d): the new-project wizard. Fabricated names only.
const h = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn(), company: vi.fn(), createError: null as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t1" }), Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/uploadLimit", () => ({ putToStorage: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ projects: { companies: { list: { invalidate: vi.fn() } }, team: { invitations: { invalidate: vi.fn() } } } }),
    directUploads: { create: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
    projects: {
      create: { useMutation: () => ({ mutateAsync: h.create }) },
      profile: { save: { useMutation: () => ({ mutateAsync: h.save }) } },
      companies: { list: { useQuery: () => ({ isSuccess: true, data: [] }) }, save: { useMutation: () => ({ mutate: h.company, isPending: false, error: null }) } },
      team: { invitableRoles: { useQuery: () => ({ isSuccess: true, data: [{ id: "r-pm", name: "Project Manager" }] }) } },
    },
    tenant: { createInvitation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: undefined }) } },
  },
}));

import ProjectSetupWizard from "./ProjectSetupWizard";

beforeEach(() => { h.create.mockReset().mockResolvedValue({ id: "p-new" }); h.save.mockReset().mockResolvedValue({}); h.company.mockReset(); });
afterEach(() => cleanup());
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), { target: { value } });

describe("ProjectSetupWizard", () => {
  it("step 1 creates the project then saves its data; step 2 adds a company; step 3 offers the project manager and links to the team", async () => {
    render(<ProjectSetupWizard />);
    type("Project code", "PX-1"); type("Project name", "Demo villas"); type("Client", "Client Co.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and continue" })); });
    expect(h.create).toHaveBeenCalledWith({ tenantId: "t1", code: "PX-1", name: "Demo villas", projectType: "villas", currency: "SAR" });
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", projectId: "p-new", clientName: "Client Co.", consultantName: null, workDays: [0, 1, 2, 3, 4] }));
    expect(screen.getByText("No companies added yet.")).toBeTruthy();
    type("Company name", "Main Co.");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(h.company).toHaveBeenCalledWith({ tenantId: "t1", projectId: "p-new", name: "Main Co.", role: "main" });
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(screen.getByRole("link", { name: "Finish and open the project team" }).getAttribute("href")).toBe("/projects/t1/p-new/team");
  });

  it("a refused creation stays on step 1, says why, and saves nothing", async () => {
    h.create.mockRejectedValue(Object.assign(new Error("PROJECT_OS_PERMISSION_DENIED"), { data: { code: "FORBIDDEN" } }));
    render(<ProjectSetupWizard />);
    type("Project code", "PX-2"); type("Project name", "Refused");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save and continue" })); });
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(h.save).not.toHaveBeenCalled();
    expect(screen.queryByText("No companies added yet.")).toBeNull();
  });
});

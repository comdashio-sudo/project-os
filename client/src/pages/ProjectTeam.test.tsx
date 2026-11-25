// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Q-12 (c): the project team page. Fabricated names only.
const h = vi.hoisted(() => ({ canManage: true, invite: vi.fn(), result: undefined as unknown, language: "en" as "en" | "ar" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language === "ar", setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children, permission }: { children: React.ReactNode; permission: string }) => (permission === "project.team.invite" && !h.canManage ? null : <>{children}</>) }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t1", projectId: "p1" }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ projects: { team: { invitations: { invalidate: vi.fn() } } } }),
    projects: { team: {
      invitableRoles: { useQuery: () => ({ isSuccess: true, data: [{ id: "r1", code: "SITE_ENGINEER", name: "Site Engineer", scope: "project" }, { id: "r2", code: "QC_CUSTOM", name: "QC engineer", scope: "project" }, { id: "r3", code: "PLANNING_ENGINEER", name: "Planning Engineer", scope: "company" }] }) },
      list: { useQuery: () => ({ isSuccess: true, data: [{ membershipId: "m1", userId: 1, status: "active", name: "Site Engineer A", email: "a@example.test", roles: [{ roleId: "r1", code: "SITE_ENGINEER", name: "Site Engineer", scope: "project" }] }] }) },
      invitations: { useQuery: () => ({ isSuccess: true, data: [{ id: "i1", email: "b@example.test", roleCode: "QC_CUSTOM", roleName: "QC engineer", expiresAt: new Date("2026-11-19T00:00:00Z") }] }) },
    } },
    tenant: {
      administration: { useQuery: () => ({ isSuccess: true, data: { roles: [{ id: "r1", name: "Site engineer" }, { id: "r2", name: "QC engineer" }] } }) },
      createInvitation: { useMutation: () => ({ mutate: h.invite, isPending: false, error: null, data: h.result }) },
    },
  },
}));

import ProjectTeam from "./ProjectTeam";

beforeAll(() => {
  // Radix Select uses pointer and scroll APIs jsdom lacks
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => { h.canManage = true; h.invite.mockReset(); h.result = undefined; h.language = "en"; });
afterEach(() => cleanup());

describe("ProjectTeam", () => {
  it("lists the members with their roles and the invitations waiting for this project", () => {
    render(<ProjectTeam />);
    expect(screen.getByTestId("team-members").textContent).toContain("Site Engineer A");
    expect(screen.getByTestId("team-members").textContent).toContain("Site Engineer");
    expect(screen.getByTestId("team-invitations").textContent).toContain("b@example.test");
    expect(screen.getByTestId("team-invitations").textContent).toContain("QC engineer");
  });

  it("when no e-mail was sent, the link is shown to send by hand; when it was, it says so", () => {
    h.result = { emailed: false, inviteToken: "tok-123" };
    render(<ProjectTeam />);
    expect(screen.getByText(/No e-mail was sent/).parentElement?.textContent).toContain("/invite/accept?token=tok-123");
    cleanup();
    h.result = { emailed: true, inviteToken: "tok-456" };
    render(<ProjectTeam />);
    expect(screen.getByText("The invitation was e-mailed.")).toBeTruthy();
  });

  const choose = async (name: string) => {
    await act(async () => { fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" }); });
    await act(async () => { fireEvent.click(await screen.findByRole("option", { name })); });
  };
  const send = (email: string) => { fireEvent.change(document.querySelector('input[type="email"]')!, { target: { value: email } }); fireEvent.submit(document.querySelector("form")!); };

  it("Q-58 (3): the roles in Arabic in two groups — «لهذا المشروع» and «على مستوى الشركة» (the planning engineer); the company role is invited for the company", async () => {
    h.language = "ar";
    render(<ProjectTeam />);
    await act(async () => { fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" }); });
    await screen.findByRole("option", { name: "مهندس التخطيط" });
    const groups = Array.from(document.querySelectorAll("[data-select-group]")).map(group => [group.getAttribute("data-select-group"), Array.from(group.querySelectorAll('[role="option"]')).map(option => option.textContent)]);
    // a role the platform names is shown in Arabic; a company's own role keeps its name
    expect(groups).toEqual([["لهذا المشروع", ["مهندس الموقع", "QC engineer"]], ["على مستوى الشركة", ["مهندس التخطيط"]]]);
    await act(async () => { fireEvent.click(screen.getByRole("option", { name: "مهندس التخطيط" })); });
    expect(document.querySelector("[data-company-scope]")?.textContent).toContain("للشركة كلها");
    send("planner@q58.example.test");
    expect(h.invite).toHaveBeenCalledWith({ tenantId: "t1", email: "planner@q58.example.test", roleId: "r3", scopeType: "company" });
  });

  it("Q-58 (3): the members' roles and the waiting invitations are named in the reader's language too (a company's own role keeps its name)", () => {
    h.language = "ar";
    render(<ProjectTeam />);
    expect(within(screen.getByTestId("team-members")).getByText("مهندس الموقع")).toBeTruthy(); // the badge, not the stored English name
    expect(within(screen.getByTestId("team-members")).queryByText("Site Engineer")).toBeNull();
    expect(screen.getByTestId("team-invitations").textContent).toContain("QC engineer");
  });

  it("Q-58 (3): a project role is still invited onto this project only", async () => {
    render(<ProjectTeam />);
    await choose("Site Engineer");
    expect(document.querySelector("[data-company-scope]")).toBeNull();
    send("site@q58.example.test");
    expect(h.invite).toHaveBeenCalledWith({ tenantId: "t1", email: "site@q58.example.test", roleId: "r1", scopeType: "project", scopeId: "p1" });
  });

  it("Q-58 (3): with no e-mail sent, the link has a clear «Copy» button and says to send it on WhatsApp", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    h.result = { emailed: false, inviteToken: "tok-789" };
    render(<ProjectTeam />);
    const box = document.querySelector("[data-invite-link]")!;
    expect(box.textContent).toContain("WhatsApp");
    await act(async () => { fireEvent.click(within(box as HTMLElement).getByRole("button", { name: "Copy the link" })); });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/invite/accept?token=tok-789"));
    expect(within(box as HTMLElement).getByRole("button", { name: "Link copied" })).toBeTruthy();
  });

  it("a person without project.team.invite sees the team but no invitation form", () => {
    h.canManage = false;
    render(<ProjectTeam />);
    expect(screen.queryByRole("button", { name: "Send the invitation" })).toBeNull();
    expect(screen.getByTestId("team-members")).toBeTruthy();
  });
});

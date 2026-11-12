// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-12 (c): the project team page. Fabricated names only.
const h = vi.hoisted(() => ({ canManage: true, invite: vi.fn(), result: undefined as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children, permission }: { children: React.ReactNode; permission: string }) => (permission === "tenant.manage" && !h.canManage ? null : <>{children}</>) }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t1", projectId: "p1" }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ projects: { team: { invitations: { invalidate: vi.fn() } } } }),
    projects: { team: {
      list: { useQuery: () => ({ isSuccess: true, data: [{ membershipId: "m1", userId: 1, status: "active", name: "Site Engineer A", email: "a@example.test", roles: [{ roleId: "r1", code: "SE", name: "Site engineer", scope: "project" }] }] }) },
      invitations: { useQuery: () => ({ isSuccess: true, data: [{ id: "i1", email: "b@example.test", roleName: "QC engineer", expiresAt: new Date("2026-11-19T00:00:00Z") }] }) },
    } },
    tenant: {
      administration: { useQuery: () => ({ isSuccess: true, data: { roles: [{ id: "r1", name: "Site engineer" }, { id: "r2", name: "QC engineer" }] } }) },
      createInvitation: { useMutation: () => ({ mutate: h.invite, isPending: false, error: null, data: h.result }) },
    },
  },
}));

import ProjectTeam from "./ProjectTeam";

beforeEach(() => { h.canManage = true; h.invite.mockReset(); h.result = undefined; });
afterEach(() => cleanup());

describe("ProjectTeam", () => {
  it("lists the members with their roles and the invitations waiting for this project", () => {
    render(<ProjectTeam />);
    expect(screen.getByTestId("team-members").textContent).toContain("Site Engineer A");
    expect(screen.getByTestId("team-members").textContent).toContain("Site engineer");
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

  it("a person without tenant.manage sees the team but no invitation form", () => {
    h.canManage = false;
    render(<ProjectTeam />);
    expect(screen.queryByRole("button", { name: "Send the invitation" })).toBeNull();
    expect(screen.getByTestId("team-members")).toBeTruthy();
  });
});

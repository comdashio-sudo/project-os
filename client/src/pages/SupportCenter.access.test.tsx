/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import SupportCenter from "./SupportCenter";

// Resolving a ticket is support.transition, which the server allows only to canManageSupport (tenant.manage, server/db.ts).
const state = vi.hoisted(() => ({ permission: { data: undefined as unknown, error: null as unknown, isLoading: false } }));
const TENANT = "11111111-1111-4111-8111-111111111111";
const TICKET = { id: "22222222-2222-4222-8222-222222222222", subject: "Example ticket", status: "in_progress", escalationStatus: "none", category: "general", priority: "normal", ownerUserId: null, tagsJson: "[]", createdAt: "2026-10-01T08:00:00.000Z", updatedAt: "2026-10-01T08:00:00.000Z" };

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "11111111-1111-4111-8111-111111111111" }),
  useLocation: () => ["/support", vi.fn()],
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Support error" }));
vi.mock("@/components/SectionResilience", () => ({ SourceNotice: () => null }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, data: undefined });
  const query = (data: unknown) => ({ data, error: null, isLoading: false, refetch: vi.fn(), invalidate: vi.fn() });
  return { trpc: {
    accessSummary: { mine: { useQuery: () => state.permission } },
    useUtils: () => ({ support: { tickets: { invalidate: vi.fn() }, knowledge: { list: { invalidate: vi.fn() }, sources: { invalidate: vi.fn() } } } }),
    support: {
      tickets: { useQuery: () => query([TICKET]) },
      ticket: { useQuery: () => query({ ticket: TICKET, messages: [] }) },
      knowledge: { list: { useQuery: () => query([]) }, sources: { useQuery: () => query([]) }, create: { useMutation: mutation } },
      create: { useMutation: mutation },
      reply: { useMutation: mutation },
      transition: { useMutation: mutation },
      claim: { useMutation: mutation },
    },
  } };
});

const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["EXECUTIVE"], permissions: ["tenant.manage"], scopes: [{ scopeType: "company", scopeId: null }], ...over });
const page = () => <PermissionProvider tenantId={TENANT}><SupportCenter /></PermissionProvider>;

describe("SupportCenter resolve control follows tenant.manage", () => {
  beforeEach(() => { state.permission = { data: undefined, error: null, isLoading: false }; });
  afterEach(cleanup);

  it("a support manager can resolve the open ticket", () => {
    state.permission = { data: summary(), error: null, isLoading: false };
    render(page());
    fireEvent.click(screen.getAllByText("Example ticket")[0]!);
    expect(screen.getByRole("button", { name: "Resolve ticket" })).toBeTruthy();
  });

  it("a person without tenant.manage reads the ticket but cannot resolve it", () => {
    state.permission = { data: summary({ permissions: ["project.read"] }), error: null, isLoading: false };
    render(page());
    fireEvent.click(screen.getAllByText("Example ticket")[0]!);
    expect(screen.queryByRole("button", { name: "Resolve ticket" })).toBeNull();
  });

  it("while the permission answer is loading the resolve control is not drawn", () => {
    state.permission = { data: undefined, error: null, isLoading: true };
    render(page());
    fireEvent.click(screen.getAllByText("Example ticket")[0]!);
    expect(screen.queryByRole("button", { name: "Resolve ticket" })).toBeNull();
  });

  it("when the permission lookup fails the control stays, and the server refuses what it must", () => {
    state.permission = { data: undefined, error: new Error("network"), isLoading: false };
    render(page());
    fireEvent.click(screen.getAllByText("Example ticket")[0]!);
    expect(screen.getByRole("button", { name: "Resolve ticket" })).toBeTruthy();
  });
});

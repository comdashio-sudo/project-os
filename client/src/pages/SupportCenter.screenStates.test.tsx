/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SupportCenter from "./SupportCenter";

// The support center (/support/:tenantId): a failed ticket read retries, a refused one gives the server's sentence, an empty ticket list
// names the next action (open the ticket form), and an empty knowledge list says what it is waiting for.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.", en: FORBIDDEN_EN } } } };
const state = vi.hoisted(() => ({
  tickets: { isLoading: false, isFetching: false, error: null as unknown, data: [] as unknown[] | undefined, refetch: vi.fn() },
  knowledge: { isLoading: false, isFetching: false, error: null as unknown, data: [] as unknown[] | undefined, refetch: vi.fn() },
  ownerSources: undefined as unknown[] | undefined,
}));
const mutation = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false, error: null }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("./SupportOwnerPanel", () => ({ SupportOwnerPanel: () => <section>owner</section> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ support: { tickets: { invalidate: vi.fn() } } }),
  support: {
    tickets: { useQuery: () => state.tickets },
    knowledge: { list: { useQuery: () => state.knowledge }, sources: { useQuery: () => ({ data: state.ownerSources, error: null }) } },
    ticket: { useQuery: () => ({ isLoading: false, error: null, data: undefined, refetch: vi.fn() }) },
    create: { useMutation: mutation }, reply: { useMutation: mutation }, transition: { useMutation: mutation },
  },
} }));

beforeEach(() => {
  state.ownerSources = undefined;
  state.tickets = { isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() };
  state.knowledge = { isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() };
});

describe("SupportCenter screen states", () => {
  afterEach(cleanup);

  it("an empty ticket list names the next action: the new-ticket form", () => {
    render(<SupportCenter />);
    expect(screen.getAllByText("No tickets are visible to you.").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Go to the ticket form" }).getAttribute("href")).toBe("#support-new");
    expect(document.getElementById("support-new")).toBeTruthy();
  });

  it("an empty knowledge list says what it is waiting for", () => {
    render(<SupportCenter />);
    expect(screen.getByText("No published knowledge articles exist in this workspace.")).toBeTruthy();
    expect(screen.getByText("Articles are published from the support owner panel once they are tied to an approved document.")).toBeTruthy();
  });

  it("D-28 (G-170): the empty knowledge list links to the support owner panel only for someone that panel answers", () => {
    state.ownerSources = [];
    const first = render(<SupportCenter />);
    expect(screen.getByRole("link", { name: "Publish the first article" }).getAttribute("href")).toBe("#support-owner");
    first.unmount();
    state.ownerSources = undefined;
    render(<SupportCenter />);
    expect(screen.queryByRole("link", { name: "Publish the first article" })).toBeNull();
  });

  it("a failed read offers a retry that refetches the tickets and the knowledge list", () => {
    state.tickets = { ...state.tickets, error: { message: "network down" }, data: undefined };
    render(<SupportCenter />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.tickets.refetch).toHaveBeenCalledTimes(1);
    expect(state.knowledge.refetch).toHaveBeenCalledTimes(1);
  });

  it("a refused ticket read shows the server's sentence and no retry", () => {
    state.tickets = { ...state.tickets, error: forbidden, data: undefined };
    render(<SupportCenter />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("while the tickets load, the list says so instead of 'no tickets'", () => {
    state.tickets = { ...state.tickets, isLoading: true, data: undefined };
    render(<SupportCenter />);
    expect(screen.getByText("Loading…", { exact: false, selector: "span" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Go to the ticket form" })).toBeNull();
  });
});

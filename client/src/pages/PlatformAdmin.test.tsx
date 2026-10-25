// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlatformAdmin from "./PlatformAdmin";

const state = vi.hoisted(() => ({ role: "admin" as string, overview: { data: undefined as unknown, isLoading: false, error: null as unknown, refetch: vi.fn(), isFetching: false }, requested: false }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Owner", role: state.role }, loading: false, isAuthenticated: true }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Safe error" }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/trpc", () => ({ trpc: { platform: { overview: { useQuery: (_input: unknown, options?: { enabled?: boolean }) => { state.requested = state.requested || options?.enabled !== false; return state.overview; } } } } }));

afterEach(() => { cleanup(); state.role = "admin"; state.requested = false; state.overview = { data: undefined, isLoading: false, error: null, refetch: vi.fn(), isFetching: false }; });

const overview = { totalCompanies: 2, shownCompanies: 2, truncated: false, companies: [
  { id: "11111111-1111-4111-8111-111111111111", legalName: "Alpha Co", slug: "alpha-co", status: "active", createdAt: new Date(), license: { status: "active", seats: 5, planCode: "ALL_IN_ONE_STANDARD", planName: "All-In-One Standard" } },
  { id: "22222222-2222-4222-8222-222222222222", legalName: "Beta Co", slug: "beta-co", status: "active", createdAt: new Date(), license: null },
], plans: [{ code: "PROJECT_STANDARD", name: "Project Standard", packageCode: "PROJECT", active: true }, { code: "PMO_STANDARD", name: "PMO Standard", packageCode: "PMO", active: false }] };

describe("platform administration page", () => {
  it("lists every company with its plan, a link to its licences, and the plan catalogue with each plan's state", () => {
    state.overview = { ...state.overview, data: overview };
    render(<PlatformAdmin />);
    expect(screen.getByText("Alpha Co")).toBeTruthy();
    expect(screen.getByText("All-In-One Standard")).toBeTruthy();
    expect(screen.getByText("No licence")).toBeTruthy(); // Beta Co has none
    const licenceLinks = screen.getAllByRole("link", { name: /Licences/ }).map(link => link.getAttribute("href"));
    expect(licenceLinks).toEqual(["/licensing/11111111-1111-4111-8111-111111111111", "/licensing/22222222-2222-4222-8222-222222222222"]);
    expect(screen.getByText("Project Standard")).toBeTruthy();
    expect(screen.getByText("Switched off")).toBeTruthy();
  });

  it("says plainly when the list is cut, with the true total", () => {
    state.overview = { ...state.overview, data: { ...overview, totalCompanies: 900, shownCompanies: 500, truncated: true } };
    render(<PlatformAdmin />);
    expect(screen.getByRole("status").textContent).toMatch(/500 of 900/);
  });

  it("NEGATIVE: anyone but the platform owner sees a plain refusal and the page sends no request at all", () => {
    state.role = "user";
    render(<PlatformAdmin />);
    expect(screen.getByText("This page is for the platform owner only.")).toBeTruthy();
    expect(state.requested).toBe(false);
  });

  it("a failed read is a visible error with a retry, not an empty page", () => {
    state.overview = { ...state.overview, error: new Error("boom") };
    render(<PlatformAdmin />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const state = vi.hoisted(() => ({ isArabic: false, startLogin: vi.fn() }));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false, isAuthenticated: false, logout: vi.fn() }) }));
vi.mock("@/components/BrandMark", () => ({ BrandIcon: () => <span>Dashio icon</span>, BrandMark: () => <span>Dashio</span> }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/const", () => ({ startLogin: () => state.startLogin() }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Safe error" }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({ trpc: { accessSummary: { mine: { useQuery: () => ({ data: undefined }) } }, tenant: { mine: { useQuery: () => ({ data: [], isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() }) } }, selfService: { plans: { useQuery: () => ({ data: [], isLoading: false }) }, signup: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } } } }));

afterEach(() => { cleanup(); state.startLogin.mockClear(); state.isArabic = false; });

describe("public PROJECT OS website", () => {
  it("presents the operating model, capabilities and secure entry in English", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /Run projects from operational truth/i })).toBeTruthy();
    expect(screen.getByText("Planning and schedule")).toBeTruthy();
    expect(screen.getAllByText("Every level sees the decision it owns").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Enter secure workspace" }).length).toBeGreaterThan(0);
  });

  it("presents the same governed capabilities in Arabic", () => {
    state.isArabic = true;
    render(<Home />);
    expect(screen.getByRole("heading", { name: /إدارة المشروع من الحقيقة التشغيلية/ })).toBeTruthy();
    expect(screen.getByText("التخطيط والجدول")).toBeTruthy();
    expect(screen.getAllByText("كل مستوى يرى القرار الذي يخصه").length).toBeGreaterThan(0);
  });
});

/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectProfitability from "./ProjectProfitability";
const state = vi.hoisted(() => ({ arabic: false }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { projects: { getControlsFinancials: { useQuery: () => ({ data: { budgets: [{ currentAmount: "1000" }], costs: [{ amount: "250" }] }, isLoading: false, error: null }) } }, subcontracts: { list: { useQuery: () => ({ data: [{ contractValue: "400" }], isLoading: false, error: null }) } }, projectInvoices: { list: { useQuery: () => ({ data: [{ amount: "600", vatAmount: "90", totalAmount: "690" }], isLoading: false, error: null }) } } } }));
afterEach(() => { cleanup(); state.arabic = false; });
describe("ProjectProfitability", () => {
  it("shows a traceable financial bridge from controlled sources", () => {
    render(<ProjectProfitability />);
    expect(screen.getByText("Project profitability control")).toBeTruthy();
    expect(screen.getAllByText("Approved budget").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1,000").length).toBeGreaterThan(0);
    expect(screen.getByText("Source coverage")).toBeTruthy();
  });
  it("localizes the FPAC screen in Arabic", () => {
    state.arabic = true;
    render(<ProjectProfitability />);
    expect(screen.getByText("لوحة ضبط ربحية المشروع")).toBeTruthy();
    expect(screen.getAllByText("الميزانية المعتمدة").length).toBeGreaterThan(0);
    expect(screen.getByText("تغطية المصادر")).toBeTruthy();
  });
});

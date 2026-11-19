// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-36 (step 2 b): «الموقع والتنفيذ» — four cards with counts, each only for whoever may open its page, and its read not made otherwise. Synthetic data only.
const h = vi.hoisted(() => {
  const state = { allowed: new Set<string>(), enabled: {} as Record<string, boolean | undefined>, language: "en" as "ar" | "en" | "ur", today: new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) };
  const query = (key: string, data: unknown) => ({ useQuery: (_input: unknown, options?: { enabled?: boolean }) => { state.enabled[key] = options?.enabled; const value = typeof data === "function" ? (data as () => unknown)() : data; return options?.enabled === false ? { data: undefined, isError: false, error: null, refetch: () => undefined } : { data: value, isError: false, error: null, refetch: () => undefined }; } });
  const now = new Date();
  const receipts: Array<{ at: Date; on: string; to: boolean }> = [];
  return Object.assign(state, { query, now, receipts });
});
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ useCanPage: (page: string) => h.allowed.has(page) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  siteReports: { list: h.query("reports", [{ id: "r1", reportDate: h.today, status: "submitted" }, { id: "r2", reportDate: "2026-01-04", status: "submitted" }, { id: "r3", reportDate: "2026-01-03", status: "approved" }]) },
  pmc: {
    progressActivities: h.query("activities", [{ code: "A" }, { code: "B" }, { code: "C" }]),
    qcHistory: h.query("receipts", () => h.receipts),
    stalledUnits: h.query("stalled", { counts: { stalled: 4, long: 2, active: 9 }, rows: [] }),
  },
} }));

import ProjectSite from "./ProjectSite";

// newest first, as pmc.qcHistory returns them: a receipt recorded today, a receipt recorded today for an EARLIER received date (counts), an undo recorded today
// (does not count), and a receipt recorded long ago with today's received date (does not count)
const QC_EVENTS = () => [{ at: h.now, on: h.today, to: true }, { at: h.now, on: "2026-01-01", to: true }, { at: h.now, on: h.today, to: false }, { at: new Date("2026-01-02T08:00:00Z"), on: h.today, to: true }];
beforeEach(() => { h.allowed = new Set(); h.enabled = {}; h.language = "en"; h.receipts.splice(0, h.receipts.length, ...QC_EVENTS()); });
afterEach(() => cleanup());
const card = (key: string) => document.querySelector(`[data-site-card="${key}"]`);

describe("ProjectSite (Q-36 2 b)", () => {
  it("POSITIVE: each card opens its page and says its count from the data — today's report and those awaiting approval, activities, today's QC receipts, stalled units", () => {
    h.allowed = new Set(["dailyReport", "progress", "qc", "stalled"]);
    render(<ProjectSite />);
    expect(document.querySelector("h1")!.textContent).toBe("Site and execution");
    expect(card("dailyReport")!.querySelector("a")!.getAttribute("href")).toBe("/m/t/p/report");
    expect(card("dailyReport")!.textContent).toContain("Today's report: Awaiting approval");
    expect(card("dailyReport")!.textContent).toContain("2 reports awaiting approval");
    expect(card("progress")!.querySelector("a")!.getAttribute("href")).toBe("/m/t/p/progress");
    expect(card("progress")!.textContent).toContain("3 activities in the weights table");
    expect(card("qc")!.querySelector("a")!.getAttribute("href")).toBe("/m/t/p/qc");
    expect(card("qc")!.textContent).toContain("2 receipts recorded today");
    expect(card("stalled")!.querySelector("a")!.getAttribute("href")).toBe("/projects/t/p/stalled");
    expect(card("stalled")!.textContent).toContain("4 stalled");
    expect(card("stalled")!.textContent).toContain("2 long stalled");
  });

  it("NEGATIVE: a card whose page the person may not open is not drawn and its read is not made; with none, one line says so", () => {
    h.allowed = new Set(["dailyReport"]);
    render(<ProjectSite />);
    expect(document.querySelectorAll("[data-site-card]")).toHaveLength(1);
    expect(h.enabled).toMatchObject({ reports: true, activities: false, receipts: false, stalled: false });
    cleanup(); h.allowed = new Set();
    render(<ProjectSite />);
    expect(document.querySelector("[data-site-cards]")).toBeNull();
    expect(document.querySelector("[role=note]")!.textContent).toContain("You may not open any of the site's screens");
  });

  it("Arabic and Urdu: the page's own name, and Western digits in the counts", () => {
    h.allowed = new Set(["stalled"]);
    h.language = "ar";
    render(<ProjectSite />);
    expect(document.querySelector("h1")!.textContent).toBe("الموقع والتنفيذ");
    expect(card("stalled")!.textContent).toContain("4 متوقفة");
    cleanup(); h.language = "ur";
    render(<ProjectSite />);
    expect(document.querySelector("h1")!.textContent).toBe("سائٹ اور عمل درآمد");
    expect(card("stalled")!.textContent).toMatch(/[0-9]/);
  });

  it("QC receipt (review of #410): only receipts RECORDED today count — an undo does not, an old event does not; a full page of today's events reads «100+»", () => {
    h.allowed = new Set(["qc"]);
    render(<ProjectSite />);
    expect(card("qc")!.textContent).toContain("2 receipts recorded today");
    cleanup();
    h.receipts.splice(0, h.receipts.length, ...Array.from({ length: 100 }, () => ({ at: h.now, on: h.today, to: true })));
    render(<ProjectSite />);
    expect(card("qc")!.textContent).toContain("100+ receipts recorded today");
    cleanup();
    h.receipts.splice(0, h.receipts.length, ...Array.from({ length: 99 }, () => ({ at: h.now, on: h.today, to: true })), { at: new Date("2026-01-02T08:00:00Z"), on: "2026-01-02", to: true });
    render(<ProjectSite />);
    expect(card("qc")!.textContent).toContain("99 receipts recorded today");
  });
});

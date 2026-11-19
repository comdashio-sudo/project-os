// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-36 (step 5): one frame for every field screen — the ways between them include the field entry and the site update, each only for whoever may open it.
const h = vi.hoisted(() => ({ denied: new Set<string>() }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/", () => undefined] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false, isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCanPage: (page: string) => !h.denied.has(page) }));
import { FieldShell } from "./FieldShell";

beforeEach(() => { h.denied = new Set(); });
afterEach(() => cleanup());
const tabs = () => Array.from(document.querySelectorAll("nav a")).map(a => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")]);

describe("FieldShell ways between the field screens (Q-36 5)", () => {
  it("POSITIVE: the field entry and the site update are field screens too, the open one marked", () => {
    render(<FieldShell title="Update site progress" backHref="/m/t/p" backLabel="Field entry" tenantId="t" projectId="p" current="siteUpdate"><p>body</p></FieldShell>);
    expect(tabs().slice(0, 3)).toEqual([["Field entry", "/m/t/p", null], ["Update site progress", "/m/t/p/site-update", "page"], ["Progress update", "/m/t/p/progress", null]]);
  });
  it("NEGATIVE: a screen the person may not open has no tab — the site update, the daily report, the field entry", () => {
    h.denied = new Set(["siteUpdate", "dailyReport", "fieldEntry"]);
    render(<FieldShell title="QC receipt" backHref="/m/t/p" backLabel="Field entry" tenantId="t" projectId="p" current="qc"><p>body</p></FieldShell>);
    const labels = tabs().map(([label]) => label);
    expect(labels).not.toContain("Update site progress");
    expect(labels).not.toContain("Daily report");
    expect(labels).not.toContain("Field entry");
    expect(labels).toContain("QC receipt");
  });
});

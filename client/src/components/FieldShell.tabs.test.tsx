// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-36 (step 5): one frame for every field screen — the ways between them include the field entry and the site update, each only for whoever may open it.
const h = vi.hoisted(() => ({ denied: new Set<string>() }));
// Q-67 (5): the field bar's villa list reads pmc.progressPicker; these tests keep the typed number it falls back to
vi.mock("@/components/UnitJump", () => ({ UnitJump: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/", () => undefined] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false, isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCanPage: (page: string) => !h.denied.has(page) }));
import { FieldShell } from "./FieldShell";

beforeEach(() => { h.denied = new Set(); });
afterEach(() => cleanup());
const tabs = () => Array.from(document.querySelectorAll("nav a")).map(a => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")]);

describe("FieldShell ways between the field screens (Q-36 5)", () => {
  it("POSITIVE: the field entry is a field screen too, the open one marked; Q-70 (5): one progress screen — the old site update is not in the bar", () => {
    render(<FieldShell title="Progress update" backHref="/m/t/p" backLabel="Field entry" tenantId="t" projectId="p" current="progress"><p>body</p></FieldShell>);
    expect(tabs().slice(0, 2)).toEqual([["Field entry", "/m/t/p", null], ["Progress update", "/m/t/p/progress", "page"]]);
    expect(tabs().some(([, href]) => href === "/m/t/p/site-update")).toBe(false);
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

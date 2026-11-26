// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-36 (step 3 c): ONE entry for every import — each kind of file sent where it is imported, each card only for whoever may open that page.
const h = vi.hoisted(() => ({ allowed: new Set<string>(), language: "en" as "ar" | "en" | "ur" }));
vi.mock("@/components/ProjectWorkbookPanel", () => ({ ProjectWorkbookPanel: () => null, ProjectWorkbookDownload: () => null })); // Q-51: tested in its own file
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: h.language, isArabic: h.language === "ar", isRtl: h.language !== "en", setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ useCanPage: (page: string) => h.allowed.has(page) }));
import ProjectImportHub from "./ProjectImportHub";

beforeEach(() => { h.allowed = new Set(["controls", "pmc", "baseline"]); h.language = "en"; });
afterEach(() => cleanup());
const cards = () => Array.from(document.querySelectorAll("[data-import-card]")).map(li => [li.getAttribute("data-import-card"), li.querySelector("a")!.getAttribute("href")]);

describe("ProjectImportHub (Q-36 3 c)", () => {
  it("POSITIVE (Q-56 1): each kind of file opens the import of its own kind — no two cards share an address", () => {
    render(<ProjectImportHub />);
    expect(document.querySelector("h1")!.textContent).toBe("Import");
    expect(cards()).toEqual([
      ["programme", "/projects/t/p/import/programme"], ["operational", "/projects/t/p/import/operational"],
      ["reference", "/projects/t/p/import/reference"], ["masterPlan", "/projects/t/p/import/master-plan"],
      ["pmc", "/projects/t/p/pmc?tab=import"], ["baseline", "/projects/t/p/baseline"],
    ]);
    const hrefs = cards().map(([, href]) => href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it("NEGATIVE: a card whose page the person may not open is not drawn; with none, one line says so", () => {
    h.allowed = new Set(["pmc"]);
    render(<ProjectImportHub />);
    expect(cards().map(([key]) => key)).toEqual(["pmc"]);
    cleanup(); h.allowed = new Set();
    render(<ProjectImportHub />);
    expect(document.querySelector("[data-import-cards]")).toBeNull();
    expect(document.querySelector("[role=note]")!.textContent).toContain("You may not open any of this project's import pages");
  });
  it("Arabic and Urdu: the page's own name and each card's text", () => {
    h.language = "ar";
    render(<ProjectImportHub />);
    expect(document.querySelector("h1")!.textContent).toBe("الاستيراد");
    expect(document.querySelector('[data-import-card="pmc"]')!.textContent).toContain("ملفات PMC");
    cleanup(); h.language = "ur";
    render(<ProjectImportHub />);
    expect(document.querySelector("h1")!.textContent).toBe("درآمد");
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-56 (1): each kind of import on its own page — the master plan card opens the drawing upload, never the labour list.
const h = vi.hoisted(() => ({ kind: "master-plan" }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p", kind: h.kind }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false }) }));
vi.mock("@/components/P6ImportCard", () => ({ P6ImportCard: () => <div data-screen="p6-import" /> }));
vi.mock("./ProjectImports", () => ({ ProjectImports: () => <div data-screen="programme" /> }));
vi.mock("./ProjectOperationalImports", () => ({ ProjectOperationalImports: () => <div data-screen="operational" /> }));
vi.mock("./ProjectReferenceLists", () => ({ ProjectReferenceLists: () => <div data-screen="reference" /> }));
vi.mock("./ProjectMasterPlan", () => ({ ProjectMasterPlan: () => <div data-screen="master-plan" /> }));
vi.mock("@/components/MasterPlanDrawing", () => ({ MasterPlanDrawing: () => <div data-screen="master-plan-drawing" /> }));

import ProjectImportKind from "./ProjectImportKind";

afterEach(() => { cleanup(); h.kind = "master-plan"; });
const screens = () => Array.from(document.querySelectorAll("[data-screen]")).map(node => node.getAttribute("data-screen"));

describe("ProjectImportKind (Q-56 1)", () => {
  it("POSITIVE: each kind shows its own import screen and title, and nothing else", () => {
    for (const [kind, expected, title] of [
      ["master-plan", ["master-plan-drawing", "master-plan"], "Master plan drawing"], ["reference", ["reference"], "reference lists"],
      ["operational", ["operational"], "operational data"], ["programme", ["p6-import", "programme"], "programme and cost"],
    ] as const) {
      h.kind = kind; render(<ProjectImportKind />);
      expect(screens(), kind).toEqual(expected);
      expect(document.querySelector("h1")!.textContent).toContain(title);
      expect(document.querySelector('a[href="/projects/t/p/import"]')).not.toBeNull();
      cleanup();
    }
  });
  it("NEGATIVE: an unknown kind shows no import screen (never the first one by default)", () => {
    h.kind = "labour"; render(<ProjectImportKind />);
    expect(screens()).toEqual([]);
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// D-20 (G-144/G-160/G-161/G-163): the project pages and their links follow the signed-in person's permissions. Presentation only: the server stays the judge.
const h = vi.hoisted(() => ({ summary: null as unknown }));
// Q-67 (5): the field bar's villa list reads pmc.progressPicker; these tests keep the typed number it falls back to
vi.mock("@/components/UnitJump", () => ({ UnitJump: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/contexts/optionalLanguage", () => ({ useOptionalLanguage: () => "en" }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/", () => undefined] }));
vi.mock("@/lib/trpc", () => ({ trpc: { accessSummary: { mine: { useQuery: () => ({ data: h.summary, error: null }) } } } }));

import { PageGate, PermissionProvider } from "./permissions";
import type { PageKey } from "@shared/pageAccess";
import { ProjectPageLink } from "@/components/ProjectPageLink";
afterEach(() => cleanup());
const summary = (permissions: string[], scopes = [{ scopeType: "project", scopeId: "p1" }]) => ({ member: true, permissions, products: ["PROJECT"], scopes });
const page = (key: PageKey) => render(<PermissionProvider tenantId="t1"><PageGate page={key} projectId="p1"><h1>{`${key} page`}</h1></PageGate></PermissionProvider>);

describe("PageGate: a project page opened by its address", () => {
  for (const [key, holds] of [["team", "project.team.invite"], ["pmc", "project.pmc.read"], ["baseline", "project.read"]] as const) {
    it(`${key}: with ${holds} the page opens; without it, the translated «no permission» page (not a blank, not an error)`, () => {
      h.summary = summary([holds]);
      page(key);
      expect(screen.getByRole("heading", { name: `${key} page` })).toBeTruthy();
      cleanup();
      h.summary = summary(["project.field.manage"]);
      const { container } = page(key);
      expect(screen.queryByRole("heading", { name: `${key} page` })).toBeNull();
      expect(container.querySelector("[data-page-gate='denied']")).not.toBeNull();
      expect(container.textContent).toContain("You do not have the permission needed to view this screen.");
    });
  }
  it("a permission held on another project does not open this one", () => {
    h.summary = summary(["project.pmc.read"], [{ scopeType: "project", scopeId: "p2" }]);
    const { container } = page("pmc");
    expect(container.querySelector("[data-page-gate='denied']")).not.toBeNull();
  });
});

describe("ProjectPageLink: the «Project pages» links", () => {
  it("a link is drawn only for whoever holds what its page needs; the guide needs nothing", () => {
    h.summary = summary(["project.pmc.read"]);
    const { container } = render(<PermissionProvider tenantId="t1">{(["pmc", "team", "profitability", "guide"] as const).map(path => <ProjectPageLink key={path} tenantId="t1" projectId="p1" path={path} label={path} />)}</PermissionProvider>);
    expect(Array.from(container.querySelectorAll("[data-project-page]")).map(link => link.getAttribute("data-project-page"))).toEqual(["pmc", "guide"]);
  });
});

// Q-33 (P0-04): the gates added for the pages the server refuses to roles that were shown them, and the field screens' tabs and ways back.
import { FieldShell } from "@/components/FieldShell";
const shell = (backHref: string) => render(<PermissionProvider tenantId="t1"><FieldShell title="Field" backHref={backHref} backLabel="Back" tenantId="t1" projectId="p1"><p>body</p></FieldShell></PermissionProvider>);

describe("Q-33: pages and links follow what the server answers", () => {
  it("the controls page and the field entry open with project.read; the project manager's own powers (no project.read) get the «no permission» page", () => {
    for (const key of ["controls", "fieldEntry"] as const) {
      h.summary = summary(["project.read"]);
      page(key);
      expect(screen.getByRole("heading", { name: `${key} page` })).toBeTruthy();
      cleanup();
      h.summary = summary(["project.manage", "project.material.request", "project.pmc.read"]);
      const { container } = page(key);
      expect(container.querySelector("[data-page-gate='denied']")).not.toBeNull();
      cleanup();
    }
  });

  it("the quality page needs all three of its reads: project.read and project.pmc.read; either alone is refused", () => {
    h.summary = summary(["project.read", "project.pmc.read"]);
    page("quality");
    expect(screen.getByRole("heading", { name: "quality page" })).toBeTruthy();
    for (const holds of [["project.read"], ["project.pmc.read", "project.field.manage"]]) {
      cleanup();
      h.summary = summary(holds);
      const { container } = page("quality");
      expect(container.querySelector("[data-page-gate='denied']")).not.toBeNull();
    }
  });

  it("the baseline gate no longer lets project.create through (the server's read does not accept it)", () => {
    h.summary = summary(["project.create"]);
    const { container } = page("baseline");
    expect(container.querySelector("[data-page-gate='denied']")).not.toBeNull();
  });

  it("field tabs: a viewer (project.read alone) is not offered progress, QC or quality; a site engineer is", () => {
    h.summary = summary(["project.read"]);
    shell("/m/t1/p1");
    expect(screen.queryByRole("link", { name: "Progress update" })).toBeNull();
    expect(screen.queryByRole("link", { name: "QC receipt" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Quality" })).toBeNull();
    expect(screen.getByRole("link", { name: "Daily report" })).toBeTruthy();
    cleanup();
    h.summary = summary(["project.read", "project.pmc.read", "project.field.manage"]);
    shell("/m/t1/p1");
    for (const name of ["Progress update", "QC receipt", "Quality"]) expect(screen.getByRole("link", { name })).toBeTruthy();
  });

  it("the way back is drawn only to a page the person can open: the project manager on a field screen gets no link to the field entry or the controls page", () => {
    h.summary = summary(["project.manage", "project.pmc.read"]);
    shell("/m/t1/p1");
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
    cleanup();
    shell("/projects/t1/p1/controls");
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
    cleanup();
    shell("/projects/t1/p1/pmc");
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
  });
});

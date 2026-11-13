// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// D-20 (G-144/G-160/G-161/G-163): the project pages and their links follow the signed-in person's permissions. Presentation only: the server stays the judge.
const h = vi.hoisted(() => ({ summary: null as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/contexts/optionalLanguage", () => ({ useOptionalLanguage: () => "en" }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/trpc", () => ({ trpc: { accessSummary: { mine: { useQuery: () => ({ data: h.summary, error: null }) } } } }));

import { PageGate, PermissionProvider, PROJECT_PAGE_PERMISSIONS } from "./permissions";
import { ProjectPageLink } from "@/components/ProjectPageLink";
afterEach(() => cleanup());
const summary = (permissions: string[], scopes = [{ scopeType: "project", scopeId: "p1" }]) => ({ member: true, permissions, products: ["PROJECT"], scopes });
const page = (key: keyof typeof PROJECT_PAGE_PERMISSIONS) => render(<PermissionProvider tenantId="t1"><PageGate permission={PROJECT_PAGE_PERMISSIONS[key]} projectId="p1"><h1>{`${key} page`}</h1></PageGate></PermissionProvider>);

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

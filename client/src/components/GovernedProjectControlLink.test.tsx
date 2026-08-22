/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernedProjectControlLink } from "./GovernedProjectControlLink";

const state = vi.hoisted(() => ({ isArabic: false, items: [] as Array<{ id: string; href: string }> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { navigation: { get: { useQuery: () => ({ data: state.items }) } } } }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));

afterEach(() => cleanup());

describe("GovernedProjectControlLink", () => {
  it("renders the direct project path only when server-authorized navigation returns it", () => {
    state.items = [{ id: "project-controls", href: "/projects/tenant-a/project-a/controls" }];
    render(<GovernedProjectControlLink tenantId="tenant-a" projectId="project-a" />);
    expect(screen.getByRole("link", { name: "Open project command center" }).getAttribute("href")).toBe("/projects/tenant-a/project-a/controls");
  });

  it("does not render an optimistic project path for a non-authorized account", () => {
    state.items = [];
    render(<GovernedProjectControlLink tenantId="tenant-a" projectId="project-a" />);
    expect(screen.queryByRole("link", { name: "Open project command center" })).toBeNull();
  });
});

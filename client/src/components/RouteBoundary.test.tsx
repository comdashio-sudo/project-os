/** @vitest-environment jsdom */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteBoundary } from "./RouteBoundary";

const state = vi.hoisted(() => ({ arabic: false, location: "/a", explode: true }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>, useLocation: () => [state.location] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
function Page() { if (state.explode) throw new Error("page exploded"); return <p>page ok</p>; }

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); state.arabic = false; state.location = "/a"; state.explode = true; });

describe("RouteBoundary (G-100)", () => {
  it("lets a healthy page through untouched", () => {
    state.explode = false;
    render(<RouteBoundary><Page /></RouteBoundary>);
    expect(screen.getByText("page ok")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("contains a page that fails to render: says so, offers the way out, and tries again on request", () => {
    render(<RouteBoundary><Page /></RouteBoundary>);
    expect(screen.getByRole("alert").textContent).toContain("This page could not be shown");
    expect(screen.getByText("Back to the workspace").getAttribute("href")).toBe("/");
    state.explode = false; // the cause is gone
    fireEvent.click(screen.getByText("Try again"));
    expect(screen.getByText("page ok")).toBeTruthy();
  });
  it("reports only the error name to the console, never its message (a message can carry data)", () => {
    render(<RouteBoundary><Page /></RouteBoundary>);
    const calls = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[0] === "[Route] render failed");
    expect(calls).toEqual([["[Route] render failed", "Error"]]);
  });
  it("starts clean when the person moves to another page", () => {
    const view = render(<RouteBoundary><Page /></RouteBoundary>);
    expect(screen.getByRole("alert")).toBeTruthy();
    state.explode = false; state.location = "/b";
    view.rerender(<RouteBoundary><Page /></RouteBoundary>);
    expect(screen.getByText("page ok")).toBeTruthy();
  });
  it("speaks Arabic right to left when the language is Arabic", () => {
    state.arabic = true;
    render(<RouteBoundary><Page /></RouteBoundary>);
    expect(screen.getByRole("alert").getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("تعذّر عرض هذه الصفحة")).toBeTruthy();
  });
});

describe("every signed-in page goes through the boundary", () => {
  const app = readFileSync(join(__dirname, "..", "App.tsx"), "utf8");
  it("wraps the page in RouteBoundary inside the one withAuth that all signed-in routes use", () => {
    expect(app).toMatch(/<RequireAuth><RouteBoundary><Component \{\.\.\.props\} \/><\/RouteBoundary><\/RequireAuth>/);
  });
  it("routes every page except the public ones through withAuth", () => {
    const routed = Array.from(app.matchAll(/<Route path="[^"]*" component=\{(\w+)\}/g)).map(match => match[1]);
    const publicPages = new Set(["Home", "Login", "NotFound", "AcceptInvitation"]);
    expect(routed.length).toBeGreaterThan(15);
    const unprotected = routed.filter(name => !publicPages.has(name) && !new RegExp(`const ${name} = withAuth\\(`).test(app));
    expect(unprotected).toEqual([]);
  });
});

/** @vitest-environment jsdom */
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteBoundary } from "./RouteBoundary";

const state = vi.hoisted(() => ({ arabic: false, location: "/a", explode: true }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a>, useLocation: () => [state.location] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
const reload = vi.hoisted(() => ({ calls: 0, failure: null as Error | null }));
function Page() { if (reload.failure) throw reload.failure; if (state.explode) throw new Error("page exploded"); return <p>page ok</p>; }
const sent: Array<{ url: string; body: { json: Record<string, unknown> } }> = [];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  sent.length = 0; reload.calls = 0; reload.failure = null; window.sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { sent.push({ url, body: JSON.parse(String(init.body)) }); return new Response("{}"); }));
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, pathname: "/projects/t/p/baseline", reload: () => { reload.calls += 1; } } });
});
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
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 2)).toEqual(["[Route] render failed", "Error"]);
    expect(calls[0][2]).toMatch(/^R-[A-Z0-9]{5}$/);
    expect(JSON.stringify(calls)).not.toContain("page exploded");
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
    // The page may sit inside ProductShell (the one frame for company screens); the boundary still wraps the whole of it.
    expect(app).toMatch(/<RequireAuth><PermissionProvider tenantId=\{props\.params\?\.tenantId\}><RouteBoundary>[\s\S]*<Component \{\.\.\.props\} \/>[\s\S]*<\/RouteBoundary><\/PermissionProvider><\/RequireAuth>/);
  });
  it("routes every page except the public ones through withAuth", () => {
    const routed = Array.from(app.matchAll(/<Route path="[^"]*" component=\{(\w+)\}/g)).map(match => match[1]);
    const publicPages = new Set(["Home", "Login", "NotFound", "AcceptInvitation"]);
    expect(routed.length).toBeGreaterThan(15);
    const unprotected = routed.filter(name => !publicPages.has(name) && !new RegExp(`const ${name} = withAuth\\(`).test(app));
    expect(unprotected).toEqual([]);
  });
});

describe("Q-56 (7): the error screen's code, and a page opened before a new release", () => {
  const chunkError = () => Object.assign(new TypeError("Failed to fetch dynamically imported module: /assets/ProjectBaseline-OLDHASH.js"), {});
  it("shows a short code and sends the same code, the error's name and the path — never the message — to the server", () => {
    render(<RouteBoundary><Page /></RouteBoundary>);
    const code = document.querySelector("[data-failure-code]")?.textContent ?? "";
    expect(code).toMatch(/^R-[A-Z0-9]{5}$/);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/trpc/diagnostics.renderFailed");
    expect(sent[0].body.json).toEqual({ code, errorName: "Error", route: "/projects/t/p/baseline", chunk: false });
    expect(JSON.stringify(sent)).not.toContain("page exploded");
    expect(reload.calls).toBe(0); // an ordinary render failure never reloads
  });
  it("a removed code file (the old release's name) reloads the page once and says an update was released, instead of the error screen", () => {
    reload.failure = chunkError();
    render(<RouteBoundary><Page /></RouteBoundary>);
    expect(reload.calls).toBe(1);
    expect(document.querySelector("[data-release-reload]")?.textContent).toContain("new version");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(sent[0].body.json.chunk).toBe(true);
  });
  it("NEGATIVE: the same failure again within the minute does not reload again (no loop) and shows the error screen with its code", () => {
    reload.failure = chunkError();
    render(<RouteBoundary><Page /></RouteBoundary>);
    cleanup();
    render(<RouteBoundary><Page /></RouteBoundary>);
    expect(reload.calls).toBe(1);
    expect(screen.getByRole("alert").textContent).toContain("This page could not be shown");
    expect(document.querySelector("[data-failure-code]")?.textContent).toMatch(/^R-/);
  });
});

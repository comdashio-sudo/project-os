/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

const SECRET = "Sup3rS3cretPassw0rd someone.private@example.test";
function Bomb(): React.ReactElement { throw new Error(`failed for ${SECRET}`); }

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("the app-wide error boundary", () => {
  it("lets a healthy app through", () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText("fine")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says what happened in Arabic first and English after it, and offers a reload", () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("dir")).toBe("rtl");
    expect(alert.textContent).toContain("حدث خطأ غير متوقع");
    expect(alert.textContent).toContain("An unexpected error occurred");
    expect(screen.getByRole("button").textContent).toContain("إعادة تحميل الصفحة");
  });

  it("never shows the stack or the message of the failure (a message can carry data; before, the whole stack was printed on screen)", () => {
    const view = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(view.container.textContent).not.toContain("Sup3rS3cretPassw0rd");
    expect(view.container.textContent).not.toContain("someone.private");
    expect(view.container.textContent).not.toMatch(/\bat \w+.*:\d+:\d+/);
    expect(view.container.querySelector("pre")).toBeNull();
  });

  it("reports only the error's name to the console", () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    const own = (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(call => call[0] === "[App] render failed");
    expect(own).toEqual([["[App] render failed", "Error", expect.stringMatching(/^R-[A-Z0-9]{5}$/)]]); // the name and the short code, never the message
  });

  it("Q-68 (1): the last-resort screen shows a short code the person can read out, and the server is told the same code (by name only, never the message)", () => {
    const sent: Array<{ url: string; body: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { body?: string }) => { sent.push({ url, body: String(init?.body ?? "") }); return new Response("{}"); }));
    const view = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    const shown = view.container.querySelector("[data-failure-code]")!.textContent!;
    expect(shown).toMatch(/^R-[A-Z0-9]{5}$/);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain("diagnostics.renderFailed");
    expect(JSON.parse(sent[0].body).json).toMatchObject({ code: shown, errorName: "Error" });
    expect(sent[0].body).not.toContain("Sup3rS3cretPassw0rd"); // the message of the failure never leaves the browser
    vi.unstubAllGlobals();
  });
});

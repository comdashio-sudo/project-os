/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isArabic: false, assign: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: () => <span>Dashio</span> }));

import Login from "./Login";

type Reply = { ok: boolean; status?: number; body?: unknown };
function stubFetch(routes: Record<string, Reply | ((body: unknown) => Reply)>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const route = routes[url];
    const reply = typeof route === "function" ? route(body) : route ?? { ok: false, status: 404 };
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status ?? (reply.ok ? 200 : 400) });
  }));
  return calls;
}
const setUrl = (search: string) => window.history.replaceState({}, "", `/login${search}`);

beforeEach(() => {
  cleanup();
  state.isArabic = false;
  state.assign.mockReset();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "", assign: state.assign } });
});
afterEach(() => { vi.unstubAllGlobals(); });

function withSearch(search: string) {
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search, assign: state.assign } });
}

describe("login page", () => {
  it("asks for the address, then the code, then goes where the visitor was heading", async () => {
    const calls = stubFetch({ "/api/auth/config": { ok: true, body: { google: false } }, "/api/auth/email/request": { ok: true, body: { ok: true } }, "/api/auth/email/verify": { ok: true, body: { ok: true } } });
    withSearch("?next=%2Fpmo%2Ftenant-a");
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("E-mail address"), "engineer@example.test");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText("Sign-in code"), "424242");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(state.assign).toHaveBeenCalledWith("/pmo/tenant-a"));
    expect(calls.filter(c => c.url.includes("/email/"))).toEqual([
      { url: "/api/auth/email/request", body: { email: "engineer@example.test" } },
      { url: "/api/auth/email/verify", body: { email: "engineer@example.test", code: "424242" } },
    ]);
  });

  it("will not follow a next target that leaves the site", async () => {
    stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/request": { ok: true }, "/api/auth/email/verify": { ok: true } });
    withSearch("?next=%2F%2Fevil.example");
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("E-mail address"), "engineer@example.test");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    await user.type(await screen.findByLabelText("Sign-in code"), "111111");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(state.assign).toHaveBeenCalledWith("/"));
  });

  it("keeps only digits, enables the button at six and shows one localized error for a wrong code", async () => {
    stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/request": { ok: true }, "/api/auth/email/verify": { ok: false, status: 401, body: { code: "PROJECT_OS_AUTH_CODE_INVALID" } } });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("E-mail address"), "engineer@example.test");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    const input = await screen.findByLabelText("Sign-in code");
    await user.type(input, "12a34");
    expect((input as HTMLInputElement).value).toBe("1234");
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(input, "56");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The code is wrong or has expired.");
    expect(state.assign).not.toHaveBeenCalled();
  });

  it("explains rate limiting and an unavailable mailer in Arabic", async () => {
    state.isArabic = true;
    stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/request": { ok: false, status: 429, body: { code: "PROJECT_OS_AUTH_RATE_LIMITED" } } });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("البريد الإلكتروني"), "engineer@example.test");
    await user.click(screen.getByRole("button", { name: "إرسال الرمز" }));
    expect((await screen.findByRole("alert")).textContent).toBe("محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.");
  });

  it("offers Google only when the server says it is configured, and carries the next target", async () => {
    stubFetch({ "/api/auth/config": { ok: true, body: { google: true } } });
    withSearch("?next=%2Fprofile");
    render(<Login />);
    const link = (await screen.findByRole("link", { name: "Continue with Google" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/api/auth/google/start?next=%2Fprofile");
  });

  it("does not show a Google link by default, and reports a failed Google return", async () => {
    stubFetch({ "/api/auth/config": { ok: true, body: { google: false } } });
    withSearch("?error=google_unverified");
    render(<Login />);
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toBe("That Google account's e-mail is not verified.");
  });
});

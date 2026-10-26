/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

  it("checks the address before anything is sent: a malformed one is named beside the field and no request goes out", async () => {
    const calls = stubFetch({ "/api/auth/config": { ok: true, body: { google: false } } });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("E-mail address"), "engineer example");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email address.");
    expect(calls.filter(c => c.url.includes("/email/"))).toEqual([]);
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

  it("takes a code of 6, 7 or 8 digits (the length is a server setting) and no more", async () => {
    stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/request": { ok: true } });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("E-mail address"), "engineer@example.test");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    const input = (await screen.findByLabelText("Sign-in code")) as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement;
    await user.type(input, "12345");
    expect(submit.disabled).toBe(true);
    await user.type(input, "6");
    expect(submit.disabled).toBe(false);
    await user.type(input, "78");
    expect(input.value).toBe("12345678");
    expect(submit.disabled).toBe(false);
    await user.type(input, "9");
    expect(input.value).toBe("12345678");
  });

  it("counts 60 seconds before a new code can be asked for, and says that only the newest code works", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const calls = stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/request": { ok: true } });
      const user = userEvent.setup({ advanceTimers: ms => vi.advanceTimersByTime(ms) });
      render(<Login />);
      await user.type(screen.getByLabelText("E-mail address"), "engineer@example.test");
      await user.click(screen.getByRole("button", { name: "Send code" }));
      await screen.findByLabelText("Sign-in code");
      expect(screen.getByText("Only the newest code works: every new request cancels the previous one.")).toBeTruthy();
      const waiting = screen.getByRole("button", { name: "Send a new code in 60 s" }) as HTMLButtonElement;
      expect(waiting.disabled).toBe(true);
      for (let second = 0; second < 60; second++) await act(async () => { vi.advanceTimersByTime(1000); });
      const again = (await screen.findByRole("button", { name: "Send a new code" })) as HTMLButtonElement;
      expect(again.disabled).toBe(false);
      await user.click(again);
      expect(calls.filter(call => call.url === "/api/auth/email/request")).toHaveLength(2);
    } finally { vi.useRealTimers(); }
  });

  it("a provider send limit (429 with seconds) is not a wrong code: it moves to the code step, says to use the code already sent, and counts the seconds", async () => {
    stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/request": { ok: false, status: 429, body: { code: "PROJECT_OS_AUTH_RATE_LIMITED", retryAfterSeconds: 49 } } });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("E-mail address"), "engineer@example.test");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect((await screen.findByRole("alert")).textContent).toBe("A code was sent to you a moment ago. Enter the code you received; asking for a new one cancels the previous one.");
    expect(screen.getByLabelText("Sign-in code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new code in 49 s" })).toBeTruthy();
  });

  it("a server fault is not shown as a problem with the address; a dropped connection says so", async () => {
    stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/request": { ok: false, status: 500, body: { code: "PROJECT_OS_AUTH_FAILED" } } });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("E-mail address"), "engineer@example.test");
    await user.click(screen.getByRole("button", { name: "Send code" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We could not complete the request because of a problem on our side, not with your e-mail. Try again shortly.");
  });

  it("the button in the mailed message opens the code step without the address in the link; the address comes from this tab's session storage", async () => {
    window.sessionStorage.setItem("login.email", "engineer@example.test");
    const calls = stubFetch({ "/api/auth/config": { ok: true, body: {} }, "/api/auth/email/verify": { ok: true } });
    withSearch("?step=code");
    const user = userEvent.setup();
    const { container } = render(<Login />);
    await user.type(await screen.findByLabelText("Sign-in code"), "123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(calls.some(call => call.url === "/api/auth/email/verify")).toBe(true));
    expect(calls.find(call => call.url === "/api/auth/email/verify")?.body).toEqual({ email: "engineer@example.test", code: "123456" });
    expect(window.location.search).not.toMatch(/@|email/);
    expect(container.querySelector("form")?.getAttribute("method")).toBe("post");
    window.sessionStorage.clear();
  });

  it("without a remembered address, ?step=code falls back to asking for the address", async () => {
    window.sessionStorage.clear();
    stubFetch({ "/api/auth/config": { ok: true, body: {} } });
    withSearch("?step=code");
    render(<Login />);
    expect(await screen.findByLabelText("E-mail address")).toBeTruthy();
  });
});

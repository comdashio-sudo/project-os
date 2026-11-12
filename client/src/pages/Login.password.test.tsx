/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// D-83: the second way in (e-mail and password), «forgot the password», and «set a password» on the profile, on the route contract of #241.
const state = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", assign: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.language === "ar", language: state.language, isRtl: state.language !== "en" }) }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: () => <span>Dashio</span> }));

import Login from "./Login";
import { OwnPasswordCard } from "@/components/auth/OwnPasswordCard";

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
const config = { "/api/auth/config": { ok: true, body: { google: false } } };
const sent = (calls: Array<{ url: string; body: unknown }>, path: string) => calls.filter(call => call.url === path);
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const describedError = (label: RegExp) => { const field = screen.getByLabelText(label); return document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent ?? null; };

beforeEach(() => {
  cleanup(); state.language = "en"; state.assign.mockReset();
  Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, search: "?next=%2Fpmo%2Ft", assign: state.assign } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("sign-in with a password (D-83)", () => {
  it("two equal methods; the e-mail typed in one stays in the other; the password signs in and goes where the visitor was heading", async () => {
    const calls = stubFetch({ ...config, "/api/auth/password/sign-in": { ok: true, body: { ok: true } } });
    render(<Login />);
    expect(screen.getAllByRole("radio").map(tab => tab.textContent)).toEqual(["Code by e-mail", "Password"]);
    type(/^E-mail address/, "engineer@example.test");
    fireEvent.click(screen.getByRole("radio", { name: "Password" }));
    expect((screen.getByLabelText(/^E-mail address/) as HTMLInputElement).value).toBe("engineer@example.test");
    const password = screen.getByLabelText(/^Password/) as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.autocomplete).toBe("current-password");
    type(/^Password/, "correct horse 1");
    fireEvent.click(screen.getByRole("radio", { name: "Code by e-mail" }));
    fireEvent.click(screen.getByRole("radio", { name: "Password" }));
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe("correct horse 1");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(state.assign).toHaveBeenCalledWith("/pmo/t"));
    expect(sent(calls, "/api/auth/password/sign-in")).toEqual([{ url: "/api/auth/password/sign-in", body: { email: "engineer@example.test", password: "correct horse 1" } }]);
    expect(sent(calls, "/api/auth/email/request")).toEqual([]);
  });

  it("a wrong pair is said beside the password field, tied by aria-describedby, with the focus on it; nobody is let in", async () => {
    stubFetch({ ...config, "/api/auth/password/sign-in": { ok: false, status: 401, body: { code: "PROJECT_OS_AUTH_CREDENTIALS_INVALID" } } });
    render(<Login />);
    fireEvent.click(screen.getByRole("radio", { name: "Password" }));
    type(/^E-mail address/, "engineer@example.test"); type(/^Password/, "wrong-one");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(describedError(/^Password/)).toBe("The e-mail address or the password is wrong."));
    expect(document.activeElement).toBe(screen.getByLabelText(/^Password/));
    expect(state.assign).not.toHaveBeenCalled();
  });

  it("an empty password and a malformed address are refused before anything is sent, and the focus goes to the first", () => {
    const calls = stubFetch(config);
    render(<Login />);
    fireEvent.click(screen.getByRole("radio", { name: "Password" }));
    type(/^E-mail address/, "engineer example");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(describedError(/^E-mail address/)).toBe("Enter a valid email address.");
    expect(describedError(/^Password/)).toBe("The e-mail address or the password is wrong.");
    expect(document.activeElement).toBe(screen.getByLabelText(/^E-mail address/));
    expect(sent(calls, "/api/auth/password/sign-in")).toEqual([]);
  });

  it("a locked address says how long the lock lasts", async () => {
    stubFetch({ ...config, "/api/auth/password/sign-in": { ok: false, status: 429, body: { code: "PROJECT_OS_AUTH_RATE_LIMITED", retryAfterSeconds: 900 } } });
    render(<Login />);
    fireEvent.click(screen.getByRole("radio", { name: "Password" }));
    type(/^E-mail address/, "engineer@example.test"); type(/^Password/, "correct horse 1");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(describedError(/^Password/)).toBe("Too many wrong attempts. Try again in 15 min."));
  });
});

describe("forgot the password (D-83)", () => {
  it("mails a code, refuses a short password beside its field without spending the code, says a wrong code beside the code, then signs in", async () => {
    let setReplies: Reply[] = [{ ok: false, status: 401, body: { code: "PROJECT_OS_AUTH_CODE_INVALID" } }, { ok: true, body: { ok: true } }];
    const calls = stubFetch({ ...config, "/api/auth/email/request": { ok: true, body: { ok: true, expiresInSeconds: 900 } }, "/api/auth/password/set": () => setReplies.shift()! });
    render(<Login />);
    fireEvent.click(screen.getByRole("radio", { name: "Password" }));
    type(/^E-mail address/, "engineer@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Forgot the password?" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Set a new password");
    expect((screen.getByLabelText(/^E-mail address/) as HTMLInputElement).value).toBe("engineer@example.test");
    fireEvent.click(screen.getByRole("button", { name: "Send a code" }));
    const code = await screen.findByLabelText(/^The code you received/);
    const fresh = screen.getByLabelText(/^New password/) as HTMLInputElement;
    expect(fresh.autocomplete).toBe("new-password");
    expect(document.getElementById(fresh.getAttribute("aria-describedby")!.split(" ")[0]!)?.textContent).toBe("At least 8 characters.");
    fireEvent.change(code, { target: { value: "123456" } }); fireEvent.change(fresh, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the password and sign in" }));
    expect(screen.getByText("The password is too short or too weak: at least 8 characters.")).toBeTruthy();
    expect(document.activeElement).toBe(fresh);
    expect(sent(calls, "/api/auth/password/set")).toEqual([]);
    fireEvent.change(fresh, { target: { value: "a longer one" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the password and sign in" }));
    await waitFor(() => expect(describedError(/^The code you received/)).toBe("The code is wrong or has expired."));
    fireEvent.change(code, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the password and sign in" }));
    await waitFor(() => expect(state.assign).toHaveBeenCalledWith("/pmo/t"));
    expect(sent(calls, "/api/auth/password/set").map(call => call.body)).toEqual([{ email: "engineer@example.test", code: "123456", password: "a longer one" }, { email: "engineer@example.test", code: "654321", password: "a longer one" }]);
    setReplies = [];
  });

  it("back to sign-in returns to the password form", () => {
    stubFetch(config);
    render(<Login />);
    fireEvent.click(screen.getByRole("radio", { name: "Password" }));
    fireEvent.click(screen.getByRole("button", { name: "Forgot the password?" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to sign-in" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sign in");
    expect(screen.getByLabelText(/^Password/)).toBeTruthy();
  });
});

describe("set a password on the profile (D-83)", () => {
  it("sends the code to the signed-in address only, then saves and says so", async () => {
    const calls = stubFetch({ "/api/auth/email/request": { ok: true, body: { ok: true } }, "/api/auth/password/set": { ok: true, body: { ok: true } } });
    render(<OwnPasswordCard email="pm@example.test" />);
    fireEvent.click(screen.getByRole("button", { name: "Set or change a password" }));
    expect(screen.queryByLabelText(/^E-mail address/)).toBeNull(); // the address is the signed-in one
    fireEvent.click(screen.getByRole("button", { name: "Send a code" }));
    fireEvent.change(await screen.findByLabelText(/^The code you received/), { target: { value: "112233" } });
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "a longer one" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the password and sign in" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("The password is saved. You can sign in with it from now on."));
    expect(calls.map(call => call.body)).toEqual([{ email: "pm@example.test" }, { email: "pm@example.test", code: "112233", password: "a longer one" }]);
  });
});

describe("three languages (D-83)", () => {
  it.each([["ar", "رمز بالبريد", "كلمة المرور", "البريد أو كلمة المرور غير صحيحة."], ["ur", "ای میل پر کوڈ", "پاس ورڈ", "ای میل یا پاس ورڈ غلط ہے۔"]] as const)("%s: the methods and a wrong pair", async (language, byCode, byPassword, wrong) => {
    state.language = language;
    stubFetch({ ...config, "/api/auth/password/sign-in": { ok: false, status: 401, body: { code: "PROJECT_OS_AUTH_CREDENTIALS_INVALID" } } });
    render(<Login />);
    expect(screen.getAllByRole("radio").map(tab => tab.textContent)).toEqual([byCode, byPassword]);
    fireEvent.click(screen.getByRole("radio", { name: byPassword }));
    fireEvent.change(document.querySelector('input[type="email"]')!, { target: { value: "engineer@example.test" } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: "wrong-one" } });
    fireEvent.submit(document.querySelector('form[data-method="password"]')!);
    await waitFor(() => expect(screen.getByText(wrong)).toBeTruthy());
  });
});

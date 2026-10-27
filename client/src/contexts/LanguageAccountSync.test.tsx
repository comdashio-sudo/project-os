/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageToggle } from "@/components/LanguageToggle";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { LanguageAccountSync } from "./LanguageAccountSync";

// Work order 16, item 4 (G-203): the interface language on the account. The account calls are doubles here (the server side is proven on a real
// database in server/userLanguage.database.test.ts); what is proven here is what the screen does with each answer, including a failed call.
const account = vi.hoisted(() => ({
  user: null as null | { id: number },
  fetch: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: account.user }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ languagePreference: { get: { fetch: (...args: unknown[]) => account.fetch(...args) } } }),
    languagePreference: { set: { useMutation: () => ({ mutate: (...args: unknown[]) => account.mutate(...args) }) } },
  },
}));

const KEY = "project-os-language";
const Probe = () => { const { language } = useLanguage(); return <p>lang:{language}</p>; };
const tree = () => <LanguageProvider><LanguageAccountSync><Probe /><LanguageToggle /></LanguageAccountSync></LanguageProvider>;
const mount = () => render(tree());
/** Lets the account's answer (a resolved or rejected promise) reach the screen. */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  account.user = null;
  account.fetch = vi.fn();
  account.mutate = vi.fn();
});
afterEach(() => { cleanup(); });

describe("the interface language follows the person's account", () => {
  it("signed in, when the account has a language, the device uses it and keeps it", async () => {
    localStorage.setItem(KEY, "ur");
    account.user = { id: 7 };
    account.fetch.mockResolvedValue("en");
    mount();
    await waitFor(() => expect(screen.getByText("lang:en")).toBeTruthy());
    expect(localStorage.getItem(KEY)).toBe("en");
    expect(account.mutate).not.toHaveBeenCalled();
  });

  it("signed in, when the account has none, the device's own choice is saved to the account once", async () => {
    localStorage.setItem(KEY, "ur");
    account.user = { id: 7 };
    account.fetch.mockResolvedValue(null);
    const { rerender } = mount();
    await waitFor(() => expect(account.mutate).toHaveBeenCalledTimes(1));
    expect(account.mutate).toHaveBeenCalledWith({ language: "ur" });
    expect(screen.getByText("lang:ur")).toBeTruthy();
    rerender(tree());
    await settle();
    expect(account.mutate).toHaveBeenCalledTimes(1);
  });

  it("signed in, with no choice on the device and none on the account, nothing is saved and Arabic stays", async () => {
    account.user = { id: 7 };
    account.fetch.mockResolvedValue(null);
    mount();
    await waitFor(() => expect(account.fetch).toHaveBeenCalledTimes(1));
    await settle();
    expect(account.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("lang:ar")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("when the account cannot be reached, the device keeps its own choice, nothing is written, and the page still works", async () => {
    localStorage.setItem(KEY, "en");
    account.user = { id: 7 };
    account.fetch.mockRejectedValue(new Error("network down"));
    mount();
    await waitFor(() => expect(account.fetch).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.getByText("lang:en")).toBeTruthy();
    expect(account.mutate).not.toHaveBeenCalled();
    expect(localStorage.getItem(KEY)).toBe("en");
    // The switch still changes the language on this device when the account answer never came.
    act(() => { fireEvent.click(screen.getByRole("button", { name: "اردو" })); });
    expect(screen.getByText("lang:ur")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe("ur");
  });

  it("when the account save fails, the switch still changes the language and keeps the device copy", async () => {
    localStorage.setItem(KEY, "en");
    account.user = { id: 7 };
    account.fetch.mockResolvedValue("en");
    account.mutate.mockImplementation(() => undefined); // a failed save: react-query reports it to onError, which does nothing here
    mount();
    await waitFor(() => expect(screen.getByText("lang:en")).toBeTruthy());
    act(() => { fireEvent.click(screen.getByRole("button", { name: "اردو" })); });
    expect(account.mutate).toHaveBeenCalledWith({ language: "ur" });
    expect(screen.getByText("lang:ur")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe("ur");
  });

  it("signed out, nothing is read from or written to the account, and the switch changes this device only", async () => {
    mount();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "English" })); });
    expect(screen.getByText("lang:en")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe("en");
    await settle();
    expect(account.fetch).not.toHaveBeenCalled();
    expect(account.mutate).not.toHaveBeenCalled();
  });

  it("signed in, the switch saves the choice on the account and keeps the device copy", async () => {
    account.user = { id: 7 };
    account.fetch.mockResolvedValue(null);
    mount();
    await waitFor(() => expect(account.fetch).toHaveBeenCalledTimes(1));
    await settle();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "English" })); });
    expect(account.mutate).toHaveBeenCalledTimes(1);
    expect(account.mutate).toHaveBeenCalledWith({ language: "en" });
    expect(localStorage.getItem(KEY)).toBe("en");
  });

  it("a choice made while the sign-in is still being answered is not overwritten by the account's older value", async () => {
    account.user = { id: 7 };
    let answer: (value: unknown) => void = () => undefined;
    account.fetch.mockReturnValue(new Promise(resolve => { answer = resolve; }));
    mount();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "اردو" })); });
    await act(async () => { answer("en"); });
    await settle();
    expect(screen.getByText("lang:ur")).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe("ur");
    expect(account.mutate).toHaveBeenCalledWith({ language: "ur" });
  });

  it("an address that names a language (?lang=) is not overridden by the account", async () => {
    window.history.replaceState({}, "", "/?lang=ur");
    account.user = { id: 7 };
    account.fetch.mockResolvedValue("en");
    mount();
    await waitFor(() => expect(account.fetch).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.getByText("lang:ur")).toBeTruthy();
    expect(account.mutate).not.toHaveBeenCalled();
  });

  it("the account is read once for a sign-in, not on every render", async () => {
    account.user = { id: 7 };
    account.fetch.mockResolvedValue(null);
    const { rerender } = mount();
    rerender(tree());
    rerender(tree());
    await settle();
    expect(account.fetch).toHaveBeenCalledTimes(1);
  });
});

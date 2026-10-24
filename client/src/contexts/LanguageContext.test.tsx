/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageToggle } from "@/components/LanguageToggle";
import { LanguageProvider, useLanguage } from "./LanguageContext";
import { AccountLanguageProvider } from "./accountLanguage";

const Probe = () => { const { language, isArabic, isRtl } = useLanguage(); return <p>{language}:{String(isArabic)}:{String(isRtl)}</p>; };
const visit = (search = "") => { window.history.replaceState({}, "", `/${search}`); render(<LanguageProvider><Probe /></LanguageProvider>); };

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("the interface language (three languages: Arabic, English, Urdu)", () => {
  it("opens in Arabic, right-to-left, for someone who has never chosen", () => {
    visit();
    expect(screen.getByText("ar:true:true")).toBeTruthy();
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("English is left-to-right; Arabic and Urdu are right-to-left", () => {
    localStorage.setItem("project-os-language", "en");
    visit();
    expect(screen.getByText("en:false:false")).toBeTruthy();
    expect(document.documentElement.dir).toBe("ltr");
    cleanup(); localStorage.setItem("project-os-language", "ur");
    visit();
    expect(screen.getByText("ur:false:true")).toBeTruthy();
    expect(document.documentElement.lang).toBe("ur");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("an explicit ?lang= on the address wins over what is stored, for each of the three", () => {
    localStorage.setItem("project-os-language", "ar");
    visit("?lang=ur");
    expect(screen.getByText("ur:false:true")).toBeTruthy();
    cleanup();
    visit("?lang=en");
    expect(screen.getByText("en:false:false")).toBeTruthy();
  });

  it("an unknown stored value, or an unknown ?lang=, falls back to Arabic, not English", () => {
    localStorage.setItem("project-os-language", "fr");
    visit("?lang=de");
    expect(screen.getByText("ar:true:true")).toBeTruthy();
  });

  it("still opens in Arabic when the browser blocks storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    visit();
    expect(screen.getByText("ar:true:true")).toBeTruthy();
  });

  it("the switch offers the three languages, marks the current one, and saves the choice on this device", () => {
    window.history.replaceState({}, "", "/");
    render(<LanguageProvider><Probe /><LanguageToggle /></LanguageProvider>);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map(button => button.textContent)).toEqual(["العربية", "English", "اردو"]);
    expect(screen.getByRole("button", { name: "العربية" }).getAttribute("aria-pressed")).toBe("true");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "اردو" })); });
    expect(screen.getByText("ur:false:true")).toBeTruthy();
    expect(document.documentElement.lang).toBe("ur");
    expect(localStorage.getItem("project-os-language")).toBe("ur");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "English" })); });
    expect(document.documentElement.dir).toBe("ltr");
    expect(localStorage.getItem("project-os-language")).toBe("en");
  });

  it("signed out, the switch says the choice is kept on this device, and that signing in keeps it on the account", () => {
    render(<LanguageProvider><LanguageToggle showNote /></LanguageProvider>);
    expect(screen.getByText("تُحفظ اللغة على هذا الجهاز. سجّل الدخول لتتبعك في أي جهاز.")).toBeTruthy();
  });

  it("signed in, the switch says the choice is kept on the account, and saves it there", () => {
    const save = vi.fn();
    render(<LanguageProvider><Probe /><AccountLanguageProvider value={{ signedIn: true, save }}><LanguageToggle showNote /></AccountLanguageProvider></LanguageProvider>);
    expect(screen.getByText("تُحفظ اللغة في حسابك، فتتبعك إلى أي جهاز.")).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "English" })); });
    expect(screen.getByText("en:false:false")).toBeTruthy();
    expect(localStorage.getItem("project-os-language")).toBe("en");
    expect(save).toHaveBeenCalledWith("en");
  });

  it("nothing is written to this device when the page opens; only a choice is written", () => {
    visit();
    expect(localStorage.getItem("project-os-language")).toBeNull();
    cleanup();
    localStorage.setItem("project-os-language", "en");
    visit("?lang=ur");
    expect(localStorage.getItem("project-os-language")).toBe("en");
  });
});

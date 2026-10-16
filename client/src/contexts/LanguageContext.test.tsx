/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, useLanguage } from "./LanguageContext";

const Probe = () => { const { language, isArabic } = useLanguage(); return <p>{language}:{String(isArabic)}</p>; };
const visit = (search = "") => { window.history.replaceState({}, "", `/${search}`); render(<LanguageProvider><Probe /></LanguageProvider>); };

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("the interface language", () => {
  it("opens in Arabic, right-to-left, for someone who has never chosen", () => {
    visit();
    expect(screen.getByText("ar:true")).toBeTruthy();
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("keeps English for the person who chose it, and Arabic for the person who chose that", () => {
    localStorage.setItem("project-os-language", "en");
    visit();
    expect(screen.getByText("en:false")).toBeTruthy();
    expect(document.documentElement.dir).toBe("ltr");
    cleanup(); localStorage.setItem("project-os-language", "ar");
    visit();
    expect(screen.getByText("ar:true")).toBeTruthy();
  });

  it("an explicit ?lang= on the address wins over what is stored", () => {
    localStorage.setItem("project-os-language", "ar");
    visit("?lang=en");
    expect(screen.getByText("en:false")).toBeTruthy();
  });

  it("an unknown stored value falls back to Arabic, not English", () => {
    localStorage.setItem("project-os-language", "fr");
    visit();
    expect(screen.getByText("ar:true")).toBeTruthy();
  });

  it("still opens in Arabic when the browser blocks storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    visit();
    expect(screen.getByText("ar:true")).toBeTruthy();
  });
});

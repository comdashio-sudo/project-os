// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DirectionProvider, INTRO_MAX_CHARS, type DirectionId } from "@/components/ds";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ImportScreen } from "./ImportScreen";
import { SetupWizardScreen } from "./SetupWizardScreen";

// The two redrawn screens, in every direction and every language: the rules of work order 19 held on what is RENDERED (the lesson of the other platform: a check on the source
// misses what a dictionary or a formatter prints). Western digits only; one line of explanation; no native select; no browser file-input wording; the custom parts present.
beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });

const screens = { setup: SetupWizardScreen, import: ImportScreen } as const;
const combos = (["a", "b", "c"] as DirectionId[]).flatMap(direction => (["ar", "en", "ur"] as const).flatMap(lang => (["setup", "import"] as const).map(screen => [direction, lang, screen] as const)));

describe.each(combos)("direction %s, language %s, screen %s", (direction, lang, screen) => {
  const mount = () => {
    window.history.replaceState({}, "", `/?lang=${lang}`);
    const Screen = screens[screen];
    return render(<LanguageProvider><DirectionProvider direction={direction}><Screen /></DirectionProvider></LanguageProvider>);
  };
  it("prints Arabic-Indic and Persian digits nowhere: every figure is 0-9", () => {
    mount();
    expect(document.body.textContent ?? "").not.toMatch(/[٠-٩۰-۹]/);
  });
  it("explains the page in one short line, the rest under 'Learn more'", () => {
    mount();
    const intro = document.querySelector("[data-intro]"); expect(intro).toBeTruthy();
    expect((intro?.textContent ?? "").length).toBeLessThanOrEqual(INTRO_MAX_CHARS);
    expect(document.querySelectorAll("[data-learn-more]").length).toBe(1);
  });
  it("uses no native select and no browser file-input wording; a hidden input exists only inside the dropzone", () => {
    mount();
    expect(document.querySelector("select")).toBeNull();
    expect(document.body.textContent).not.toMatch(/choose file|no file chosen/i);
    const files = Array.from(document.querySelectorAll('input[type="file"]'));
    expect(files.every(input => input.closest("[data-dropzone]"))).toBe(true);
    expect(files.length).toBe(screen === "import" ? 1 : 0);
  });
  it("carries the shell: a logo, a navigation, a breadcrumb trail, the user and language menus", () => {
    mount();
    expect(document.querySelector('[role="img"][aria-label="Dashio"]')).toBeTruthy();
    expect(document.querySelectorAll("nav").length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('[aria-current="page"]')).toBeTruthy();
    expect(document.querySelectorAll("header button[aria-haspopup]").length).toBeGreaterThanOrEqual(2);
  });
  it("lays out right to left for Arabic and Urdu and left to right for English", () => {
    mount();
    expect(document.querySelector("[data-direction]")?.getAttribute("dir")).toBe(lang === "en" ? "ltr" : "rtl");
  });
});

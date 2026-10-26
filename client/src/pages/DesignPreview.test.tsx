// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import DesignPreview from "./DesignPreview";

const state = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Owner", role: state.role }, loading: false, isAuthenticated: true }) }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/design/directions.css", () => ({}));

beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined);
  globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { cleanup(); state.role = "admin"; window.history.replaceState({}, "", "/"); });
const mount = (lang = "en", search = "") => { window.history.replaceState({}, "", `/?lang=${lang}${search}`); return render(<LanguageProvider><DesignPreview /></LanguageProvider>); };

describe("/design-preview", () => {
  it("NEGATIVE: anyone but the platform owner sees a refusal and none of the preview", () => {
    state.role = "user"; mount();
    expect(screen.getByText("This page is for the platform owner only.")).toBeTruthy();
    expect(document.querySelector("[data-direction]")).toBeNull(); expect(screen.queryByText("Components")).toBeNull();
  });
  it("offers the three directions and shows identity, colours, fonts, every component and the two screens in frames of 390 and 1280", () => {
    mount();
    for (const id of ["A", "B", "C"]) expect(screen.getByRole("radio", { name: new RegExp(`^${id} ·`) })).toBeTruthy();
    for (const heading of ["Identity", "Colours", "Typefaces", "Components", "The two screens, on synthetic data"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    for (const heading of ["Buttons", "Fields", "File upload", "Stepper", "Cards", "Tables", "Badges", "Empty states", "Loading skeletons", "Toasts", "Dialogs", "Page intro", "Breadcrumbs"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    const frames = Array.from(document.querySelectorAll("iframe")).map(frame => `${frame.getAttribute("width")}x${frame.getAttribute("height")}`);
    expect(frames.sort()).toEqual(["1280x800", "1280x800", "390x844", "390x844"]);
    expect(Array.from(document.querySelectorAll("iframe")).every(frame => /\/design-preview\/frame\/a\/(setup|import)\?lang=en&mode=light/.test(frame.getAttribute("src") ?? ""))).toBe(true);
  });
  it("switching direction changes the data-direction of the page and the frames' addresses; dark mode is offered only where the direction has it", () => {
    mount();
    fireEvent.click(screen.getByRole("radio", { name: /^B ·/ }));
    expect(document.querySelector("[data-direction]")?.getAttribute("data-direction")).toBe("b");
    expect(Array.from(document.querySelectorAll("iframe")).every(frame => (frame.getAttribute("src") ?? "").includes("/frame/b/"))).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /^Dark/ }));
    expect(document.querySelector("[data-direction]")?.getAttribute("data-mode")).toBe("light"); // B is light only
    fireEvent.click(screen.getByRole("radio", { name: /^C ·/ })); fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.querySelector("[data-direction]")?.getAttribute("data-mode")).toBe("dark");
  });
  it("prints no Arabic-Indic or Persian digit in any of the three languages", () => {
    for (const lang of ["ar", "en", "ur"]) { mount(lang); expect(document.body.textContent ?? "", lang).not.toMatch(/[٠-٩۰-۹]/); cleanup(); }
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import DesignPreviewFrame from "./DesignPreviewFrame";

const state = vi.hoisted(() => ({ role: "admin" as string }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { name: "Owner", role: state.role }, loading: false, isAuthenticated: true }) }));
vi.mock("wouter", () => ({ useParams: () => ({ direction: ":direction", screen: ":screen" }) }));
vi.mock("@/design/directions.css", () => ({}));
beforeAll(() => { globalThis.ResizeObserver = globalThis.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} }; Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false); });
afterEach(() => { cleanup(); state.role = "admin"; window.history.replaceState({}, "", "/"); });
const mount = (lang: string) => { window.history.replaceState({}, "", `/?lang=${lang}`); return render(<LanguageProvider><DesignPreviewFrame /></LanguageProvider>); };

describe("/design-preview/frame", () => {
  it("NEGATIVE: for anyone but the platform owner the page says so in their language (never a blank page: the UI audit walks this route with the placeholders unfilled)", () => {
    state.role = "user";
    for (const [lang, text] of [["ar", "هذه الصفحة لمالك المنصة فقط."], ["en", "This page is for the platform owner only."], ["ur", "یہ صفحہ صرف پلیٹ فارم کے مالک کے لیے ہے۔"]] as const) { mount(lang); expect(screen.getByText(text)).toBeTruthy(); cleanup(); }
  });
  it("for the owner an unknown direction or screen falls back to direction A and the setup screen instead of failing", () => {
    mount("en");
    expect(document.querySelector("[data-direction]")?.getAttribute("data-direction")).toBe("a");
    expect(screen.getByRole("heading", { name: "Setup wizard" })).toBeTruthy();
  });
});

// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { OfflineCopyNotice } from "./OfflineCopyNotice";

const setOnline = (value: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, value });
afterEach(() => { cleanup(); setOnline(true); });

describe("OfflineCopyNotice", () => {
  it("is absent online and when nothing was copied", () => {
    setOnline(true);
    const { container } = render(<LanguageProvider><OfflineCopyNotice copiedAt={Date.now()} /></LanguageProvider>);
    expect(container.textContent).toBe("");
    cleanup(); setOnline(false);
    const second = render(<LanguageProvider><OfflineCopyNotice copiedAt={null} /></LanguageProvider>);
    expect(second.container.textContent).toBe("");
  });
  it("appears offline with a status role, and goes when the connection returns", () => {
    setOnline(false);
    render(<LanguageProvider><OfflineCopyNotice copiedAt={Date.now()} /></LanguageProvider>);
    expect(screen.getByRole("status").textContent).toMatch(/نسخة محفوظة|copy kept/);
    act(() => { setOnline(true); window.dispatchEvent(new Event("online")); });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { FieldShell } from "./FieldShell";

// D-63: the unit-number box in the field screens' tab row checks itself in the page's language (Urdu here)
const h = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useLocation: () => ["/m/t/p/report", h.navigate] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "ur", isRtl: true, setLanguage: vi.fn() }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
afterEach(() => { cleanup(); h.navigate.mockReset(); });

describe("FieldShell unit search (D-63)", () => {
  it("an empty unit number opens nothing and says so in Urdu under the box; a number opens the unit's card once", () => {
    render(<FieldShell tenantId="t" projectId="p" current="report" title="T" backHref="/" backLabel="B"><p>body</p></FieldShell>);
    const box = expectEmptySubmitRefused(document.querySelector("form")!, "ur", h.navigate) as HTMLInputElement;
    fireEvent.input(box, { target: { value: "12" } });
    fireEvent.change(box, { target: { value: "12" } });
    expect(document.querySelector("[data-checked-error]")).toBeNull();
    fireEvent.submit(box.form!);
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith("/m/t/p/unit/12");
    expect(screen.getByText("body")).toBeTruthy();
  });
});

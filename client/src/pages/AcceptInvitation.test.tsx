import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = { isArabic: false, error: null as unknown, success: false };

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { tenant: { acceptInvitation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.error, isSuccess: state.success }) } } } }));
vi.mock("wouter", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>, useSearch: () => "?token=abcdefghijklmnopqrstuvwxyz1234567890" }));

import AcceptInvitation from "./AcceptInvitation";

describe("accept invitation page", () => {
  it("renders the token-based acceptance flow and localized outcomes", () => {
    let markup = renderToStaticMarkup(<AcceptInvitation />);
    expect(markup).toContain("Accept organization invitation");
    expect(markup).toContain("abcdefghijklmnopqrstuvwxyz1234567890");

    state.error = {};
    markup = renderToStaticMarkup(<AcceptInvitation />);
    expect(markup).toContain("Localized error");

    state.error = null;
    state.success = true;
    state.isArabic = true;
    markup = renderToStaticMarkup(<AcceptInvitation />);
    expect(markup).toContain("قبول دعوة الشركة");
    expect(markup).toContain("تم قبول الدعوة وتفعيل عضويتك بنجاح.");
    state.success = false;
    state.isArabic = false;
  });
});

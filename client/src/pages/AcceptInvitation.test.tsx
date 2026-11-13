/** @vitest-environment jsdom */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ isArabic: false, error: null as unknown, success: false, variables: undefined as unknown, mutate: (() => undefined) as (input: unknown) => void }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { tenant: { acceptInvitation: { useMutation: () => ({ mutate: (input: unknown) => state.mutate(input), isPending: false, error: state.error, isSuccess: state.success, variables: state.variables }) } } } }));
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

  it("D-28 (G-172): a failure that sending again can fix offers «Try again» with the same token; an expired or wrong token does not", () => {
    const sent: unknown[] = []; state.mutate = input => { sent.push(input); };
    state.error = { message: "PROJECT_OS_INTERNAL", data: { code: "INTERNAL_SERVER_ERROR" } }; state.variables = { inviteToken: "abcdefghijklmnopqrstuvwxyz1234567890" };
    render(<AcceptInvitation />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(sent).toEqual([{ inviteToken: "abcdefghijklmnopqrstuvwxyz1234567890" }]);
    cleanup();
    state.error = { message: "PROJECT_OS_INVITATION_EXPIRED", data: { code: "BAD_REQUEST" } };
    render(<AcceptInvitation />);
    expect(screen.getByRole("alert").textContent).toContain("Localized error");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    cleanup(); state.error = null; state.variables = undefined;
  });
});

// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MfaGate } from "./MfaGate";

const state = vi.hoisted(() => ({
  status: { data: undefined as unknown, isLoading: false },
  begin: vi.fn(), confirm: vi.fn(), verify: vi.fn(),
  confirmResult: undefined as unknown, invalidate: vi.fn(async () => undefined),
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Safe error" }));
vi.mock("@/components/DashboardLayoutSkeleton", () => ({ DashboardLayoutSkeleton: () => <div>loading</div> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ invalidate: state.invalidate }),
    mfa: {
      status: { useQuery: () => state.status },
      beginEnrolment: { useMutation: (options: { onSuccess: (r: unknown) => void }) => ({ mutate: () => { state.begin(); options.onSuccess({ secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", otpauthUri: "otpauth://totp/x" }); }, isPending: false, error: null }) },
      confirmEnrolment: { useMutation: (options: { onSuccess: (r: unknown) => void }) => ({ mutate: (input: unknown) => { state.confirm(input); options.onSuccess({ recoveryCodes: ["AAAAA-BBBBB", "CCCCC-DDDDD"] }); }, isPending: false, error: null }) },
      verify: { useMutation: (options: { onSuccess: () => Promise<void> }) => ({ mutate: (input: unknown) => { state.verify(input); void options.onSuccess(); }, isPending: false, error: null }) },
    },
  },
}));
vi.mock("@/components/ds", async () => {
  const actual = await vi.importActual<typeof import("@/components/ds")>("@/components/ds");
  return { ...actual, notify: { success: vi.fn(), error: vi.fn() } };
});

afterEach(() => { cleanup(); vi.clearAllMocks(); state.status = { data: undefined, isLoading: false }; });

describe("two-step verification gate", () => {
  it("lets the page through when the person does not need the second step, or this session already passed it", () => {
    state.status = { data: { required: false, enrolled: false, verified: false }, isLoading: false };
    render(<MfaGate><p>the page</p></MfaGate>);
    expect(screen.getByText("the page")).toBeTruthy();
    cleanup();
    state.status = { data: { required: true, enrolled: true, verified: true }, isLoading: false };
    render(<MfaGate><p>the page</p></MfaGate>);
    expect(screen.getByText("the page")).toBeTruthy();
  });

  it("NEGATIVE: an administrator whose session has not verified sees the code screen, not the page", () => {
    state.status = { data: { required: true, enrolled: true, verified: false }, isLoading: false };
    render(<MfaGate><p>the page</p></MfaGate>);
    expect(screen.queryByText("the page")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true); // no code yet
    fireEvent.change(screen.getByLabelText(/App code or recovery code/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(state.verify).toHaveBeenCalledWith({ code: "123456" });
    expect(state.invalidate).toHaveBeenCalled();
  });

  it("first-time setup: start, see the secret, confirm with the first code, then the recovery codes are shown before anything else", () => {
    state.status = { data: { required: true, enrolled: false, verified: false }, isLoading: false };
    render(<MfaGate><p>the page</p></MfaGate>);
    fireEvent.click(screen.getByRole("button", { name: "Start the setup" }));
    expect(screen.getByTestId("mfa-secret").textContent).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
    expect(screen.getByRole("link", { name: "Open in the authenticator app" }).getAttribute("href")).toBe("otpauth://totp/x");
    fireEvent.change(screen.getByLabelText(/The 6-digit code from the app/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and switch on" }));
    expect(state.confirm).toHaveBeenCalledWith({ code: "654321" });
    expect(screen.getByText("AAAAA-BBBBB")).toBeTruthy();
    expect(screen.queryByText("the page")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I saved them, continue" }));
    expect(state.invalidate).toHaveBeenCalled();
  });

  it("a failed status read does not lock anyone out of the screen (the server is the gate)", () => {
    state.status = { data: undefined, isLoading: false };
    render(<MfaGate><p>the page</p></MfaGate>);
    expect(screen.getByText("the page")).toBeTruthy();
  });
});

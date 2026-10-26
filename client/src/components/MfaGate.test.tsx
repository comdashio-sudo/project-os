// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MfaGate } from "./MfaGate";

const state = vi.hoisted(() => ({
  status: { data: undefined as unknown, isLoading: false, isError: false },
  begin: vi.fn(), confirm: vi.fn(), verify: vi.fn(), postpone: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Safe error" }));
vi.mock("@/components/DashboardLayoutSkeleton", () => ({ DashboardLayoutSkeleton: () => <div>loading</div> }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ invalidate: state.invalidate }),
    mfa: {
      status: { useQuery: () => state.status },
      beginEnrolment: { useMutation: (options: { onSuccess: (r: unknown) => void }) => ({ mutate: () => { state.begin(); options.onSuccess({ secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", otpauthUri: "otpauth://totp/x", enrolmentId: "abc123def456" }); }, isPending: false, error: null }) },
      confirmEnrolment: { useMutation: (options: { onSuccess: (r: unknown) => void }) => ({ mutate: (input: unknown) => { state.confirm(input); options.onSuccess({ recoveryCodes: ["AAAAA-BBBBB", "CCCCC-DDDDD"] }); }, isPending: false, error: null }) },
      verify: { useMutation: (options: { onSuccess: () => Promise<void> }) => ({ mutate: (input: unknown) => { state.verify(input); void options.onSuccess(); }, isPending: false, error: null }) },
      postpone: { useMutation: (options: { onSuccess: () => Promise<void> }) => ({ mutate: () => { state.postpone(); void options.onSuccess(); }, isPending: false, error: null }) },
    },
  },
}));
vi.mock("@/components/ds", async () => {
  const actual = await vi.importActual<typeof import("@/components/ds")>("@/components/ds");
  return { ...actual, notify: { success: vi.fn(), error: vi.fn() } };
});

const status = (over: Record<string, unknown>) => ({ data: { required: true, enrolled: false, verified: false, postponedUntil: null, canPostpone: false, ...over }, isLoading: false, isError: false });
afterEach(() => { cleanup(); vi.clearAllMocks(); state.status = { data: undefined, isLoading: false, isError: false }; });

describe("two-step verification gate", () => {
  it("lets the page through when the person does not need the second step, this session already passed it, or the owner's 'Later' window is running", () => {
    for (const over of [{ required: false }, { enrolled: true, verified: true }, { postponedUntil: "2026-11-02T00:00:00.000Z" }]) {
      state.status = status(over);
      render(<MfaGate><p>the page</p></MfaGate>);
      expect(screen.getByText("the page")).toBeTruthy();
      cleanup();
    }
  });

  it("NEGATIVE: an administrator whose session has not verified sees the code screen, not the page", () => {
    state.status = status({ enrolled: true });
    render(<MfaGate><p>the page</p></MfaGate>);
    expect(screen.queryByText("the page")).toBeNull();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText(/App code or recovery code/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(state.verify).toHaveBeenCalledWith({ code: "123456" });
    expect(state.invalidate).toHaveBeenCalled();
  });

  it("first-time setup starts BY ITSELF and exactly once (a re-render does not ask for another enrolment), shows a QR code, keeps the key hidden until asked, and confirms the enrolment it SHOWED", async () => {
    state.status = status({});
    const { rerender } = render(<MfaGate><p>the page</p></MfaGate>);
    rerender(<MfaGate><p>the page</p></MfaGate>);
    rerender(<MfaGate><p>the page</p></MfaGate>);
    expect(state.begin).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("img", { name: /QR code/ }).getAttribute("src")).toBe("data:image/png;base64,QR"));
    expect(screen.queryByTestId("mfa-secret")).toBeNull(); // hidden by default
    fireEvent.click(screen.getByRole("button", { name: "Show the key to type it in" }));
    expect(screen.getByTestId("mfa-secret").textContent).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567");
    fireEvent.click(screen.getByRole("button", { name: "Hide the key" }));
    expect(screen.queryByTestId("mfa-secret")).toBeNull();
    expect(screen.getByRole("link", { name: "Open in the authenticator app" }).getAttribute("href")).toBe("otpauth://totp/x");
    fireEvent.change(screen.getByLabelText(/The 6-digit code from the app/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and switch on" }));
    expect(state.confirm).toHaveBeenCalledWith({ code: "654321", enrolmentId: "abc123def456" });
    expect(screen.getByText("AAAAA-BBBBB")).toBeTruthy();
    expect(screen.queryByText("the page")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I saved them, continue" }));
    expect(state.invalidate).toHaveBeenCalled();
  });

  it("the platform owner can press 'Later (7 days)' during setup; nobody else is offered it", () => {
    state.status = status({ canPostpone: true });
    render(<MfaGate><p>the page</p></MfaGate>);
    fireEvent.click(screen.getByRole("button", { name: "Later (7 days)" }));
    expect(state.postpone).toHaveBeenCalledTimes(1);
    expect(state.invalidate).toHaveBeenCalled();
    cleanup();
    state.status = status({ canPostpone: false });
    render(<MfaGate><p>the page</p></MfaGate>);
    expect(screen.queryByRole("button", { name: "Later (7 days)" })).toBeNull();
  });

  it("a failed status read does not lock anyone out of the screen (the server is the gate)", () => {
    state.status = { data: undefined, isLoading: false, isError: true };
    render(<MfaGate><p>the page</p></MfaGate>);
    expect(screen.getByText("the page")).toBeTruthy();
  });
});

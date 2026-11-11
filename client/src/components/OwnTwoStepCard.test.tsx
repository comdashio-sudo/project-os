// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnTwoStepCard } from "./OwnTwoStepCard";

// D-81: the profile's own on/off. Off by default (the e-mail code alone); on needs a current code; off is not offered while a company requires it.
const state = vi.hoisted(() => ({ status: { required: false, enrolled: false, verified: false, postponedUntil: null, canPostpone: false, selfRequired: false, companyRequired: false }, setOwn: vi.fn(), begin: vi.fn(), confirm: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("qrcode", () => ({ default: { toDataURL: () => Promise.resolve("data:image/png;base64,AA==") } }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ mfa: { status: { invalidate: vi.fn() } } }),
  mfa: {
    status: { useQuery: () => ({ data: state.status, isLoading: false, isError: false }) },
    beginEnrolment: { useMutation: () => ({ mutate: state.begin, data: undefined, error: null, isPending: false }) },
    confirmEnrolment: { useMutation: () => ({ mutate: state.confirm, error: null, isPending: false }) },
    setOwn: { useMutation: () => ({ mutate: state.setOwn, error: null, isPending: false }) },
  },
} }));
afterEach(() => { cleanup(); state.setOwn.mockReset(); state.begin.mockReset(); });

describe("OwnTwoStepCard (D-81)", () => {
  it("is off by default and offers to switch it on; a person enrolled before D-81 switches on with a current code", async () => {
    state.status = { ...state.status, enrolled: true, selfRequired: false, companyRequired: false };
    const user = userEvent.setup();
    render(<OwnTwoStepCard />);
    expect(screen.getByRole("status").textContent).toContain("e-mail code alone");
    await user.click(screen.getByRole("button", { name: "Switch on" }));
    expect(state.begin).not.toHaveBeenCalled(); // already enrolled: no new secret
    await user.type(screen.getByLabelText(/Authenticator-app code/), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(state.setOwn).toHaveBeenCalledWith({ on: true, code: "123456" });
  });

  it("a person who switched it on can switch it off with a code", async () => {
    state.status = { ...state.status, enrolled: true, selfRequired: true, companyRequired: false };
    const user = userEvent.setup();
    render(<OwnTwoStepCard />);
    await user.click(screen.getByRole("button", { name: "Switch off" }));
    await user.type(screen.getByLabelText(/Authenticator-app code/), "654321");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(state.setOwn).toHaveBeenCalledWith({ on: false, code: "654321" });
  });

  it("NEGATIVE: while a company requires it, no switch-off is offered and the reason is said", () => {
    state.status = { ...state.status, enrolled: true, selfRequired: true, companyRequired: true };
    render(<OwnTwoStepCard />);
    expect(screen.queryByRole("button", { name: "Switch off" })).toBeNull();
    expect(screen.getByText(/A company you belong to requires it/)).toBeTruthy();
  });
});

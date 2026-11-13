/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EvmCalculator from "./EvmCalculator";

const state = vi.hoisted(() => ({ isArabic: false, error: null as unknown, refetched: 0 }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { controls: { calculateEvm: { useQuery: () => ({ data: undefined, isLoading: false, isFetching: false, isError: Boolean(state.error), error: state.error, refetch: () => { state.refetched += 1; } }) } } } }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("wouter", () => ({ Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));

describe("EvmCalculator", () => {
  afterEach(() => { cleanup(); state.error = null; state.refetched = 0; });

  it("uses the Dashio mark rather than the retired PROJECT OS text header", () => {
    state.isArabic = false;
    render(<EvmCalculator />);

    expect(screen.getByAltText(/Dashio/)).toBeTruthy();
    expect(screen.queryByText("PROJECT OS")).toBeNull();
    expect(screen.getByRole("heading", { name: "Earned Value Engine" })).toBeTruthy();
  });

  it("localizes the EVM control header in Arabic", () => {
    state.isArabic = true;
    render(<EvmCalculator />);

    expect(screen.getByRole("heading", { name: "محرك القيمة المكتسبة" })).toBeTruthy();
    expect(screen.getByText("الحساب مركزي ومحكوم")).toBeTruthy();
  });

  it("D-28 (G-172): a failed calculation offers «Try again», which asks again; a rejected input does not", () => {
    state.isArabic = false; state.error = { message: "PROJECT_OS_INTERNAL", data: { code: "INTERNAL_SERVER_ERROR" } };
    render(<EvmCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetched).toBe(1);
    cleanup();
    state.error = { message: "PROJECT_OS_EVM_INVALID", data: { code: "BAD_REQUEST" } };
    render(<EvmCalculator />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

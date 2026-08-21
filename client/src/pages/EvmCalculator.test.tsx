/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EvmCalculator from "./EvmCalculator";

const state = vi.hoisted(() => ({ isArabic: false }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { controls: { calculateEvm: { useQuery: () => ({ data: undefined, isLoading: false, isError: false, error: null }) } } } }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("wouter", () => ({ Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));

describe("EvmCalculator", () => {
  afterEach(() => cleanup());

  it("uses the Dashio mark rather than the retired PROJECT OS text header", () => {
    state.isArabic = false;
    render(<EvmCalculator />);

    expect(screen.getByAltText("Dashio")).toBeTruthy();
    expect(screen.queryByText("PROJECT OS")).toBeNull();
    expect(screen.getByRole("heading", { name: "Earned Value Engine" })).toBeTruthy();
  });

  it("localizes the EVM control header in Arabic", () => {
    state.isArabic = true;
    render(<EvmCalculator />);

    expect(screen.getByRole("heading", { name: "محرك القيمة المكتسبة" })).toBeTruthy();
    expect(screen.getByText("الحساب مركزي ومحكوم")).toBeTruthy();
  });
});

/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollPanel } from "./PayrollPanel";

// The payroll panel (/payroll/:tenantId) reads its permissions first. A refused read says so in a sentence (the server's), a failed read
// retries, and while the permissions load the panel says so instead of showing actions it may not have.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.", en: FORBIDDEN_EN } } } };

const state = vi.hoisted(() => ({ capabilities: { isLoading: false, isFetching: false, error: null as unknown, data: undefined as unknown, refetch: vi.fn() } }));

// Every other procedure the panel names resolves to an idle query or mutation, so only the permissions read is under test.
const idleQuery = () => ({ isLoading: false, isFetching: false, error: null, data: undefined, refetch: vi.fn() });
const idleMutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
function procedures(path: string[]): unknown {
  return new Proxy({}, { get(_target, key: string) {
    if (key === "useQuery") return () => (path.join(".") === "employees.payroll.capabilities" ? state.capabilities : idleQuery());
    if (key === "useMutation") return idleMutation;
    if (key === "useUtils") return () => ({ invalidate: vi.fn() });
    return procedures([...path, key]);
  } });
}

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { employees: procedures(["employees"]) } }));

beforeEach(() => {
  state.capabilities = { isLoading: false, isFetching: false, error: null, data: undefined, refetch: vi.fn() };
});

describe("PayrollPanel screen states", () => {
  afterEach(cleanup);

  it("while the permissions load, the panel says so and shows no actions", () => {
    state.capabilities = { ...state.capabilities, isLoading: true };
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(screen.getByText("Loading payroll permissions…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /create|approve/i })).toBeNull();
  });

  it("a refused permissions read shows the server's sentence, with no retry", () => {
    state.capabilities = { ...state.capabilities, error: forbidden };
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a failed permissions read offers a retry that refetches the permissions", () => {
    state.capabilities = { ...state.capabilities, error: { message: "network down" } };
    render(<PayrollPanel tenantId="tenant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.capabilities.refetch).toHaveBeenCalledTimes(1);
  });
});

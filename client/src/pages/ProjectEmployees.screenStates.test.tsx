/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectEmployees } from "./ProjectEmployees";

// The people register (/people/:tenantId) in its four states: loading says so (it was blank), an empty register names the next action,
// a refused read gives the server's sentence, and a failed read offers a retry on the same query.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.", en: FORBIDDEN_EN } } } };

const state = vi.hoisted(() => ({ list: { isLoading: false, isFetching: false, error: null as unknown, data: [] as unknown[] | undefined, refetch: vi.fn() } }));
const mutation = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false, error: null, refetch: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { employees: {
  list: { useQuery: () => state.list },
  create: { useMutation: mutation },
  archive: { useMutation: mutation },
  contracts: { list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) }, create: { useMutation: mutation } },
  identity: { useQuery: () => ({ isLoading: false, error: null, data: undefined }) },
} } }));

beforeEach(() => {
  state.list = { isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() };
});

describe("ProjectEmployees screen states", () => {
  afterEach(cleanup);

  it("says the register is loading instead of rendering nothing", () => {
    state.list = { ...state.list, isLoading: true, data: undefined };
    render(<ProjectEmployees tenantId="tenant-1" />);
    expect(screen.getByRole("status").textContent).toContain("Loading the employee register…");
  });

  it("an empty register names the next action: a link to the employee form, for someone who can write", () => {
    render(<ProjectEmployees tenantId="tenant-1" />);
    expect(screen.getByText("No employee records are registered in this workspace.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the employee form" }).getAttribute("href")).toBe("#employee-create");
  });

  it("a refused read shows the server's sentence and no retry, and no empty line", () => {
    state.list = { ...state.list, error: forbidden, data: undefined };
    render(<ProjectEmployees tenantId="tenant-1" />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByText("No employee records are registered in this workspace.")).toBeNull();
  });

  it("a failed read offers a retry that refetches the register", () => {
    state.list = { ...state.list, error: { message: "network down" }, data: undefined };
    render(<ProjectEmployees tenantId="tenant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.list.refetch).toHaveBeenCalledTimes(1);
  });
});

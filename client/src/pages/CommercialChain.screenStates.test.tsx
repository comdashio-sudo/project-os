/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommercialChain from "./CommercialChain";

// The commercial chain (/projects/:t/:p/commercial): a failed list read shows the error once with a retry that refetches the chain lists,
// a refused read shows the server's sentence, and a loading list says so instead of an empty line.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.", en: FORBIDDEN_EN } } } };

const state = vi.hoisted(() => ({ lists: {} as Record<string, { isLoading: boolean; isFetching: boolean; error: unknown; data: unknown; refetch: () => void }> }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/trpc", () => {
  const idleMutation = () => ({ mutate: vi.fn(), isPending: false, error: null });
  const procedure = (name: string) => ({
    useQuery: () => state.lists[name] ?? { isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() },
    useMutation: idleMutation,
  });
  return { trpc: {
    useUtils: () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }),
    boq: { list: procedure("boq"), create: { useMutation: idleMutation } },
    subcontracts: { list: procedure("contracts"), listCertificates: procedure("certificates"), create: { useMutation: idleMutation }, createCertificate: { useMutation: idleMutation } },
    projectInvoices: { list: procedure("invoices"), create: { useMutation: idleMutation } },
    procurement: { register: procedure("suppliers") },
  } };
});

beforeEach(() => { state.lists = {}; });

describe("CommercialChain screen states", () => {
  afterEach(cleanup);

  it("a failed read shows the error once, with a retry that refetches the chain lists", () => {
    const boqRefetch = vi.fn();
    const contractsRefetch = vi.fn();
    state.lists = {
      boq: { isLoading: false, isFetching: false, error: { message: "network down" }, data: undefined, refetch: boqRefetch },
      contracts: { isLoading: false, isFetching: false, error: null, data: [], refetch: contractsRefetch },
    };
    render(<CommercialChain />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(boqRefetch).toHaveBeenCalledTimes(1);
    expect(contractsRefetch).toHaveBeenCalledTimes(1);
  });

  it("a refused read shows the server's sentence and no retry", () => {
    state.lists = { invoices: { isLoading: false, isFetching: false, error: forbidden, data: undefined, refetch: vi.fn() } };
    render(<CommercialChain />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a list that is loading says so, not that it is empty", () => {
    state.lists = { boq: { isLoading: true, isFetching: true, error: null, data: undefined, refetch: vi.fn() } };
    render(<CommercialChain />);
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
  });
});

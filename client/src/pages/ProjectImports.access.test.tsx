/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import { ProjectImports } from "./ProjectImports";

// Confirm and reanalyze act on an import of one module, so they need that module's permission (shared/importPermissions.ts),
// the same code the server checks in confirmAndImportDataInner and reanalyzeDataImport. The default module is "wbs".
const state = vi.hoisted(() => ({
  permission: { data: undefined as unknown, error: null as unknown, isLoading: false },
  analysis: { id: "00000000-0000-4000-8000-0000000000f1", status: "validated", totalRows: 2, headers: ["Work ID", "Work Name"], mapping: { code: "Work ID" }, errors: [] as Array<{ code: string }> },
}));
const TENANT = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/components/SectionResilience", () => ({ SourceNotice: () => null }));
vi.mock("@/lib/trpc", () => {
  const mutation = (data: unknown = null) => ({ mutate: vi.fn(), isPending: false, error: null, data });
  return { trpc: {
    accessSummary: { mine: { useQuery: () => state.permission } },
    dataImports: {
      list: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
      detail: { useQuery: () => ({ data: null, refetch: vi.fn(), error: null }) },
      analyze: { useMutation: () => mutation(state.analysis) },
      reanalyze: { useMutation: () => mutation() },
      confirm: { useMutation: () => mutation() },
    },
  } };
});

const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["PROJECT"], permissions: ["project.wbs.manage"], scopes: [{ scopeType: "company", scopeId: null }], ...over });
const page = () => <PermissionProvider tenantId={TENANT}><ProjectImports tenantId={TENANT} projectId={PROJECT} /></PermissionProvider>;

describe("ProjectImports confirm controls follow the module permission", () => {
  beforeEach(() => {
    state.permission = { data: undefined, error: null, isLoading: false };
    state.analysis = { id: "00000000-0000-4000-8000-0000000000f1", status: "validated", totalRows: 2, headers: ["Work ID", "Work Name"], mapping: { code: "Work ID" }, errors: [] };
  });
  afterEach(cleanup);

  it("a person who may import the selected module sees the confirm control", () => {
    state.permission = { data: summary(), error: null, isLoading: false };
    render(page());
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeTruthy();
  });

  it("a person without the module permission does not see the confirm control", () => {
    state.permission = { data: summary({ permissions: ["project.budget.manage"] }), error: null, isLoading: false };
    render(page());
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
  });

  it("the reanalyze control is withheld from a person without the module permission", () => {
    state.analysis = { ...state.analysis, status: "uploaded", errors: [{ code: "IMPORT_HEADER_UNMAPPED" }] };
    state.permission = { data: summary({ permissions: ["project.read"] }), error: null, isLoading: false };
    render(page());
    expect(screen.queryByRole("button", { name: "Reanalyze mapping" })).toBeNull();
  });

  it("the reanalyze control is shown to a person with the module permission when mapping is needed", () => {
    state.analysis = { ...state.analysis, status: "uploaded", errors: [{ code: "IMPORT_HEADER_UNMAPPED" }] };
    state.permission = { data: summary(), error: null, isLoading: false };
    render(page());
    expect(screen.getByRole("button", { name: "Reanalyze mapping" })).toBeTruthy();
  });

  it("while the permission answer is loading no confirm control is drawn", () => {
    state.permission = { data: undefined, error: null, isLoading: true };
    render(page());
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
  });

  it("when the permission lookup fails the confirm control stays, and the server refuses what it must", () => {
    state.permission = { data: undefined, error: new Error("network"), isLoading: false };
    render(page());
    expect(screen.getByRole("button", { name: "Confirm import" })).toBeTruthy();
  });
});

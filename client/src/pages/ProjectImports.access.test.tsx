/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import { ProjectImports } from "./ProjectImports";

// Confirm and reanalyze act on an import of one module, so they need that module's permission (shared/importPermissions.ts),
// the same code the server checks in requestImportConfirmation / requestImportReanalysis. The default module is "wbs".
// The import is analysed by a background job the screen polls (work order 6), so each test first uploads a file, and the job's result is what `progress` returns.
const JOB = "00000000-0000-4000-8000-0000000000f1";
const state = vi.hoisted(() => ({
  permission: { data: undefined as unknown, error: null as unknown, isLoading: false },
  put: vi.fn(),
  mock: { list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn() },
}));
const TENANT = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const analysisView = (over: Record<string, unknown> = {}, errors: Array<{ rowNumber: number; code: string }> = []) => ({
  id: JOB, status: "validated", progressPercent: 100, progressStage: null, failureReason: null, totalRows: 2, validRows: 2, invalidRows: 0, createdRows: 0, updatedRows: 0, skippedRows: 0,
  analysis: { headers: ["Work ID", "Work Name"], mapping: { code: "Work ID" }, errors, errorsListed: errors.length, errorsTotal: errors.length }, ...over,
});

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/components/SectionResilience", () => ({ SourceNotice: () => null }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: state.put }));
vi.mock("@/lib/trpc", async () => ({ trpc: { accessSummary: { mine: { useQuery: () => state.permission } }, ...(await import("../test/importsTrpcMock")).importsTrpc(state.mock) } }));

async function uploadAFile() {
  render(page());
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText("Choose a file"), new File(["Work ID,Work Name\n1,A"], "wbs.csv", { type: "text/csv" }));
  await user.click(screen.getByRole("button", { name: "Analyze file" }));
}

const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["PROJECT"], permissions: ["project.wbs.manage"], scopes: [{ scopeType: "company", scopeId: null }], ...over });
const page = () => <PermissionProvider tenantId={TENANT}><ProjectImports tenantId={TENANT} projectId={PROJECT} /></PermissionProvider>;

describe("ProjectImports confirm controls follow the module permission", () => {
  beforeEach(() => {
    state.permission = { data: undefined, error: null, isLoading: false };
    state.put.mockReset().mockResolvedValue(undefined);
    state.mock.createUpload.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/u", uploadKey: "imports/t/p/pending/k/f", headers: {}, maxBytes: 1 });
    state.mock.registerUpload.mockReset().mockResolvedValue({ id: JOB, status: "analyzing" });
    state.mock.progress = analysisView();
  });
  afterEach(cleanup);

  it("a person who may import the selected module sees the confirm control", async () => {
    state.permission = { data: summary(), error: null, isLoading: false };
    await uploadAFile();
    expect(await screen.findByRole("button", { name: "Confirm import" })).toBeTruthy();
  });

  it("the confirm control disappears when the selected module is one the person may not import", async () => {
    // a person who may import WBS uploads a WBS file, then picks another data type they may not import: the analysis stays on screen, the control does not
    state.permission = { data: summary({ permissions: ["project.wbs.manage"] }), error: null, isLoading: false };
    await uploadAFile();
    await screen.findByRole("button", { name: "Confirm import" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Budget" }));
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
  });

  it("the reanalyze control is withheld once the selected module is one the person may not import", async () => {
    state.mock.progress = analysisView({ status: "uploaded", invalidRows: 1 }, [{ rowNumber: 0, code: "IMPORT_HEADER_UNMAPPED" }]);
    state.permission = { data: summary({ permissions: ["project.wbs.manage"] }), error: null, isLoading: false };
    await uploadAFile();
    await screen.findByRole("button", { name: "Reanalyze mapping" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Budget" }));
    expect(screen.queryByRole("button", { name: "Reanalyze mapping" })).toBeNull();
  });

  it("the reanalyze control is shown to a person with the module permission when mapping is needed", async () => {
    state.mock.progress = analysisView({ status: "uploaded", invalidRows: 1 }, [{ rowNumber: 0, code: "IMPORT_HEADER_UNMAPPED" }]);
    state.permission = { data: summary(), error: null, isLoading: false };
    await uploadAFile();
    expect(await screen.findByRole("button", { name: "Reanalyze mapping" })).toBeTruthy();
  });

  it("while the permission answer is loading no confirm control is drawn", async () => {
    state.permission = { data: undefined, error: null, isLoading: true };
    render(page());
    expect(screen.queryByLabelText("Choose a file")).toBeNull(); // nothing to upload with either
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
  });

  it("when the permission lookup fails the confirm control stays, and the server refuses what it must", async () => {
    state.permission = { data: undefined, error: new Error("network"), isLoading: false };
    await uploadAFile();
    expect(await screen.findByRole("button", { name: "Confirm import" })).toBeTruthy();
  });
});

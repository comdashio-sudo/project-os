/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import { ProjectImports } from "./ProjectImports";

// QA of #157 at 9858253: the log rows showed «Confirm import» and «Delete this attempt» to a site engineer (the server answers 403),
// and a confirmed row stayed «Processing» until the page was reloaded. The rows now ask the same permission the server checks
// (shared/importPermissions.ts), and the log is read again when the running job finishes.
const TENANT = "00000000-0000-4000-8000-000000000001";
const PROJECT = "00000000-0000-4000-8000-000000000002";
const ids = { rejected: "00000000-0000-4000-8000-0000000000b1", awaiting: "00000000-0000-4000-8000-0000000000b2", budget: "00000000-0000-4000-8000-0000000000b3" };
const state = vi.hoisted(() => ({
  permission: { data: undefined as unknown, error: null as unknown, isLoading: false },
  listRefetch: vi.fn(),
  mock: { list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn(), discard: vi.fn(), rollback: vi.fn() },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/components/SectionResilience", () => ({ SourceNotice: () => null }));
vi.mock("@/lib/trpc", async () => {
  const base = (await import("../test/importsTrpcMock")).importsTrpc(state.mock);
  return { trpc: { accessSummary: { mine: { useQuery: () => state.permission } }, ...base, dataImports: { ...base.dataImports, list: { useQuery: () => ({ data: state.mock.list, refetch: state.listRefetch }) } } } };
});

const row = (id: string, fileName: string, status: string, errorCount: number, moduleCode = "wbs") => ({ id, fileName, moduleCode, status, errorCount, duplicateMode: "fail_on_duplicate", createdRows: 0, updatedRows: 0, skippedRows: 0 });
const summary = (permissions: string[]) => ({ data: { member: true, products: ["PROJECT"], permissions, scopes: [{ scopeType: "company", scopeId: null }] }, error: null, isLoading: false });
const page = () => <PermissionProvider tenantId={TENANT}><ProjectImports tenantId={TENANT} projectId={PROJECT} /></PermissionProvider>;

beforeEach(() => {
  state.mock.list = [row(ids.rejected, "bad.xlsx", "uploaded", 3), row(ids.awaiting, "wbs.xlsx", "validated", 0), row(ids.budget, "budget.xlsx", "validated", 0, "budget")];
  state.mock.progress = undefined;
  state.listRefetch.mockReset();
  state.mock.confirm.mockReset().mockResolvedValue({ id: ids.awaiting, status: "importing" });
});
afterEach(cleanup);

describe("the log rows offer confirm and delete only to someone the server lets do it", () => {
  it("a site engineer (read only) sees neither «Confirm import» nor «Delete this attempt» on any row", () => {
    state.permission = summary(["project.read"]);
    render(page());
    expect(screen.getAllByTestId("import-attempt-awaiting")).toHaveLength(2); // the rows are there; only the buttons are not
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete this attempt" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "View results" }).length).toBe(3); // reading is still offered
  });

  it("someone who may import WBS sees «Confirm import» on the WBS row, not on the budget row, and «Delete this attempt» on the unwritten rows", () => {
    state.permission = summary(["project.read", "project.wbs.manage"]);
    render(page());
    const [wbs, budget] = screen.getAllByTestId("import-attempt-awaiting");
    expect(within(wbs).getByRole("button", { name: "Confirm import" })).toBeTruthy();
    expect(within(budget).queryByRole("button", { name: "Confirm import" })).toBeNull(); // the server checks the row's own module
    expect(screen.getAllByRole("button", { name: "Delete this attempt" })).toHaveLength(3); // deleting accepts any import permission
    expect(within(screen.getByTestId("import-attempt-rejected")).getByRole("button", { name: "Delete this attempt" })).toBeTruthy();
  });
});

describe("an external import (PMC, master plan, ledgers) is confirmed from its own screen, not from the log (ENG review of #157 at 419049d)", () => {
  // The server confirms these through authorizeExternalImport, which also needs the plan feature and (HR ledgers) the company-level HR permission;
  // the client reads neither, so the log does not offer a button whose answer it cannot know.
  const external = ["pmc.locations", "pmc.status", "masterPlanMapping", "masterPlanSpatial", "costs", "purchaseOrders", "employees", "timeEntries"];
  const externalRows = () => external.map((code, index) => row(`00000000-0000-4000-8000-0000000001${String(index).padStart(2, "0")}`, `${code}.xlsx`, "validated", 0, code));

  it("a WBS manager does not see «Confirm import» on a validated pmc.* row, and still sees it on the WBS row", () => {
    state.mock.list = [row(ids.awaiting, "wbs.xlsx", "validated", 0), row("00000000-0000-4000-8000-0000000000c1", "locations.xlsx", "validated", 0, "pmc.locations")];
    state.permission = summary(["project.read", "project.wbs.manage"]);
    render(page());
    const [wbs, pmc] = screen.getAllByTestId("import-attempt-awaiting");
    expect(within(wbs).getByRole("button", { name: "Confirm import" })).toBeTruthy();
    expect(within(pmc).queryByRole("button", { name: "Confirm import" })).toBeNull();
  });

  it("nobody sees «Confirm import» on an external row, not even a holder of every permission those imports use", () => {
    state.mock.list = [row(ids.awaiting, "wbs.xlsx", "validated", 0), ...externalRows()];
    state.permission = summary(["project.read", "project.wbs.manage", "project.pmc.manage", "project.write", "project.cost.enter", "project.procurement.manage", "project.hr.manage", "project.manage"]);
    render(page());
    const rows = screen.getAllByTestId("import-attempt-awaiting");
    expect(rows).toHaveLength(1 + external.length);
    expect(screen.getAllByRole("button", { name: "Confirm import" })).toHaveLength(1); // the WBS row's only
    expect(within(rows[0]).getByRole("button", { name: "Confirm import" })).toBeTruthy();
    for (const external of rows.slice(1)) expect(within(external).getByRole("button", { name: "View results" })).toBeTruthy(); // the row is still there to read
  });
});

describe("a confirmed row stops saying «Processing» without a reload", () => {
  it("reads the log again when the running job finishes, and not while it is still running", async () => {
    state.permission = summary(["project.wbs.manage"]);
    state.mock.progress = { id: ids.awaiting, status: "importing", progressPercent: 40, progressStage: "writing" };
    const view = render(page());
    const user = userEvent.setup();
    await user.click(within(screen.getAllByTestId("import-attempt-awaiting")[0]).getByRole("button", { name: "Confirm import" }));
    expect(state.mock.confirm).toHaveBeenCalledWith({ tenantId: TENANT, projectId: PROJECT, importId: ids.awaiting });
    expect(await screen.findByTestId("import-job")).toBeTruthy(); // the job is followed
    state.listRefetch.mockClear(); // the confirm itself reads the log once; what follows is the finish
    view.rerender(page());
    expect(state.listRefetch).not.toHaveBeenCalled(); // still importing: nothing to read yet
    state.mock.progress = { id: ids.awaiting, status: "completed", progressPercent: 100, progressStage: "done", createdRows: 5, updatedRows: 0, skippedRows: 0 };
    await act(async () => { view.rerender(page()); });
    expect(state.listRefetch).toHaveBeenCalledTimes(1);
  });
});

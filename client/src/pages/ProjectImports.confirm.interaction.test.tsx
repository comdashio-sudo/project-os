/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectImports } from "./ProjectImports";

const JOB = "00000000-0000-4000-8000-0000000000f2";
const state = vi.hoisted(() => ({
  put: vi.fn(),
  mock: { list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, diff: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn() },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: state.put }));
vi.mock("@/lib/trpc", async () => ({ trpc: (await import("../test/importsTrpcMock")).importsTrpc(state.mock) }));
const validated = { id: JOB, status: "validated", progressPercent: 100, progressStage: null, failureReason: null, totalRows: 1, validRows: 1, invalidRows: 0, createdRows: 0, updatedRows: 0, skippedRows: 0, analysis: { headers: [], mapping: {}, errors: [], errorsListed: 0, errorsTotal: 0 } };

async function startImport() {
  const user = userEvent.setup();
  render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
  await user.upload(screen.getByLabelText("Choose a file"), new File(["Code,Name\n1,A"], "wbs.csv", { type: "text/csv" }));
  await user.click(screen.getByRole("button", { name: "Analyze file" }));
  return user;
}

describe("ProjectImports confirmation", () => {
  beforeEach(() => {
    cleanup(); state.put.mockReset().mockResolvedValue(undefined);
    state.mock.createUpload.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/u", uploadKey: "imports/tenant-1/project-1/pending/k/f", headers: {}, maxBytes: 1 });
    state.mock.registerUpload.mockReset().mockResolvedValue({ id: JOB, status: "analyzing" });
    state.mock.confirm.mockReset().mockResolvedValue({ id: JOB, status: "importing" });
    state.mock.progress = validated; state.mock.diff = undefined;
  });

  it("requires an explicit confirmation after a valid analysis", async () => {
    const user = await startImport();
    await user.click(await screen.findByRole("button", { name: "Confirm import" }));
    expect(state.mock.confirm).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", importId: JOB });
  });

  it("never confirms by itself: the analysis alone writes nothing", async () => {
    await startImport();
    await screen.findByRole("button", { name: "Confirm import" });
    expect(state.mock.confirm).not.toHaveBeenCalled();
  });

  it("shows a large confirmation as a job in progress, then its counts when it completes", async () => {
    state.mock.progress = { ...validated, status: "importing", progressStage: "writing", progressPercent: 60 };
    await startImport();
    expect((await screen.findByRole("status")).textContent).toContain("Writing the records — Saving the result (60%)");
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull(); // nothing to press twice while it runs
    cleanup(); state.mock.progress = { ...validated, status: "completed", createdRows: 67728, updatedRows: 0, skippedRows: 0 };
    await startImport();
    await waitFor(() => expect(screen.getByText("Records created: 67728 · Records updated: 0 · Records skipped: 0")).toBeTruthy());
  });

  const hash = "a".repeat(64);
  const previewOf = (summary: Record<string, number>, entries: unknown[]) => ({ supported: true, moduleCode: "wbs", summary: { new: 0, modified: 0, unchanged: 0, conflict: 0, missing: 0, total: 0, ...summary }, diffHash: hash, entries, shownTotal: entries.length, offset: 0, pageSize: 200, missing: [], missingTotal: 0 });

  it("shows each changed row as old → new before anything is written, and confirms with the hash of exactly what was shown", async () => {
    state.mock.diff = previewOf({ modified: 1, unchanged: 2 }, [{ rowNumber: 3, key: "1.2", kind: "modified", changes: [{ field: "plannedValue", oldValue: "2500.50", newValue: "3100.00" }] }]);
    const user = await startImport();
    const preview = await screen.findByTestId("import-diff");
    expect(preview.textContent).toContain("Differences preview before saving");
    expect(preview.textContent).toContain("1.2"); expect(preview.textContent).toContain("2500.50"); expect(preview.textContent).toContain("3100.00");
    expect(state.mock.confirm).not.toHaveBeenCalled(); // viewing the differences writes nothing
    await user.click(screen.getByRole("button", { name: "Confirm import" }));
    expect(state.mock.confirm).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", importId: JOB, approvedDiffHash: hash });
  });

  it("an export re-imported with no edit says there is nothing to change", async () => {
    state.mock.diff = previewOf({ unchanged: 25 }, []);
    await startImport();
    expect((await screen.findByTestId("import-diff")).textContent).toContain("No changes: every row matches what is stored.");
  });

  it("a conflicting row blocks the confirm button and says why", async () => {
    state.mock.diff = previewOf({ conflict: 1, unchanged: 1 }, [{ rowNumber: 2, key: "1.1", kind: "conflict", changes: [] }]);
    await startImport();
    expect((await screen.findByRole("alert", { name: "" })).textContent).toContain("Conflict");
    expect((screen.getByRole("button", { name: "Confirm import" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says in a sentence that rows absent from the file are never deleted, and lists them", async () => {
    state.mock.diff = { ...previewOf({ unchanged: 1, missing: 2 }, []), missing: [{ key: "1.1" }, { key: "1.2" }], missingTotal: 2 };
    await startImport();
    const note = await screen.findByTestId("import-diff-missing");
    expect(note.textContent).toContain("will NOT be deleted");
    expect(note.textContent).toContain("An import never deletes a record");
    expect(note.textContent).toContain("1.1"); expect(note.textContent).toContain("1.2");
  });
});


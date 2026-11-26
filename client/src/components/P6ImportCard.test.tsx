/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P6ImportCard } from "./P6ImportCard";

// Q-61 (P6): the full Primavera import on the screen — upload to a signed URL, the counts of what would change, confirm with the hash shown, and the background job's progress.
const h = vi.hoisted(() => ({
  can: true, put: vi.fn(), createUpload: vi.fn(), analyze: vi.fn(), confirm: vi.fn(), progress: undefined as unknown, progressError: false,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false, isRtl: false }) }));
vi.mock("@/lib/permissions", () => ({ useCan: () => h.can }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: (error: { message?: string }) => `Localized: ${error?.message ?? "error"}` }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: h.put }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  smartImport: { createUpload: { useMutation: () => ({ mutateAsync: h.createUpload, isPending: false }) }, analyze: { useMutation: () => ({ mutateAsync: h.analyze, isPending: false }) }, confirm: { useMutation: () => ({ mutateAsync: h.confirm, isPending: false }) } },
  dataImports: { progress: { useQuery: () => ({ data: h.progress, isError: h.progressError, error: h.progressError ? new Error("offline") : null }) } },
} }));

const count = (create: number, update = 0, unchanged = 0) => ({ create, update, unchanged, absent: 0 });
const plan = (over: Record<string, unknown> = {}) => ({ fileHash: "a".repeat(64), counts: { wbs: count(1413), activities: count(16469), relationships: count(46592), calendars: count(3), resources: count(0), assignments: count(0), codeTypes: count(11), codeValues: count(200), codeAssignments: count(181148) }, issues: [], warnings: ["P6_CURRENCY_DIFFERS"], canConfirm: true, summary: { activities: 16469 }, ...over });
const pick = async () => { const user = userEvent.setup({ applyAccept: false }); await user.upload(document.querySelector("input[type=file]") as HTMLInputElement, new File(["%T\tPROJWBS"], "schedule.xer", { type: "text/plain" })); return user; };

beforeEach(() => {
  cleanup(); h.can = true; h.progress = undefined; h.progressError = false;
  h.put.mockReset().mockResolvedValue(undefined);
  h.createUpload.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/up?sig=1", uploadKey: "imports/t/p/smart/k/schedule.xer", headers: { "Content-Type": "text/plain" } });
  h.analyze.mockReset().mockResolvedValue({ p6Plan: plan() });
  h.confirm.mockReset().mockResolvedValue({ importId: "00000000-0000-4000-8000-0000000000f1", status: "importing" });
});
afterEach(cleanup);

describe("P6ImportCard (Q-61 P6)", () => {
  it("uploads to the signed URL, shows the counts per kind, confirms with the hash it showed, and follows the background job to its end", async () => {
    const { rerender } = render(<P6ImportCard tenantId="t" projectId="p" />);
    const user = await pick();
    await user.click(screen.getByRole("button", { name: "Analyze the file" }));
    await waitFor(() => expect(h.analyze).toHaveBeenCalled());
    expect(h.put).toHaveBeenCalledWith("https://storage.example.test/up?sig=1", { "Content-Type": "text/plain" }, expect.any(File), expect.any(Function)); // the bytes go to Storage, not through our API
    expect(h.createUpload).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", fileName: "schedule.xer" });
    const row = (entity: string) => document.querySelector(`[data-entity='${entity}']`)!.textContent;
    expect(row("activities")).toContain("16,469"); expect(row("relationships")).toContain("46,592"); expect(row("codeAssignments")).toContain("181,148");
    expect(screen.getByText("P6_CURRENCY_DIFFERS")).toBeTruthy(); // a note does not block
    await user.click(screen.getByRole("button", { name: "Confirm the import" }));
    expect(h.confirm).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", uploadKey: "imports/t/p/smart/k/schedule.xer", fileName: "schedule.xer", kind: "xer", forced: {}, approvedHash: "a".repeat(64) });
    h.progress = { status: "importing", progressPercent: 30, progressStage: "writing", failureReason: null, createdRows: 0, updatedRows: 0 };
    rerender(<P6ImportCard tenantId="t" projectId="p" />);
    expect((await screen.findByText(/Writing in the background/)).closest("[data-p6-progress]")!.textContent).toContain("30%");
    h.progress = { status: "completed", progressPercent: 100, progressStage: null, failureReason: null, createdRows: 16469, updatedRows: 0 };
    rerender(<P6ImportCard tenantId="t" projectId="p" />);
    const done = await screen.findByText("The import is complete");
    expect(done.closest("[data-p6-done]")!.textContent).toContain("16,469");
  });
  it("a small file finishes inside the confirmation: the counts come back and no polling is needed", async () => {
    h.confirm.mockResolvedValue({ importId: "00000000-0000-4000-8000-0000000000f2", status: "completed", p6Counts: { activities: count(40, 2) } });
    render(<P6ImportCard tenantId="t" projectId="p" />);
    const user = await pick();
    await user.click(screen.getByRole("button", { name: "Analyze the file" }));
    await user.click(await screen.findByRole("button", { name: "Confirm the import" }));
    expect((await screen.findByText("The import is complete")).closest("[data-p6-done]")!.textContent).toContain("40");
  });
  it("NEGATIVE: a problem found by the analysis blocks the confirmation and is listed; the failed job says why", async () => {
    h.analyze.mockResolvedValue({ p6Plan: plan({ issues: [{ code: "IMPORT_TOO_MANY_ROWS", detail: "TASKACTV 1,200,000" }], canConfirm: false }) });
    render(<P6ImportCard tenantId="t" projectId="p" />);
    const user = await pick();
    await user.click(screen.getByRole("button", { name: "Analyze the file" }));
    expect((await screen.findByRole("alert")).textContent).toContain("IMPORT_TOO_MANY_ROWS");
    expect((screen.getByRole("button", { name: "Confirm the import" }) as HTMLButtonElement).disabled).toBe(true);
    expect(h.confirm).not.toHaveBeenCalled();
  });
  it("NEGATIVE: the job's failure is shown with its reason, and someone who may not import schedules sees no card", async () => {
    const first = render(<P6ImportCard tenantId="t" projectId="p" />);
    const user = await pick();
    await user.click(screen.getByRole("button", { name: "Analyze the file" }));
    await user.click(await screen.findByRole("button", { name: "Confirm the import" }));
    h.progress = { status: "failed", progressPercent: 30, progressStage: null, failureReason: "PROJECT_OS_IMPORT_FILE_INVALID", createdRows: 0, updatedRows: 0 };
    first.rerender(<P6ImportCard tenantId="t" projectId="p" />);
    const failed = await screen.findByText("The import failed");
    expect(failed.closest("[data-p6-failed]")!.textContent).toContain("PROJECT_OS_IMPORT_FILE_INVALID");
    cleanup(); h.can = false;
    render(<P6ImportCard tenantId="t" projectId="p" />);
    expect(document.querySelector("[data-p6-import]")).toBeNull();
  });
  it("NEGATIVE: if the progress cannot be read the card says so and that the import keeps running — it never looks stuck or finished", async () => {
    const view = render(<P6ImportCard tenantId="t" projectId="p" />);
    const user = await pick();
    await user.click(screen.getByRole("button", { name: "Analyze the file" }));
    await user.click(await screen.findByRole("button", { name: "Confirm the import" }));
    h.progressError = true;
    view.rerender(<P6ImportCard tenantId="t" projectId="p" />);
    expect((await screen.findAllByText(/still running in the background/))[0]).toBeTruthy();
    expect(screen.queryByText("The import is complete")).toBeNull();
  });
});

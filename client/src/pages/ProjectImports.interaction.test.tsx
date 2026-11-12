/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectImports } from "./ProjectImports";

const JOB = "00000000-0000-4000-8000-0000000000f1";
const state = vi.hoisted(() => ({
  arabic: false, put: vi.fn(),
  mock: { list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn() },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized import error" }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: state.put }));
vi.mock("@/lib/trpc", async () => ({ trpc: (await import("../test/importsTrpcMock")).importsTrpc(state.mock) }));
const analysed = { id: JOB, status: "validated", progressPercent: 100, progressStage: null, failureReason: null, totalRows: 2, validRows: 1, invalidRows: 1, createdRows: 0, updatedRows: 0, skippedRows: 0,
  analysis: { headers: ["Code", "Name"], mapping: { code: "Code" }, errors: [{ rowNumber: 0, code: "IMPORT_SINGLE_SHEET_REQUIRED", field: undefined }], errorsListed: 1, errorsTotal: 1 } };

describe("ProjectImports", () => {
  beforeEach(() => {
    cleanup(); state.arabic = false; state.put.mockReset().mockResolvedValue(undefined);
    state.mock.progress = undefined;
    state.mock.createUpload.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/upload?sig=1", uploadKey: "imports/tenant-1/project-1/pending/k/file", headers: { "Content-Type": "text/plain" }, maxBytes: 52428800 });
    state.mock.registerUpload.mockReset().mockResolvedValue({ id: JOB, status: "analyzing" });
  });

  it("uploads an XLSX straight to storage, registers it, and shows the analysis the background job produced", async () => {
    state.mock.progress = analysed;
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("Controlled import in three steps")).toBeTruthy(); expect(screen.getByRole("button", { name: "Download Excel template" })).toBeTruthy();
    const file = new File(["workbook"], "wbs.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(screen.getByLabelText("Choose a file"), file); await user.selectOptions(screen.getByLabelText("Duplicate-row policy"), "upsert"); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    await waitFor(() => expect(state.mock.registerUpload).toHaveBeenCalled());
    expect(state.mock.createUpload).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "wbs", fileName: "wbs.xlsx", sourceFormat: "xlsx" });
    expect(state.put).toHaveBeenCalledWith("https://storage.example.test/upload?sig=1", { "Content-Type": "text/plain" }, file, expect.any(Function)); // the bytes go to the signed URL, not to our API
    expect(state.mock.registerUpload).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "wbs", sourceFormat: "xlsx", duplicateMode: "upsert", uploadKey: "imports/tenant-1/project-1/pending/k/file" }));
    expect(JSON.stringify(state.mock.registerUpload.mock.calls)).not.toContain("base64");
    expect(await screen.findByText("Rows: 2")).toBeTruthy(); expect(screen.getByText("Validation errors: 1")).toBeTruthy(); expect(screen.getByText("The file must contain exactly one worksheet. — 1 row: 0")).toBeTruthy();
  });

  it("a Primavera file chosen under another kind is sent as a schedule, with a notice; a CSV is still no schedule", async () => {
    state.mock.progress = analysed;
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    // the default kind is WBS: the person uploaded the XER where it does not belong
    await user.upload(screen.getByLabelText("Choose a file"), new File(["%T\tPROJWBS"], "programme.xer", { type: "text/plain" })); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    await waitFor(() => expect(state.mock.registerUpload).toHaveBeenCalled());
    expect(state.mock.createUpload).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "schedule", fileName: "programme.xer", sourceFormat: "xer" });
    expect(state.mock.registerUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "schedule", sourceFormat: "xer" }));
    expect((await screen.findByTestId("xer-routed-notice")).textContent).toContain("sent to the Schedule kind automatically");
    // NEGATIVE: under Schedule a CSV is refused as before, and nothing is uploaded
    state.mock.createUpload.mockClear(); state.mock.registerUpload.mockClear();
    const bypass = userEvent.setup({ applyAccept: false }); // the dialog hides CSV under Schedule, but «All files» can still pick one
    await bypass.upload(screen.getByLabelText("Choose a file"), new File(["a,b"], "plan.csv", { type: "text/csv" })); await bypass.click(screen.getByRole("button", { name: "Analyze file" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The file format does not match the selected template.");
    expect(state.mock.createUpload).not.toHaveBeenCalled(); expect(screen.queryByTestId("xer-routed-notice")).toBeNull();
  });

  it("opens on the kind it is asked for", () => {
    render(<ProjectImports tenantId="tenant-1" projectId="project-1" initialModule="schedule" />);
    expect(screen.getByRole("button", { name: "Schedule" }).className).not.toBe(screen.getByRole("button", { name: "WBS" }).className);
  });

  it("shows the job while it runs — status, stage and percent — and no confirm button yet", async () => {
    state.mock.progress = { ...analysed, status: "analyzing", progressStage: "parsing", progressPercent: 30, analysis: null };
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getByLabelText("Choose a file"), new File(["%T\tPROJWBS"], "programme.xer", { type: "text/plain" })); await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.upload(screen.getByLabelText("Choose a file"), new File(["%T\tPROJWBS"], "programme.xer", { type: "text/plain" })); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Analysing the file — Reading the rows (30%)");
    expect(screen.getByText("Processing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirm import" })).toBeNull();
  });

  it("says why a job failed, in the user's language, using the reason code the server recorded", async () => {
    state.mock.progress = { ...analysed, status: "failed", failureReason: "PROJECT_OS_IMPORT_JOB_STALLED", analysis: null };
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getByLabelText("Choose a file"), new File(["x"], "wbs.xlsx")); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    const alert = await screen.findByText("Processing failed");
    expect(alert.closest("[role=alert]")!.textContent).toContain("Processing stopped before it finished and could not be restarted. Nothing was saved; try again.");
    cleanup(); state.arabic = true; render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    await userEvent.setup().upload(screen.getByLabelText("اختر ملفًا"), new File(["x"], "wbs.xlsx")); await userEvent.setup().click(screen.getByRole("button", { name: "تحليل الملف" }));
    expect((await screen.findByText("فشلت المعالجة")).closest("[role=alert]")!.textContent).toContain("توقفت المعالجة قبل اكتمالها");
  });

  it("refuses a file over 50 MB before any upload starts", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    const big = new File(["x"], "huge.xlsx"); Object.defineProperty(big, "size", { value: 50 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText("Choose a file"), big); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    expect(screen.getByRole("alert").textContent).toContain("The file exceeds the 50 MB limit.");
    expect(state.mock.createUpload).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
  });

  it("reports a storage upload that did not go through, and does not register a file that never arrived", async () => {
    state.put.mockRejectedValue(new (await import("@/lib/uploadLimit")).UploadFailure(403));
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getByLabelText("Choose a file"), new File(["x"], "wbs.xlsx")); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The file could not be uploaded to storage.");
    expect(state.mock.registerUpload).not.toHaveBeenCalled();
  });

  it("sends an XER only as schedule input", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByText("Schedule import accepts only named WBS and activity records. XER requires PROJWBS and TASK; unresolved WBS links and invalid dates are never ignored.")).toBeTruthy(); expect(screen.getAllByText("Record Type").length).toBeGreaterThan(0);
    await user.upload(screen.getByLabelText("Choose a file"), new File(["%T\tPROJWBS"], "programme.xer", { type: "text/plain" })); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    await waitFor(() => expect(state.mock.createUpload).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "schedule", sourceFormat: "xer" })));
  });

  it("blocks analysis until an accepted file is selected", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await user.upload(screen.getByLabelText("Choose a file"), new File(["unsafe"], "notes.pdf", { type: "application/pdf" })); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a file before analysis."); expect(state.mock.createUpload).not.toHaveBeenCalled();
  });

  it("shows the approved contracts template in English and Arabic", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await user.click(screen.getByRole("button", { name: "Contracts" })); expect(screen.getAllByText("Contract Title").length).toBeGreaterThan(0); expect(screen.getAllByText("Counterparty").length).toBeGreaterThan(0); expect(screen.getAllByText("Currency").length).toBeGreaterThan(0);
    cleanup(); state.arabic = true; const arabicUser = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await arabicUser.click(screen.getByRole("button", { name: "العقود" })); expect(screen.getAllByText("اسم العقد").length).toBeGreaterThan(0); expect(screen.getAllByText("الطرف المتعاقد").length).toBeGreaterThan(0); expect(screen.getAllByText("العملة").length).toBeGreaterThan(0);
  });

  it("offers the opening-balances template, explains it is the first movement, and sends that module (G-105)", async () => {
    const user = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await user.click(screen.getByRole("button", { name: "Opening balances" }));
    expect(screen.getAllByText("Warehouse Code").length).toBeGreaterThan(0); expect(screen.getAllByText("Material Code").length).toBeGreaterThan(0); expect(screen.getAllByText("Quantity").length).toBeGreaterThan(0);
    expect(screen.getByText(/never edits stock that has a history/)).toBeTruthy();
    await user.upload(screen.getByLabelText("Choose a file"), new File(["Warehouse Code,Material Code,Quantity\nWH-01,CEM,10"], "opening.csv", { type: "text/csv" })); await user.click(screen.getByRole("button", { name: "Analyze file" }));
    await waitFor(() => expect(state.mock.createUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "openingBalances", sourceFormat: "csv" })));
    cleanup(); state.arabic = true; const arabicUser = userEvent.setup(); render(<ProjectImports tenantId="tenant-1" projectId="project-1" />); await arabicUser.click(screen.getByRole("button", { name: "الأرصدة الافتتاحية" })); expect(screen.getAllByText("رمز المستودع").length).toBeGreaterThan(0);
  });
});

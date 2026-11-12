/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentImport, isolateLatin, TrackerImport } from "./ReferenceImports";

// D-84 (b): the equipment list and the units Tracker from Excel (#236).
const HASH = "a".repeat(64);
const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", calls: [] as Array<[string, unknown]>, put: vi.fn(), runner: null as null | Record<string, unknown>,
  analysis: {} as Record<string, unknown>, confirmError: null as unknown, invalidated: [] as string[],
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: (error: { message: string }) => `localized: ${error.message}` }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: h.put }));
vi.mock("@/components/DirectImportRunner", () => ({ DirectImportRunner: (props: Record<string, unknown>) => { h.runner = props; return <p>runner</p>; } }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string, reply: () => unknown) => ({ useMutation: (config?: { onSuccess?: () => void }) => {
    const [state, setState] = React.useState<{ data?: unknown; isSuccess: boolean; error: unknown }>({ isSuccess: false, error: null });
    const run = async (input: unknown) => { h.calls.push([name, input]); if (name === "confirm" && h.confirmError) { setState({ isSuccess: false, error: h.confirmError }); throw h.confirmError; } const data = reply(); setState({ data, isSuccess: true, error: null }); config?.onSuccess?.(); return data; };
    return { mutate: (input: unknown) => { void run(input).catch(() => undefined); }, mutateAsync: run, reset: () => setState({ isSuccess: false, error: null }), isPending: false, ...state };
  } });
  return { trpc: { useUtils: () => ({ pmc: { progress: { invalidate: () => { h.invalidated.push("progress"); } }, structure: { invalidate: () => { h.invalidated.push("structure"); } } } }), smartImport: {
    createUpload: mutation("createUpload", () => ({ uploadKey: "smart/t/p/k/tracker.xlsx", uploadUrl: "https://storage.example.test/put", headers: { "content-type": "x" } })),
    analyze: mutation("analyze", () => h.analysis),
    confirm: mutation("confirm", () => ({ status: "completed" })),
  } } };
});

const plan = (errors: Array<{ rowNumber: number; code: string; detail?: string }>) => ({ matrixPlan: { fileHash: HASH, errors, canConfirm: errors.length === 0, summary: { units: 1230 }, changes: { newUnits: 1230, completing: 5100, unitsTouched: 1230, unchangedCells: 0, regressed: 1 } } });
beforeEach(() => { h.language = "en"; h.calls = []; h.put.mockReset(); h.put.mockResolvedValue(undefined); h.runner = null; h.confirmError = null; h.invalidated = []; h.analysis = plan([]); });
afterEach(cleanup);
const choose = (name: string) => fireEvent.change(document.querySelector('[data-import="tracker"] input[type="file"]')!, { target: { files: [new File(["x"], name)] } });

describe("units Tracker import", () => {
  it("uploads to storage, reads the file as a unit matrix, shows what it would write, and confirms the exact plan shown", async () => {
    const imported = vi.fn();
    render(<TrackerImport tenantId="t" projectId="p" onImported={imported} />);
    choose("tracker.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    await screen.findByText("What the import would write");
    expect(h.put).toHaveBeenCalledWith("https://storage.example.test/put", { "content-type": "x" }, expect.any(File), expect.any(Function));
    expect(h.calls.map(([name]) => name)).toEqual(["createUpload", "analyze"]);
    expect(h.calls[1]![1]).toEqual({ tenantId: "t", projectId: "p", uploadKey: "smart/t/p/k/tracker.xlsx", fileName: "tracker.xlsx", kind: "unitMatrix" });
    expect(document.querySelector("[data-plan] dl")!.textContent).toContain("New units1,230");
    fireEvent.click(screen.getByRole("button", { name: "Confirm the import" }));
    await waitFor(() => expect(imported).toHaveBeenCalled());
    expect(h.invalidated.sort()).toEqual(["progress", "structure"]); // review of #251
    expect(h.calls[2]).toEqual(["confirm", { tenantId: "t", projectId: "p", uploadKey: "smart/t/p/k/tracker.xlsx", fileName: "tracker.xlsx", kind: "unitMatrix", forced: {}, approvedHash: HASH }]);
    expect(screen.getByText("Import complete: 1230 units in the file.")).toBeTruthy();
  });

  it("a file with problems lists each by its row, in the page's language, and offers no confirm", async () => {
    h.analysis = plan([{ rowNumber: 12, code: "TRACKER_VILLA_DUPLICATE", detail: "V-0012" }, { rowNumber: 32, code: "SOMETHING_NEW" }]);
    render(<TrackerImport tenantId="t" projectId="p" onImported={vi.fn()} />);
    choose("tracker.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Problems that stop the import (2)");
    expect(alert.textContent).toContain("Row 12:");
    expect(alert.textContent).not.toContain("TRACKER_VILLA_DUPLICATE"); // a known code reads as a sentence
    expect(alert.textContent).toContain("Row 32: SOMETHING_NEW"); // an unknown one is shown as it is, never hidden
    expect(screen.queryByRole("button", { name: "Confirm the import" })).toBeNull();
  });

  it("a file that is not a Tracker says so; a wrong type is refused before anything is sent", async () => {
    h.analysis = { understanding: {} };
    render(<TrackerImport tenantId="t" projectId="p" onImported={vi.fn()} />);
    choose("notes.csv");
    expect(screen.getByRole("button", { name: "Analyse the file" }).hasAttribute("disabled")).toBe(true);
    expect(h.calls).toEqual([]);
    choose("other.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    expect((await screen.findByRole("alert")).textContent).toBe("This file is neither a units Tracker nor a progress matrix.");
  });

  it("a refused confirm is said and nothing is reported as imported", async () => {
    h.confirmError = { message: "PROJECT_OS_IMPORT_DUPLICATE_DETECTED" };
    const imported = vi.fn();
    render(<TrackerImport tenantId="t" projectId="p" onImported={imported} />);
    choose("tracker.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm the import" }));
    expect((await screen.findByRole("alert")).textContent).toBe("localized: PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
    expect(imported).not.toHaveBeenCalled();
  });
});

describe("equipment list import", () => {
  it("runs the direct importer on the «equipment» module, names the expected columns, and reads its row problems as sentences", () => {
    render(<EquipmentImport tenantId="t" projectId="p" onImported={vi.fn()} />);
    expect(h.runner).toMatchObject({ tenantId: "t", projectId: "p", moduleCode: "equipment", dropzone: true }); // review of #251: the drop area, not the browser's input
    expect(screen.getByText(/Expected columns:/).textContent).toBe("Expected columns: Type | Count | Model | Plate or size");
    const label = h.runner!.errorLabel as (code: string) => string;
    expect(label("EQUIPMENT_COUNT_WITH_PLATE")).not.toBe("EQUIPMENT_COUNT_WITH_PLATE");
    expect(label("UNKNOWN_CODE")).toBe("UNKNOWN_CODE");
    // QA of #251: the importer's own row codes read as sentences too
    for (const rowCode of ["IMPORT_REQUIRED_VALUE_MISSING", "IMPORT_INVALID_NUMBER"]) expect(label(rowCode)).not.toBe(rowCode);
  });

  it("names the Arabic columns on an Arabic page", () => {
    h.language = "ar";
    render(<EquipmentImport tenantId="t" projectId="p" onImported={vi.fn()} />);
    expect(screen.getByText(/الأعمدة المتوقعة:/).textContent).toBe("الأعمدة المتوقعة: النوع | العدد | الطراز | اللوحة أو المقاس");
  });
});

describe("Latin words in an RTL sentence (review of #251)", () => {
  it("are each wrapped in bdi, the rest left as text", () => {
    const { container } = render(<p>{isolateLatin("استيراد Tracker الوحدات بحالة Completed أو On going.")}</p>);
    expect(Array.from(container.querySelectorAll("bdi")).map(node => node.textContent)).toEqual(["Tracker", "Completed", "On going"]);
    expect(container.textContent).toBe("استيراد Tracker الوحدات بحالة Completed أو On going.");
  });
});

describe("no zero hash (review of #251)", () => {
  it("a plan without its file hash offers no confirm, so nothing is ever sent with a made-up hash", async () => {
    h.analysis = { matrixPlan: { ...(plan([]) as { matrixPlan: Record<string, unknown> }).matrixPlan, fileHash: undefined } };
    render(<TrackerImport tenantId="t" projectId="p" onImported={vi.fn()} />);
    choose("tracker.xlsx");
    fireEvent.click(screen.getByRole("button", { name: "Analyse the file" }));
    await screen.findByText("What the import would write");
    expect(screen.queryByRole("button", { name: "Confirm the import" })).toBeNull();
  });
});

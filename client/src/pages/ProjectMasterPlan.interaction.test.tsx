/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectMasterPlan } from "./ProjectMasterPlan";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { TYPING_TEST } from "@/test/typing";

// the master-plan files go browser → Storage on a signed URL and are applied by a background job (G-139); `imp` stands in for the dataImports hooks they use
const imp = vi.hoisted(() => ({ put: vi.fn(), state: { list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn() } }));
const state = vi.hoisted(() => ({ isArabic: false, data: { plans: [{ id: "plan-1", code: "MP-1", title: "Delivery map", status: "active", createdAt: new Date() }], versions: [{ id: "version-1", masterPlanId: "plan-1", versionNumber: 1, versionKind: "original", description: null, changeSummary: null, sourceFileName: "baseline.png", sourceUrl: "https://signed.test/baseline.png", createdAt: new Date() }], entities: [{ id: "entity-1", masterPlanVersionId: "version-1", parentEntityId: null as string | null, code: "ZONE-A", name: "Zone A", entityType: "zone", geometry: JSON.stringify({ x: 5, y: 10, width: 25, height: 20 }), status: "in_progress", progressPercent: "45", plannedValue: "100", actualValue: "40", forecastValue: "110", wbsItemId: null as string | null, activityId: null as string | null }] }, snapshots: [] as Array<{ id: string; masterPlanVersionId: string; label: string; metric: "progress" | "status" | "cost"; filters: { status?: Array<"not_started" | "in_progress" | "completed" | "blocked">; search?: string; wbsItemId?: string; activityId?: string }; viewport: { x: number; y: number; zoom: number }; layers: string[] }>, visualizationRules: [{ id: null, metric: "progress", rules: { lowMax: 39.99, mediumMax: 79.99, lowColor: "#b91c1c", mediumColor: "#b45309", highColor: "#047857" }, configured: false, updatedAt: null }, { id: null, metric: "status", rules: { notStartedColor: "#475569", inProgressColor: "#b45309", completedColor: "#047857", blockedColor: "#b91c1c" }, configured: false, updatedAt: null }, { id: null, metric: "cost", rules: { favorableMax: 0, warningMax: 10, favorableColor: "#047857", warningColor: "#b45309", unfavorableColor: "#b91c1c" }, configured: false, updatedAt: null }], refetch: vi.fn(), snapshotRefetch: vi.fn(), visualizationRefetch: vi.fn(), mutate: vi.fn(), versionMutate: vi.fn(), entityMutate: vi.fn(), mappingMutate: vi.fn(), spatialImportMutate: vi.fn(), snapshotMutate: vi.fn(), visualizationMutate: vi.fn() }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: imp.put }));
vi.mock("@/lib/trpc", async () => ({
  trpc: {
    ...(await import("../test/importsTrpcMock")).importsTrpc(imp.state),
    useUtils: () => ({}),
    masterPlans: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: state.data, refetch: state.refetch }) },
      visualizationRules: { useQuery: () => ({ isLoading: false, error: null, data: state.visualizationRules, refetch: state.visualizationRefetch }) },
      saveVisualizationRule: { useMutation: () => ({ mutate: state.visualizationMutate, isPending: false, isSuccess: false, error: null }) },
      listSnapshots: { useQuery: () => ({ isLoading: false, error: null, data: state.snapshots, refetch: state.snapshotRefetch }) },
      createSnapshot: { useMutation: () => ({ mutate: state.snapshotMutate, isPending: false, isSuccess: false, error: null }) },
      create: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null }) },
      createVersion: { useMutation: () => ({ mutate: state.versionMutate, isPending: false, error: null }) },
      createSpatialEntity: { useMutation: () => ({ mutate: state.entityMutate, isPending: false, error: null }) },
      setVersionGeometry: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      updateEntityLayout: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      setSnapshotSharing: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
    projects: { getControls: { useQuery: () => ({ data: { wbs: [{ id: "wbs-1", code: "1.0", name: "Civil works" }, { id: "wbs-2", code: "2.0", name: "Steel works" }], activities: [{ id: "activity-1", wbsItemId: "wbs-1", code: "A-01", name: "Mobilize crew" }, { id: "activity-2", wbsItemId: "wbs-2", code: "A-02", name: "Install steel" }] } }) } },
  },
}));

describe("ProjectMasterPlan", TYPING_TEST, () => {
  afterEach(() => { state.isArabic = false; state.snapshots = []; cleanup(); });

  it("selects a filtered spatial entity and reveals its authorized KPI details", async () => {
    const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByAltText("Map source").getAttribute("src")).toBe("https://signed.test/baseline.png");
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    expect(screen.getByText("Selected entity: ZONE-A · Zone A")).toBeTruthy(); expect(screen.getByText("Planned / actual / forecast: 100 / 40 / 110")).toBeTruthy();
  });

  it("zooms the map surface and restores its default scale", async () => {
    const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText(/Zoom level: 100%/)).toBeTruthy(); expect(screen.getByTestId("master-plan-map-surface").getAttribute("style")).toContain("scale(1)");
    await user.click(screen.getByRole("button", { name: "Zoom in map" }));
    expect(screen.getByText(/Zoom level: 125%/)).toBeTruthy(); expect(screen.getByTestId("master-plan-map-surface").getAttribute("style")).toContain("scale(1.25)");
    await user.click(screen.getByRole("button", { name: "Reset map view" }));
    expect(screen.getByText(/Zoom level: 100%/)).toBeTruthy(); expect(screen.getByTestId("master-plan-map-surface").getAttribute("style")).toContain("scale(1)");
  });

  it("pans the map surface within its local view and resets its position", async () => {
    const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText(/Map position: 0%, 0%/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pan map right" }));
    expect(screen.getByText(/Map position: 10%, 0%/)).toBeTruthy(); expect(screen.getByTestId("master-plan-map-surface").getAttribute("style")).toContain("translate(10%, 0%)");
    await user.click(screen.getByRole("button", { name: "Reset map view" }));
    expect(screen.getByText(/Map position: 0%, 0%/)).toBeTruthy();
  });

  it("saves the current authorized map filters, viewport, metric, and layers as a personal snapshot", async () => {
    state.snapshotMutate.mockClear(); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Zoom in map" })); await user.click(screen.getByRole("button", { name: "Pan map right" }));
    await user.type(screen.getByLabelText("Snapshot label"), "Weekly delivery view"); await user.selectOptions(screen.getByLabelText("Metric"), "cost");
    await user.click(screen.getByRole("button", { name: "Save view" }));
    expect(state.snapshotMutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", masterPlanVersionId: "version-1", label: "Weekly delivery view", metric: "cost", viewport: { x: 10, y: 0, zoom: 1.25 }, layers: ["source", "entities"] }));
  });

  it("saves a project-scoped progress threshold through the authorized visualization-rule contract", async () => {
    state.visualizationMutate.mockClear(); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    fireEvent.change(screen.getByLabelText("Low threshold"), { target: { value: "25" } }); await user.click(screen.getByRole("button", { name: "Save visualization rules" }));
    expect(state.visualizationMutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", metric: "progress", rules: expect.objectContaining({ lowMax: 25, mediumMax: 79.99 }) }));
  });

  it("restores only a saved snapshot for the selected version", async () => {
    state.snapshots = [{ id: "snapshot-1", masterPlanVersionId: "version-1", label: "Risk review", metric: "status", filters: { search: "zone", wbsItemId: "wbs-1" }, viewport: { x: -10, y: 10, zoom: 1.5 }, layers: ["entities"] }]; const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "Restore view: Risk review" }));
    expect(screen.getByText(/Zoom level: 150%/)).toBeTruthy(); expect(screen.getByText(/Map position: -10%, 10%/)).toBeTruthy(); expect((screen.getByLabelText("Search entities") as HTMLInputElement).value).toBe("zone"); expect((screen.getAllByLabelText("WBS item").at(0) as HTMLSelectElement).value).toBe("wbs-1");
  });

  it("filters map entities by authorized WBS and activity choices", async () => {
    state.data.entities[0] = { ...state.data.entities[0], wbsItemId: "wbs-1", activityId: "activity-1" }; if (!state.data.entities.find(item => item.id === "entity-filter")) state.data.entities.push({ ...state.data.entities[0], id: "entity-filter", parentEntityId: null, code: "ZONE-C", name: "Zone C", wbsItemId: "wbs-2", activityId: "activity-2", geometry: JSON.stringify({ x: 55, y: 10, width: 25, height: 20 }) }); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.selectOptions(screen.getAllByLabelText("WBS item").at(0)!, "wbs-2");
    expect(screen.queryByRole("button", { name: "ZONE-A Zone A" })).toBeNull(); expect(screen.getByRole("button", { name: "ZONE-C Zone C" })).toBeTruthy(); expect(within(screen.getAllByLabelText("Activity").at(0)!).getByRole("option", { name: "A-02 · Install steel" })).toBeTruthy();
    await user.selectOptions(screen.getAllByLabelText("Activity").at(0)!, "activity-2");
    expect(screen.getByRole("button", { name: "ZONE-C Zone C" })).toBeTruthy();
  });

  it("shows only the project-authorized WBS and activity references for a selected entity", async () => {
    state.data.entities[0] = { ...state.data.entities[0], wbsItemId: "wbs-1", activityId: "activity-1" }; const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    expect(screen.getByText("Parent entity: No link · WBS item: 1.0 · Civil works · Activity: A-01 · Mobilize crew")).toBeTruthy();
  });

  it("focuses the local map filters from a selected entity WBS and activity links", async () => {
    state.data.entities[0] = { ...state.data.entities[0], wbsItemId: "wbs-1", activityId: "activity-1" }; const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    await user.click(screen.getByRole("button", { name: "Focus WBS item: 1.0" }));
    expect((screen.getAllByLabelText("WBS item").at(0) as HTMLSelectElement).value).toBe("wbs-1");
    await user.click(screen.getByRole("button", { name: "Focus activity: A-01" }));
    expect((screen.getAllByLabelText("Activity").at(0) as HTMLSelectElement).value).toBe("activity-1");
  });

  it("shows the parent reference only from the selected version entity set", async () => {
    state.data.entities[0] = { ...state.data.entities[0], parentEntityId: "entity-parent" }; state.data.entities.push({ ...state.data.entities[0], id: "entity-parent", parentEntityId: null, code: "BLOCK-A", name: "Block A", geometry: JSON.stringify({ x: 35, y: 10, width: 25, height: 20 }) }); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    expect(screen.getByText("Parent entity: BLOCK-A · Block A · WBS item: 1.0 · Civil works · Activity: A-01 · Mobilize crew")).toBeTruthy();
  });

  it("focuses the authorized parent entity from selected entity details", async () => {
    state.data.entities[0] = { ...state.data.entities[0], parentEntityId: "entity-parent" }; if (!state.data.entities.find(item => item.id === "entity-parent")) state.data.entities.push({ ...state.data.entities[0], id: "entity-parent", parentEntityId: null, code: "BLOCK-A", name: "Block A", geometry: JSON.stringify({ x: 35, y: 10, width: 25, height: 20 }) }); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    await user.click(screen.getByRole("button", { name: "Focus parent entity: BLOCK-A" }));
    expect(screen.getByText("Selected entity: BLOCK-A · Block A")).toBeTruthy();
  });

  it("localizes the parent reference for Arabic details", async () => {
    state.data.entities[0] = { ...state.data.entities[0], parentEntityId: "entity-parent" }; if (!state.data.entities.find(item => item.id === "entity-parent")) state.data.entities.push({ ...state.data.entities[0], id: "entity-parent", parentEntityId: null, code: "BLOCK-A", name: "Block A", geometry: JSON.stringify({ x: 35, y: 10, width: 25, height: 20 }) }); state.isArabic = true; const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    expect(screen.getByText(/الكيان الأب: BLOCK-A · Block A/)).toBeTruthy();
    expect(screen.getByLabelText("الكيان الأب")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تكبير الخريطة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "إزاحة الخريطة لليمين" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "تركيز الكيان الأب: BLOCK-A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "تركيز بند WBS: 1.0" })).toBeTruthy();
    expect(screen.getAllByLabelText("بند WBS").at(0)).toBeTruthy(); expect(screen.getAllByLabelText("النشاط").at(0)).toBeTruthy();
  });

  const IMPORT = "00000000-0000-4000-8000-0000000000f8";
  const prepareImport = (progress: Record<string, unknown>) => {
    imp.put.mockReset().mockResolvedValue(undefined);
    imp.state.createUpload.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/u", uploadKey: "imports/tenant-1/project-1/pending/k/f", headers: {}, maxBytes: 1 });
    imp.state.registerUpload.mockReset().mockResolvedValue({ id: IMPORT, status: "analyzing" });
    imp.state.confirm.mockReset().mockResolvedValue({ id: IMPORT, status: "importing" });
    imp.state.progress = { id: IMPORT, status: "validated", progressPercent: 100, progressStage: null, failureReason: null, totalRows: 1, validRows: 1, invalidRows: 0, createdRows: 0, updatedRows: 0, skippedRows: 0, analysis: { headers: [], mapping: {}, errors: [], errorsListed: 0, errorsTotal: 0 }, external: { canConfirm: true, report: {} }, ...progress };
  };

  it("uploads a CSV mapping straight to storage for the selected Master Plan version, and applies it once the analysis is clean", async () => {
    prepareImport({}); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getAllByLabelText("XLSX or CSV file").at(-1)!, new File(["Unit ID,Progress\nZONE-A,84%"], "mapping.csv", { type: "text/csv" }));
    await user.click(screen.getAllByRole("button", { name: "Apply mapping" }).at(-1)!);
    await waitFor(() => expect(imp.state.createUpload).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", moduleCode: "masterPlanMapping", sourceFormat: "csv", context: { masterPlanVersionId: "version-1" } })));
    expect(imp.put).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(imp.state.registerUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "masterPlanMapping", context: { masterPlanVersionId: "version-1" } })));
    await waitFor(() => expect(imp.state.confirm).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", importId: IMPORT }));
  });

  it("uploads a spatial-entity CSV for the selected Master Plan version through the same path", async () => {
    prepareImport({}); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getByLabelText("Spatial-entity XLSX or CSV file"), new File(["Code,Name,Entity Type,X,Y,Width,Height\nZONE-NEW,New zone,zone,5,10,25,20"], "entities.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Create entities from file" }));
    await waitFor(() => expect(imp.state.createUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "masterPlanSpatial", context: { masterPlanVersionId: "version-1" } })));
    await waitFor(() => expect(imp.state.confirm).toHaveBeenCalled());
  });

  it("does not write a file the analysis rejected: the errors are shown and there is no confirmation", async () => {
    prepareImport({ status: "uploaded", external: { canConfirm: false, report: {} }, analysis: { headers: [], mapping: {}, errors: [{ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "code" }], errorsListed: 1, errorsTotal: 1 } });
    const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getAllByLabelText("XLSX or CSV file").at(-1)!, new File(["Progress\n84%"], "mapping.csv", { type: "text/csv" }));
    await user.click(screen.getAllByRole("button", { name: "Apply mapping" }).at(-1)!);
    expect((await screen.findAllByRole("alert")).map(node => node.textContent).join(" ")).toContain("IMPORT_REQUIRED_COLUMN_MISSING");
    expect(imp.state.confirm).not.toHaveBeenCalled();
  });

  it("uploads an allowed source file when adding a Master Plan revision", async () => {
    state.versionMutate.mockClear(); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getAllByLabelText(/Plan source .*Add version/).at(-1)!, new File(["png-binary"], "revision.png", { type: "image/png" }));
    await user.click(screen.getAllByRole("button", { name: "Add version" }).at(-1)!);
    await waitFor(() => expect(state.versionMutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", masterPlanId: "plan-1", sourceFileName: "revision.png", sourceMimeType: "image/png", sourceContentBase64: expect.any(String) })));
  });

  it("provides a safe link instead of rendering a PDF source as the map background", () => {
    state.data.versions[0] = { ...state.data.versions[0], sourceFileName: "baseline.pdf", sourceUrl: "https://signed.test/baseline.pdf" };
    render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getAllByText("This version source is not an image; open it in a separate tab.").at(-1)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open plan source" }).at(-1)?.getAttribute("href")).toBe("https://signed.test/baseline.pdf");
  });

  it("links a new spatial entity to authorized WBS and activity choices", async () => {
    state.data.versions[0] = { ...state.data.versions[0], sourceFileName: "baseline.png", sourceUrl: "https://signed.test/baseline.png" }; state.entityMutate.mockClear(); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    const form = screen.getAllByRole("button", { name: "Add entity" }).at(-1)?.closest("form"); if (!form) throw new Error("Entity form was not rendered"); const entityForm = within(form);
    await user.type(entityForm.getByLabelText("Code"), "UNIT-1"); await user.type(entityForm.getByLabelText("Name"), "Unit one");
    await user.selectOptions(entityForm.getByLabelText("Parent entity"), "entity-parent"); await user.selectOptions(entityForm.getByLabelText("WBS item"), "wbs-1"); await user.selectOptions(entityForm.getByLabelText("Activity"), "activity-1");
    fireEvent.submit(form);
    await waitFor(() => expect(state.entityMutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", masterPlanVersionId: "version-1", code: "UNIT-1", parentEntityId: "entity-parent", wbsItemId: "wbs-1", activityId: "activity-1" })));
  });

  it("a new entity whose parent, WBS and activity lists are put back on \"no link\" sends none of them: the sentinel never reaches the server (D-75 negative)", async () => {
    state.data.versions[0] = { ...state.data.versions[0], sourceFileName: "baseline.png", sourceUrl: "https://signed.test/baseline.png" }; state.entityMutate.mockClear(); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    const form = screen.getAllByRole("button", { name: "Add entity" }).at(-1)?.closest("form"); if (!form) throw new Error("Entity form was not rendered"); const entityForm = within(form);
    await user.type(entityForm.getByLabelText("Code"), "UNIT-2"); await user.type(entityForm.getByLabelText("Name"), "Unit two");
    for (const [label, id] of [["Parent entity", "entity-parent"], ["WBS item", "wbs-1"], ["Activity", "activity-1"]] as const) { await user.selectOptions(entityForm.getByLabelText(label), id); await user.selectOptions(entityForm.getByLabelText(label), "__none"); }
    fireEvent.submit(form);
    await waitFor(() => expect(state.entityMutate).toHaveBeenCalled());
    expect(state.entityMutate.mock.calls.at(-1)?.[0]).toMatchObject({ code: "UNIT-2", parentEntityId: undefined, wbsItemId: undefined, activityId: undefined });
  });

  it("draws a large plan on a canvas instead of one button per entity (G-135)", () => {
    const original = state.data;
    const template = original.entities[0];
    state.data = { ...original, entities: Array.from({ length: 1600 }, (_, index) => ({ ...template, id: `big-${index}`, code: `E-${index}`, name: `Entity ${index}`, geometry: JSON.stringify({ x: index % 90, y: Math.floor(index / 90) % 90, width: 2, height: 2 }), wbsItemId: null, activityId: null, parentEntityId: null })) } as typeof original;
    try {
      render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
      expect(screen.getByTestId("master-plan-canvas")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "E-5 Entity 5" })).toBeNull();
    } finally { state.data = original; }
  });

  it("keeps one button per entity on a small plan", () => {
    render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    expect(screen.queryByTestId("master-plan-canvas")).toBeNull();
    expect(screen.getByRole("button", { name: "ZONE-A Zone A" })).toBeTruthy();
  });
});

describe("ProjectMasterPlan checks its forms in the page's language (D-65)", () => {
  it("an empty entity adds nothing and says so in English under its first field", () => {
    state.isArabic = false; state.entityMutate.mockClear();
    render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    const form = screen.getAllByRole("button", { name: "Add entity" }).at(-1)!.closest("form")!;
    for (const field of Array.from(form.querySelectorAll<HTMLInputElement>("input[required]"))) fireEvent.change(field, { target: { value: "" } });
    expectEmptySubmitRefused(form, "en", state.entityMutate);
  });
});

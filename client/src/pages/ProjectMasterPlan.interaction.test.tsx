/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectMasterPlan } from "./ProjectMasterPlan";

const state = vi.hoisted(() => ({ data: { plans: [{ id: "plan-1", code: "MP-1", title: "Delivery map", status: "active", createdAt: new Date() }], versions: [{ id: "version-1", masterPlanId: "plan-1", versionNumber: 1, versionKind: "original", description: null, changeSummary: null, sourceFileName: "baseline.png", sourceUrl: "https://signed.test/baseline.png", createdAt: new Date() }], entities: [{ id: "entity-1", masterPlanVersionId: "version-1", parentEntityId: null, code: "ZONE-A", name: "Zone A", entityType: "zone", geometry: JSON.stringify({ x: 5, y: 10, width: 25, height: 20 }), status: "in_progress", progressPercent: "45", plannedValue: "100", actualValue: "40", forecastValue: "110", wbsItemId: null as string | null, activityId: null as string | null }] }, refetch: vi.fn(), mutate: vi.fn(), versionMutate: vi.fn(), entityMutate: vi.fn(), mappingMutate: vi.fn(), spatialImportMutate: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({}),
    masterPlans: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: state.data, refetch: state.refetch }) },
      create: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null }) },
      createVersion: { useMutation: () => ({ mutate: state.versionMutate, isPending: false, error: null }) },
      createSpatialEntity: { useMutation: () => ({ mutate: state.entityMutate, isPending: false, error: null }) },
      applyExcelMapping: { useMutation: () => ({ mutate: state.mappingMutate, isPending: false, isSuccess: false, error: null }) },
      importSpatialEntities: { useMutation: () => ({ mutate: state.spatialImportMutate, isPending: false, isSuccess: false, error: null }) },
    },
    projects: { getControls: { useQuery: () => ({ data: { wbs: [{ id: "wbs-1", code: "1.0", name: "Civil works" }], activities: [{ id: "activity-1", code: "A-01", name: "Mobilize crew" }] } }) } },
  },
}));

describe("ProjectMasterPlan", () => {
  afterEach(() => cleanup());

  it("selects a filtered spatial entity and reveals its authorized KPI details", async () => {
    const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByAltText("Map source").getAttribute("src")).toBe("https://signed.test/baseline.png");
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    expect(screen.getByText("Selected entity: ZONE-A · Zone A")).toBeTruthy(); expect(screen.getByText("Planned / actual / forecast: 100 / 40 / 110")).toBeTruthy();
  });

  it("shows only the project-authorized WBS and activity references for a selected entity", async () => {
    state.data.entities[0] = { ...state.data.entities[0], wbsItemId: "wbs-1", activityId: "activity-1" }; const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    expect(screen.getByText("WBS item: 1.0 · Civil works · Activity: A-01 · Mobilize crew")).toBeTruthy();
  });

  it("uploads a CSV mapping for the selected Master Plan version", async () => {
    state.mappingMutate.mockClear(); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getAllByLabelText("XLSX or CSV file").at(-1)!, new File(["Unit ID,Progress\nZONE-A,84%"], "mapping.csv", { type: "text/csv" }));
    await user.click(screen.getAllByRole("button", { name: "Apply mapping" }).at(-1)!);
    await waitFor(() => expect(state.mappingMutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", masterPlanVersionId: "version-1", format: "csv", base64: expect.any(String) })));
  });

  it("uploads a spatial-entity CSV for the selected Master Plan version", async () => {
    state.spatialImportMutate.mockClear(); const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.upload(screen.getByLabelText("Spatial-entity XLSX or CSV file"), new File(["Code,Name,Entity Type,X,Y,Width,Height\nZONE-NEW,New zone,zone,5,10,25,20"], "entities.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Create entities from file" }));
    await waitFor(() => expect(state.spatialImportMutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", masterPlanVersionId: "version-1", format: "csv", base64: expect.any(String) })));
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
    await user.selectOptions(entityForm.getByLabelText("WBS item"), "wbs-1"); await user.selectOptions(entityForm.getByLabelText("Activity"), "activity-1");
    fireEvent.submit(form);
    await waitFor(() => expect(state.entityMutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", masterPlanVersionId: "version-1", code: "UNIT-1", wbsItemId: "wbs-1", activityId: "activity-1" })));
  });
});

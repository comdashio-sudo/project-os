/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PmcSitePlan } from "./PmcSitePlan";

const h = vi.hoisted(() => ({
  arabic: false,
  inputs: [] as unknown[],
  cardInputs: [] as unknown[],
  plan: true,
  withoutPolygon: 1,
  fail: false,
  upload: vi.fn(),
  directCreate: vi.fn(),
  put: vi.fn(),
  setStatus: vi.fn(),
  evm: null as null | { evBefore: number; evAfter: number; changed: unknown[] },
  save: vi.fn(),
  saveResult: undefined as undefined | { saved: number; errors: Array<{ index: number; unitNumber: number | null; code: string }> },
}));
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: h.put }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic, language: (h.arabic) ? "ar" : "en", isRtl: h.arabic }) }));
const square = (x: number, y: number) => ({ type: "Polygon", coordinates: [[[x, y], [x + 0.1, y], [x + 0.1, y + 0.1], [x, y + 0.1], [x, y]]] });
vi.mock("@/lib/trpc", () => ({ trpc: { directUploads: { create: { useMutation: () => ({ mutateAsync: h.directCreate, isPending: false, error: null }) } }, pmc: {
  siteMap: { useQuery: (input: { activityCode?: string }) => {
    h.inputs.push(input);
    if (h.fail) return { isLoading: false, error: new Error("x"), data: undefined, refetch: vi.fn() };
    const byActivity = !!input.activityCode;
    return { isLoading: false, error: null, refetch: vi.fn(), data: {
      currency: "SAR",
      plan: h.plan ? { url: "https://files.example.test/plan.png", widthPx: 1000, heightPx: 500, fileName: "plan.png", uploadedAt: new Date() } : null,
      activities: [{ code: "WALLS", name: "Walls" }],
      withoutPolygon: h.withoutPolygon,
      units: [
        { unitNumber: 1, modelCode: "A", zoneCode: "Z1", blockCode: "B1", geometry: square(0.1, 0.1), status: byActivity ? "COMPLETE" : null, progressPercent: byActivity ? null : 100 },
        { unitNumber: 2, modelCode: "A", zoneCode: "Z1", blockCode: "B1", geometry: square(0.4, 0.1), status: byActivity ? "IN_PROGRESS" : null, progressPercent: byActivity ? null : 40 },
        { unitNumber: 3, modelCode: "A", zoneCode: "Z1", blockCode: "B1", geometry: null, status: null, progressPercent: 0 },
      ],
    } };
  } },
  unitCard: { useQuery: (input: { unitNumber: number }, options: { enabled: boolean }) => {
    h.cardInputs.push({ input, options });
    if (!options.enabled) return { isLoading: false, error: null, data: undefined };
    return { isLoading: false, error: null, refetch: vi.fn(), data: { unitId: "unit-id", unitNumber: input.unitNumber, modelCode: "A", zoneCode: "Z1", blockCode: "B1", progressPercent: 40, activities: [{ definitionId: "def-id", code: "WALLS", name: "Walls", groupName: "Civil", stageName: "Internal", weightPercent: 10, status: "IN_PROGRESS", verificationStatus: "Verifier pending", engineer: "Eng One", lastChangedAt: null }] } };
  } },
  setUnitActivityStatus: { useMutation: (options: { onSuccess?: (result: unknown) => void }) => ({ mutate: (input: unknown) => { h.setStatus(input); options.onSuccess?.({ evm: h.evm }); }, error: null, isPending: false }) },
  uploadSitePlan: { useMutation: () => ({ mutate: h.upload, error: null }) },
  saveUnitGeometries: { useMutation: () => ({ mutate: h.save, error: null, data: h.saveResult }) },
} } }));

afterEach(() => { cleanup(); Object.assign(h, { arabic: false, inputs: [], cardInputs: [], plan: true, withoutPolygon: 1, fail: false, saveResult: undefined, evm: null }); vi.clearAllMocks(); });
const polygons = () => Array.from(document.querySelectorAll("polygon"));

describe("PmcSitePlan", () => {
  it("draws one clickable polygon per unit that has one, scaled to the plan, and counts those without", () => {
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    expect(polygons().map(p => p.getAttribute("data-unit"))).toEqual(["1", "2"]);
    expect(polygons()[0].getAttribute("points")).toBe("100.0,50.0 200.0,50.0 200.0,100.0 100.0,100.0 100.0,50.0");
    expect(screen.getByRole("img", { name: "Site plan" }).getAttribute("viewBox")).toBe("0 0 1000 500");
    expect(screen.getByText("1 units have no outline on the plan")).toBeTruthy();
  });

  it("colours by status for an activity and sends the activity with the query", () => {
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "WALLS" } });
    expect((h.inputs[h.inputs.length - 1] as { activityCode?: string }).activityCode).toBe("WALLS");
    expect(polygons()[0].getAttribute("fill")).toBe("#34d399");
    expect(polygons()[1].getAttribute("fill")).toBe("#fbbf24");
    expect(polygons()[1].getAttribute("aria-label")).toBe("Unit 2: In progress");
  });

  it("opens the unit card on click and on Enter, and closes it", () => {
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    expect(screen.queryByTestId("unit-card")).toBeNull();
    fireEvent.click(polygons()[1]);
    expect(screen.getByTestId("unit-card").textContent).toContain("WALLS · Walls");
    expect(screen.getByTestId("unit-card").textContent).toContain("Verifier pending");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("unit-card")).toBeNull();
    fireEvent.keyDown(polygons()[0], { key: "Enter" });
    expect(screen.getByTestId("unit-card").textContent).toContain("Unit 1");
  });

  it("tells the user what to upload when there is no plan, and shows the file problems after a refused GeoJSON", () => {
    h.plan = false;
    h.saveResult = { saved: 0, errors: [{ index: 1, unitNumber: 9, code: "PMC_UNIT_NOT_FOUND" }] };
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    expect(screen.getByText(/No site plan has been uploaded yet/)).toBeTruthy();
    expect(polygons().length).toBe(0);
    expect(screen.getByRole("alert").textContent).toContain("#2 · 9 · PMC_UNIT_NOT_FOUND");
  });

  it("shows an error with retry, and Arabic labels", () => {
    h.fail = true;
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    cleanup();
    h.fail = false; h.arabic = true;
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    expect(screen.getByLabelText("النشاط")).toBeTruthy();
    expect(screen.getByText("1 وحدة بلا مضلع على المخطط")).toBeTruthy();
  });

  it("changes an activity's status from the unit card and shows the earned value before and after", () => {
    h.evm = { evBefore: 250, evAfter: 500, changed: [{ code: "WBS-WALLS" }] };
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    fireEvent.click(polygons()[1]);
    fireEvent.change(screen.getByLabelText("Change status: WALLS"), { target: { value: "COMPLETE" } });
    expect(h.setStatus).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", unitId: "unit-id", activityDefinitionId: "def-id", status: "COMPLETE" });
    expect(screen.getByTestId("evm-effect").textContent).toBe("Earned value: 250 SAR → 500 SAR · 1 WBS item(s) moved");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(polygons()[0]);
    expect(screen.queryByTestId("evm-effect")).toBeNull(); // the previous unit's effect is not left on another unit's card
  });

  it("says plainly when no linked WBS item moved", () => {
    h.evm = { evBefore: 0, evAfter: 0, changed: [] };
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    fireEvent.click(polygons()[1]);
    fireEvent.change(screen.getByLabelText("Change status: WALLS"), { target: { value: "IN_PROGRESS" } });
    expect(screen.getByTestId("evm-effect").textContent).toBe("No linked WBS item changed its progress");
  });

  it("uploads the plan image straight to storage and sends only the key to the screen's own procedure (G-139)", async () => {
    h.directCreate.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/u", uploadKey: "uploads/t/p/sitePlan/pending/k/plan.png", headers: { "content-type": "image/png" }, maxBytes: 1 });
    h.put.mockReset().mockResolvedValue(undefined); h.upload.mockClear();
    render(<PmcSitePlan tenantId="t" projectId="p" />);
    const file = new File([new Uint8Array(2048)], "plan.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload plan image"), { target: { files: [file] } });
    await waitFor(() => expect(h.upload).toHaveBeenCalled());
    expect(h.directCreate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", purpose: "sitePlan", fileName: "plan.png", contentType: "image/png" }));
    expect(h.put).toHaveBeenCalledWith("https://storage.example.test/u", { "content-type": "image/png" }, file, expect.any(Function));
    expect(h.upload).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", fileName: "plan.png", uploadKey: "uploads/t/p/sitePlan/pending/k/plan.png" });
  });
});


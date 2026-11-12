/** @vitest-environment jsdom */
// Synthetic fixtures only. Plan, unit codes and drawing are built here; no real project or drawing data.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MasterPlanDrawing } from "./MasterPlanDrawing";
import { buildRasterDrawing, type GrayImage } from "@/lib/raster/rasterCore";

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  error: null as unknown,
  layout: undefined as unknown,
  calibrate: vi.fn(async () => ({})),
  siteMap: { activities: [{ code: "BLK", name: "Blockwork" }], units: [] as unknown[] } as unknown,
  siteMapError: null as unknown,
}));

// The raster path is exercised for real in rasterPipeline.test.tsx; here only its wiring to the screen is under test.
const raster = vi.hoisted(() => ({ readRasterImage: vi.fn(), readPdfPage: vi.fn(), analyseRaster: vi.fn(), createOcrWorker: vi.fn() }));
vi.mock("@/lib/raster/rasterFile", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/raster/rasterFile")>()), readRasterImage: raster.readRasterImage, readPdfPage: raster.readPdfPage }));
vi.mock("@/lib/raster/ocrWorker", () => ({ createOcrWorker: raster.createOcrWorker }));
vi.mock("@/lib/raster/rasterAnalysis", () => ({ analyseRaster: raster.analyseRaster }));

vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false, isRtl: false }) }));
// The saved layout (G-189) is a separate hook; its queries and mutations are stubbed here, the hook itself is exercised by its own tests.
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) });
  return {
    trpc: {
      useUtils: () => ({ masterPlans: { drawingLayout: { fetch: vi.fn(), invalidate: vi.fn() } } }),
      directUploads: { create: mutation() },
      pmc: { siteMap: { useQuery: (input: { activityCode?: string }) => ({ data: state.siteMapError ? undefined : input.activityCode ? { activities: [{ code: "BLK", name: "Blockwork" }], units: (state.siteMap as { units: unknown[] }).units } : { activities: [{ code: "BLK", name: "Blockwork" }], units: [] }, error: state.siteMapError }) } },
      masterPlans: {
        list: { useQuery: () => ({ data: state.data, isLoading: state.isLoading, error: state.error, refetch: vi.fn() }) },
        drawingLayout: { useQuery: () => ({ data: state.layout, isLoading: false, error: null, refetch: vi.fn() }) },
        uploadDrawingVersion: mutation(),
        saveDrawingLayout: mutation(),
        linkDrawingUnit: mutation(),
        unlinkDrawingUnit: mutation(),
        saveDrawingCalibration: { useMutation: () => ({ mutateAsync: state.calibrate, isPending: false }) },
      },
    },
  };
});

const PLAN = { id: "plan-1", code: "MP-1", title: "Delivery map", status: "active", createdAt: new Date("2026-10-01") };
const VERSION = { id: "version-2", masterPlanId: "plan-1", versionNumber: 2 };
const OLD_VERSION = { id: "version-1", masterPlanId: "plan-1", versionNumber: 1 };
const unit = (id: string, code: string, status = "not_started", versionId = "version-2") => ({
  id, masterPlanVersionId: versionId, code, name: `Unit ${code}`, entityType: "unit", status, progressPercent: "0",
});

function plan(entities = [unit("unit-1", "B1-U-0001"), unit("unit-2", "B1-U-0002", "completed"), unit("unit-3", "B1-U-0003")]) {
  return { plans: [PLAN], versions: [VERSION, OLD_VERSION], entities: [...entities, unit("old-1", "B1-U-0001", "blocked", "version-1")] };
}

type Group = [number, string | number];
const group = (code: number, value: string | number): string => `${code}\r\n${value}\r\n`;
const entity = (type: string, groups: Group[]): string => group(0, type) + groups.map(([code, value]) => group(code, value)).join("");
function dxf(entities: string): string {
  return (
    group(0, "SECTION") + group(2, "HEADER") + group(9, "$ACADVER") + group(1, "AC1027") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "TABLES") + group(0, "TABLE") + group(2, "LAYER") + group(70, 1) +
    group(0, "LAYER") + group(2, "UNITS") + group(70, 0) + group(62, 7) + group(6, "CONTINUOUS") +
    group(0, "ENDTAB") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "ENTITIES") + entities + group(0, "ENDSEC") + group(0, "EOF")
  );
}
const square = (x: number, y: number): string =>
  entity("LWPOLYLINE", [[8, "UNITS"], [90, 4], [70, 1], [10, x], [20, y], [10, x + 10], [20, y], [10, x + 10], [20, y + 10], [10, x], [20, y + 10]]);
const label = (x: number, y: number, value: string): string => entity("TEXT", [[8, "UNITS"], [10, x], [20, y], [40, 2.5], [1, value]]);
const DRAWING = dxf(square(0, 0) + label(5, 5, "B1-U-0001") + square(20, 0) + label(25, 5, "B1-U-0002") + square(40, 0));

async function upload(container: HTMLElement, content: string, name = "plan.dxf") {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type: "application/octet-stream" });
  fireEvent.change(input, { target: { files: [file] } });
}

afterEach(() => {
  cleanup();
  state.data = undefined;
  state.isLoading = false;
  state.error = null;
  state.layout = undefined;
  state.calibrate.mockClear();
  state.siteMapError = null;
  vi.restoreAllMocks();
});

describe("MasterPlanDrawing", () => {
  it("tells the reviewer that the plan has no units yet", () => {
    state.data = { plans: [PLAN], versions: [VERSION], entities: [] };
    render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    expect(screen.getByRole("note").textContent).toMatch(/no units/);
  });

  it("Q-7: a project with no master plan says so, still shows an uploaded drawing, and offers no save", async () => {
    state.data = { plans: [], versions: [], entities: [] };
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    expect(screen.getByRole("note").textContent).toMatch(/no master plan yet/);
    await upload(container, DRAWING);
    await waitFor(() => screen.getByText(/Unlinked: 3/));
    expect((screen.getByRole("button", { name: "Save layout" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a section error, not an empty plan, when the plan list cannot be read", () => {
    state.data = undefined;
    state.error = { message: "unavailable" };
    render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("matches an uploaded drawing and counts links as proposals until confirmed", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => expect(screen.getByText(/Confirmed: 0 · Proposed: 2 · Unlinked: 1 · Units remaining: 3 of 3/)).toBeTruthy());
  });

  it("confirms a proposal and reflects it in the summary", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => screen.getByText(/Proposed: 2/));
    fireEvent.click(screen.getByRole("button", { name: /Shape 1 · Proposed · B1-U-0001/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText(/Confirmed: 1 · Proposed: 1 · Unlinked: 1 · Units remaining: 2 of 3/)).toBeTruthy());
  });

  it("shows the unit status of a confirmed shape", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => screen.getByText(/Proposed: 2/));
    fireEvent.click(screen.getByRole("button", { name: /Shape 2 · Proposed · B1-U-0002/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByText("Completed")).toBeTruthy());
  });

  it("loads the saved layout when the drawing opens: its shapes, the confirmed link, and the saved version", async () => {
    state.data = plan();
    state.layout = {
      drawingId: "drawing-1",
      latestVersion: { id: "dv-2", versionNumber: 2, fileName: "saved-plan.dxf", mimeType: "application/dxf", sizeBytes: 10, pageCount: 1, checksumSha256: "a".repeat(64), uploadedByUserId: 1, createdAt: new Date("2026-10-20") },
      versions: [],
      polygons: [
        { id: "srv-1", ref: "P1", label: "B1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
        { id: "srv-2", ref: "P2", label: "", points: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }] },
      ],
      links: [{ polygonId: "srv-1", entityId: "unit-1", confirmedByUserId: 1, confirmedAt: new Date("2026-10-20") }],
    };
    render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await waitFor(() => screen.getByText("Saved drawing: version 2, saved-plan.dxf"));
    expect(screen.getByRole("button", { name: /Shape 1 · Confirmed · B1-U-0001/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Shape 2 · Unlinked/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save layout" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("offers no save until a drawing is open, even when the plan has units", async () => {
    state.data = plan();
    render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await waitFor(() => screen.getByText("No drawing uploaded yet."));
    expect(screen.queryByRole("button", { name: "Save layout" })).toBeNull();
  });

  it("shows a read error for a file that is not a DXF drawing", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "this is not a drawing");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/Confirmed:/)).toBeNull();
  });

  it("exports only confirmed links as CSV", async () => {
    state.data = plan();
    const created: Blob[] = [];
    // jsdom has no object URLs, so the export is captured here instead of downloaded.
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return "blob:x"; });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, DRAWING);
    await waitFor(() => screen.getByText(/Proposed: 2/));
    fireEvent.click(screen.getByRole("button", { name: /Shape 1 · Proposed · B1-U-0001/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    fireEvent.click(screen.getByRole("button", { name: "Export confirmed links (CSV)" }));
    const csv = await created[0].text();
    expect(csv.split("\n")[0]).toBe("polygon_id,unit_code,unit_id");
    expect(csv).toContain("B1-U-0001");
    expect(csv).not.toContain("B1-U-0002");
  });

  it("reads a PNG through the raster path: shapes become proposals only where a code was read", async () => {
    state.data = plan();
    const image: GrayImage = { width: 1, height: 1, data: new Uint8Array(1) };
    raster.readRasterImage.mockResolvedValue(image);
    raster.createOcrWorker.mockResolvedValue({ recognize: vi.fn(), terminate: vi.fn(async () => undefined) });
    raster.analyseRaster.mockResolvedValue({
      drawing: buildRasterDrawing([
        { id: "shape-1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], x: 0, y: 0, width: 10, height: 10 },
        { id: "shape-2", points: [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }], x: 20, y: 0, width: 10, height: 10 },
      ], [{ polygonId: "shape-1", text: "B1-U-0001" }], 100),
      shapeCount: 2,
      labelCount: 1,
    });
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "png-bytes", "plan.png");
    await waitFor(() => expect(screen.getByText(/Confirmed: 0 · Proposed: 1 · Unlinked: 1/)).toBeTruthy());
    expect(screen.getByText(/Found 2 shapes and read the code in 1 of them/)).toBeTruthy();
  });

  it("shows a raster read error and no drawing when the image cannot be decoded", async () => {
    state.data = plan();
    raster.readRasterImage.mockRejectedValue(new Error("corrupt"));
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "not an image", "plan.jpg");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/could not be read/));
    expect(screen.queryByText(/Confirmed:/)).toBeNull();
  });

  it("refuses a file type that is neither a DXF nor a raster image", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "bytes", "plan.xyz");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/not supported/));
    expect(raster.readRasterImage).not.toHaveBeenCalled();
  });

  it("Q-7: refuses a DWG with a message that asks for DXF or PDF, and reads nothing", async () => {
    state.data = plan();
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    expect((container.querySelector('input[type="file"]') as HTMLInputElement).accept).toContain(".dwg");
    await upload(container, "AC1032 synthetic", "PLAN.DWG");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/save it as DXF or PDF/));
    expect(raster.readRasterImage).not.toHaveBeenCalled();
    expect(raster.readPdfPage).not.toHaveBeenCalled();
    expect(screen.queryByText(/Confirmed:/)).toBeNull();
  });

  it("Q-7: an uploaded image is shown under its shapes, framed by the picture", async () => {
    state.data = plan();
    URL.createObjectURL = vi.fn(() => "blob:picture");
    raster.readRasterImage.mockResolvedValue({ width: 640, height: 480, data: new Uint8Array(640 * 480) });
    raster.createOcrWorker.mockResolvedValue({ recognize: vi.fn(), terminate: vi.fn(async () => undefined) });
    raster.analyseRaster.mockResolvedValue({ drawing: buildRasterDrawing([{ id: "shape-1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], x: 0, y: 0, width: 10, height: 10 }], [], 480), shapeCount: 1, labelCount: 0 });
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "png-bytes", "plan.png");
    await waitFor(() => expect(screen.getByTestId("drawing-background")).toBeTruthy());
    const picture = screen.getByTestId("drawing-background");
    expect(picture.getAttribute("href")).toBe("blob:picture");
    expect([picture.getAttribute("width"), picture.getAttribute("height")]).toEqual(["640", "480"]);
    expect(screen.getByRole("img", { name: "Drawing map" }).getAttribute("viewBox")).toBe("0 0 640 480");
    // a file not saved yet cannot be calibrated
    expect((screen.getByRole("button", { name: "Two-point calibration" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Save the layout first/)).toBeTruthy();
  });

  it("Q-7: a saved raster drawing gets its picture back from the stored file", async () => {
    state.data = plan();
    state.layout = {
      drawingId: "drawing-1",
      latestVersion: { id: "dv-1", versionNumber: 1, fileName: "plan.png", mimeType: "image/png", sizeBytes: 10, pageCount: 1, checksumSha256: "a".repeat(64), uploadedByUserId: 1, createdAt: new Date("2026-10-20") },
      versions: [], links: [], calibration: null,
      polygons: [{ id: "srv-1", ref: "P1", label: "", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }],
      background: { width: 300, height: 200, page: 1 },
      backgroundUrl: "https://files.example.test/signed-plan.png",
    };
    render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await waitFor(() => expect(screen.getByTestId("drawing-background").getAttribute("href")).toBe("https://files.example.test/signed-plan.png"));
  });

  describe("Q-8: linking by hand and the «not linked» list", () => {
    async function openDrawing() {
      state.data = plan();
      const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
      await upload(container, DRAWING);
      await waitFor(() => screen.getByText(/Proposed: 2/));
      return screen.getByRole("img", { name: "Drawing map" }) as unknown as SVGSVGElement;
    }
    const tapAt = (svg: SVGSVGElement, x: number, y: number) => {
      const [bx, by, bw, bh] = svg.getAttribute("viewBox")!.split(" ").map(Number);
      svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: bw, height: bh, right: bw, bottom: bh, x: 0, y: 0, toJSON: () => ({}) });
      // this drawing's frame flips y around minY + maxY = 10
      fireEvent.click(svg, { clientX: x - bx, clientY: 10 - y - by, detail: 1 });
    };

    it("lists the units with no confirmed shape; a tap places the chosen unit, confirmed, and the list moves on", async () => {
      const svg = await openDrawing();
      expect(screen.getByText("Not linked: 3 of 3")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "B1-U-0003" }));
      fireEvent.click(screen.getByRole("button", { name: "Link by a tap" }));
      tapAt(svg, 55, 5);
      await waitFor(() => screen.getByText("B1-U-0003 linked. Save the layout to keep the link."));
      expect(screen.getByText("Not linked: 2 of 3")).toBeTruthy();
      expect(screen.getByRole("button", { name: /Shape 4 · Confirmed · B1-U-0003/ })).toBeTruthy();
      expect((screen.getByRole("button", { name: "B1-U-0001" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
      // while linking, the shapes take no taps (a phone would move the tap onto them)
      expect((svg.querySelector("polygon") as SVGPolygonElement).style.pointerEvents).toBe("none");
    });

    it("a tap inside a read shape that is not confirmed links that shape instead of adding a marker", async () => {
      const svg = await openDrawing();
      fireEvent.click(screen.getByRole("button", { name: "B1-U-0003" }));
      fireEvent.click(screen.getByRole("button", { name: "Link by a tap" }));
      tapAt(svg, 45, 5); // inside the third read square (40..50), which had no text
      await waitFor(() => screen.getByText(/B1-U-0003 linked/));
      expect(screen.getByRole("button", { name: /Shape 3 · Confirmed · B1-U-0003/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Shape 4/ })).toBeNull();
    });

    it("a polygon needs three corners before it closes; closing links it", async () => {
      const svg = await openDrawing();
      fireEvent.click(screen.getByRole("button", { name: "B1-U-0003" }));
      fireEvent.click(screen.getByRole("button", { name: "Draw a polygon" }));
      tapAt(svg, 50, 1); tapAt(svg, 58, 1);
      expect((screen.getByRole("button", { name: "Close the polygon (2 points)" }) as HTMLButtonElement).disabled).toBe(true);
      tapAt(svg, 58, 9);
      fireEvent.click(screen.getByRole("button", { name: "Close the polygon (3 points)" }));
      await waitFor(() => screen.getByText(/B1-U-0003 linked/));
      expect(screen.getByText("Not linked: 2 of 3")).toBeTruthy();
    });

    it("a hand-drawn shape can be removed and its unit returns to the list; a read shape has no remove button", async () => {
      const svg = await openDrawing();
      fireEvent.click(screen.getByRole("button", { name: "B1-U-0003" }));
      fireEvent.click(screen.getByRole("button", { name: "Link by a tap" }));
      tapAt(svg, 55, 5);
      await waitFor(() => screen.getByText(/B1-U-0003 linked/));
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      fireEvent.click(screen.getByRole("button", { name: /Shape 1 ·/ }));
      expect(screen.queryByRole("button", { name: "Remove the shape" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Shape 4 · Confirmed · B1-U-0003/ }));
      fireEvent.click(screen.getByRole("button", { name: "Remove the shape" }));
      expect(screen.getByText("Not linked: 3 of 3")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Shape 4/ })).toBeNull();
    });
  });

  describe("Q-8 (b): colouring by a PMC activity's site status", () => {
    async function colouredDrawing() {
      state.data = plan();
      (state.siteMap as { units: unknown[] }).units = [
        { unitNumber: 1, modelCode: "A", blockCode: "B1", status: "COMPLETE" },
        { unitNumber: 2, modelCode: "B", blockCode: "B2", status: "IN_PROGRESS" },
      ];
      const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
      await upload(container, DRAWING);
      await waitFor(() => screen.getByText(/Proposed: 2/));
      for (const name of [/Shape 1 · Proposed/, /Shape 2 · Proposed/]) { fireEvent.click(screen.getByRole("button", { name })); fireEvent.click(screen.getByRole("button", { name: "Confirm" })); }
      fireEvent.change(screen.getByLabelText("Colour by"), { target: { value: "BLK" } });
      return container;
    }

    it("colours each linked shape by its villa's status (matched by the number in the code) and counts them in the key", async () => {
      const container = await colouredDrawing();
      const colours = Array.from(container.querySelectorAll("polygon[data-colour]")).map(node => node.getAttribute("data-colour"));
      expect(colours).toEqual(["COMPLETE", "IN_PROGRESS"]);
      expect(container.querySelector('[data-key="COMPLETE"] [data-count]')?.textContent).toBe("1");
      expect(container.querySelector('[data-key="IN_PROGRESS"] [data-count]')?.textContent).toBe("1");
      expect(container.querySelector('[data-key="NOT_STARTED"] [data-count]')?.textContent).toBe("0");
      // the unconfirmed third shape keeps its neutral colour: a proposal is never coloured as a villa
      expect(container.querySelectorAll("polygon[data-colour]")).toHaveLength(2);
    });

    it("the block filter dims the other villas, and a linked shape opens its villa card", async () => {
      const container = await colouredDrawing();
      fireEvent.change(screen.getByLabelText("Block"), { target: { value: "B2" } });
      const [first, second] = Array.from(container.querySelectorAll("polygon[data-colour]"));
      expect(first!.getAttribute("fill-opacity")).toBe("0.08");
      expect(second!.getAttribute("fill-opacity")).not.toBe("0.08");
      fireEvent.click(screen.getByRole("button", { name: /Shape 1 · Confirmed/ }));
      expect(screen.getByRole("link", { name: "Villa card" }).getAttribute("href")).toBe("/m/t/p/unit/1?activity=BLK");
    });

    it("site statuses that fail to load say so, and the plan's own status colouring stays", async () => {
      state.siteMapError = { message: "forbidden" };
      state.data = plan();
      const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
      await upload(container, DRAWING);
      await waitFor(() => screen.getByText(/Site statuses could not be loaded/));
      expect(container.querySelectorAll("polygon[data-colour]")).toHaveLength(0);
    });
  });

  describe("Q-7: two-point calibration and measuring", () => {
    // A saved DXF drawing whose frame is known, so a tap on the map lands on a known drawing point.
    function savedDrawing(calibration: unknown = null) {
      state.data = plan();
      state.layout = {
        drawingId: "drawing-1",
        latestVersion: { id: "dv-1", versionNumber: 1, fileName: "plan.dxf", mimeType: "application/dxf", sizeBytes: 10, pageCount: 1, checksumSha256: "a".repeat(64), uploadedByUserId: 1, createdAt: new Date("2026-10-20") },
        versions: [], links: [], background: null, backgroundUrl: null, calibration,
        polygons: [{ id: "srv-1", ref: "P1", label: "", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }],
      };
      render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    }
    // Map the SVG so one screen pixel is one unit of its viewBox: then a tap at (vx - box.x, vy - box.y) is the viewBox point (vx, vy).
    function tap(svg: SVGSVGElement, drawingX: number, drawingY: number) {
      const [bx, by, bw, bh] = svg.getAttribute("viewBox")!.split(" ").map(Number);
      svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: bw, height: bh, right: bw, bottom: bh, x: 0, y: 0, toJSON: () => ({}) });
      // the map draws y downwards: a drawing point (x, y) is at viewBox y = 100 + pad*2 + ... ; flipY of this drawing is minY + maxY - y = 100 - y
      fireEvent.click(svg, { clientX: drawingX - bx, clientY: 100 - drawingY - by, detail: 1 });
    }

    it("saves two picked points and the real distance, then measures another length in metres", async () => {
      savedDrawing();
      await waitFor(() => screen.getByText(/not calibrated yet/));
      expect((screen.getByRole("button", { name: "Measure a distance" }) as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Two-point calibration" }));
      const svg = screen.getByRole("img", { name: "Drawing map" }) as unknown as SVGSVGElement;
      tap(svg, 0, 0);
      tap(svg, 80, 0);
      fireEvent.change(screen.getByLabelText(/Real distance/), { target: { value: "40" } });
      fireEvent.click(screen.getByRole("button", { name: "Save calibration" }));
      await waitFor(() => expect(state.calibrate).toHaveBeenCalledTimes(1));
      const sent = (state.calibrate.mock.calls[0] as unknown as [{ calibration: { a: { x: number; y: number }; b: { x: number; y: number }; meters: number } }])[0].calibration;
      expect(sent.meters).toBe(40);
      expect(sent.a.x).toBeCloseTo(0, 6);
      expect(sent.a.y).toBeCloseTo(0, 6);
      expect(sent.b.x).toBeCloseTo(80, 6);
      await waitFor(() => screen.getByText(/calibrated: 0\.5000 metres per drawing unit/));
      fireEvent.click(screen.getByRole("button", { name: "Measure a distance" }));
      tap(svg, 10, 10);
      tap(svg, 10, 70); // 60 units at 0.5 m per unit
      expect(screen.getByText("Length: 30.00 m")).toBeTruthy();
    });

    it("refuses a distance of zero and two taps on the same point without calling the server", async () => {
      savedDrawing();
      await waitFor(() => screen.getByText(/not calibrated yet/));
      fireEvent.click(screen.getByRole("button", { name: "Two-point calibration" }));
      const svg = screen.getByRole("img", { name: "Drawing map" }) as unknown as SVGSVGElement;
      tap(svg, 20, 20);
      tap(svg, 60, 20);
      fireEvent.change(screen.getByLabelText(/Real distance/), { target: { value: "0" } });
      fireEvent.click(screen.getByRole("button", { name: "Save calibration" }));
      expect(screen.getByRole("alert").textContent).toMatch(/above zero/);
      tap(svg, 30, 30);
      tap(svg, 30, 30);
      fireEvent.change(screen.getByLabelText(/Real distance/), { target: { value: "12" } });
      fireEvent.click(screen.getByRole("button", { name: "Save calibration" }));
      expect(screen.getByRole("alert").textContent).toMatch(/same/);
      expect(state.calibrate).not.toHaveBeenCalled();
    });

    it("a saved calibration measures at once, and a tap while measuring does not select a shape", async () => {
      savedDrawing({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, meters: 25 });
      await waitFor(() => screen.getByText(/calibrated: 0\.2500/));
      fireEvent.click(screen.getByRole("button", { name: "Measure a distance" }));
      const svg = screen.getByRole("img", { name: "Drawing map" }) as unknown as SVGSVGElement;
      tap(svg, 0, 50);
      tap(svg, 100, 50);
      expect(screen.getByText("Length: 25.00 m")).toBeTruthy();
      expect(screen.getByTestId("measure-overlay").querySelectorAll("circle")).toHaveLength(2);
      // a phone moves a tap onto the nearest clickable shape, so the shapes take no taps while measuring, and take them again after
      const polygonEl = svg.querySelector("polygon") as SVGPolygonElement;
      expect(polygonEl.style.pointerEvents).toBe("none");
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(polygonEl.style.pointerEvents).toBe("");
    });
  });

  it("offers a page choice for a multi-page PDF and reads the page the reviewer picks", async () => {
    state.data = plan();
    const blank: GrayImage = { width: 1, height: 1, data: new Uint8Array(1) };
    raster.readPdfPage.mockResolvedValue({ image: blank, pageCount: 3 });
    raster.createOcrWorker.mockResolvedValue({ recognize: vi.fn(), terminate: vi.fn(async () => undefined) });
    // page 1 has one shape, page 2 has three: the count on screen says which page was analysed
    const analysis = (shapeCount: number) => ({ drawing: buildRasterDrawing([], [], 1), shapeCount, labelCount: 0 });
    raster.analyseRaster.mockResolvedValueOnce(analysis(1)).mockResolvedValueOnce(analysis(3));
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "%PDF synthetic", "plan.pdf");
    const picker = await waitFor(() => screen.getByRole("combobox"));
    expect(raster.readPdfPage).toHaveBeenLastCalledWith(expect.any(Uint8Array), 1);
    expect(screen.getByRole("option", { name: "Page 2 of 3" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Page 3 of 3" })).toBeTruthy();
    await waitFor(() => screen.getByText(/Found 1 shapes/));
    fireEvent.change(picker, { target: { value: "2" } });
    await waitFor(() => expect(raster.readPdfPage).toHaveBeenLastCalledWith(expect.any(Uint8Array), 2));
    await waitFor(() => screen.getByText(/Found 3 shapes/));
    expect(raster.readPdfPage).toHaveBeenCalledTimes(2);
  });

  it("shows no page choice for a one-page PDF", async () => {
    state.data = plan();
    const blank: GrayImage = { width: 1, height: 1, data: new Uint8Array(1) };
    raster.readPdfPage.mockResolvedValue({ image: blank, pageCount: 1 });
    raster.createOcrWorker.mockResolvedValue({ recognize: vi.fn(), terminate: vi.fn(async () => undefined) });
    raster.analyseRaster.mockResolvedValue({ drawing: buildRasterDrawing([], [], 1), shapeCount: 0, labelCount: 0 });
    const { container } = render(<MasterPlanDrawing tenantId="t" projectId="p" />);
    await upload(container, "%PDF synthetic", "plan.pdf");
    await waitFor(() => screen.getByText(/Found 0 shapes/));
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

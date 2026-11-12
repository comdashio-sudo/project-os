import { projectErrorCode } from "./errorCode";
// The server side of the saved Master Plan drawing (G-189): load the layout of the drawing of the newest version, and save it when the person confirms.
// Saving stores the drawing file as a new version when a new file was picked, replaces the polygons, then brings the confirmed links to what is on
// screen (unlinks first, so a unit can move to another shape). Only confirmed links are sent; the automatic proposals never leave the browser.
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useDirectUpload } from "@/lib/useDirectUpload";
import type { ProjectUnit } from "./dxf/dxfMatch";
import type { DxfDrawing } from "./dxf/dxfReader";
import type { ReviewItem } from "./dxf/dxfReview";
import { layoutToReview, linkChanges, polygonsToSave } from "./masterPlanDrawingLayout";
import type { DrawingBackground, DrawingCalibration } from "@shared/masterPlanCalibration";

const NO_VERSION = "00000000-0000-4000-8000-000000000000";

export type SaveOutcome = { ok: true } | { ok: false; code: string };

export function useMasterPlanDrawingLayout(input: { tenantId: string; projectId: string; masterPlanVersionId: string | null; units: ProjectUnit[] }) {
  const { tenantId, projectId } = input;
  const masterPlanVersionId = input.masterPlanVersionId ?? NO_VERSION;
  const scope = { tenantId, projectId, masterPlanVersionId };
  const utils = trpc.useUtils();
  const layoutQuery = trpc.masterPlans.drawingLayout.useQuery(scope, { enabled: input.masterPlanVersionId !== null });
  const upload = useDirectUpload({ tenantId, projectId, purpose: "masterPlanDrawing" });
  const uploadVersion = trpc.masterPlans.uploadDrawingVersion.useMutation();
  const saveLayout = trpc.masterPlans.saveDrawingLayout.useMutation();
  const linkUnit = trpc.masterPlans.linkDrawingUnit.useMutation();
  const unlinkUnit = trpc.masterPlans.unlinkDrawingUnit.useMutation();
  const calibrate = trpc.masterPlans.saveDrawingCalibration.useMutation();

  const layout = layoutQuery.data;
  // The saved layout as the review editor shows it; null when nothing is saved yet, so the screen keeps what the person loaded.
  const savedReview = useMemo(() => (layout && layout.polygons.length > 0 ? layoutToReview(layout, input.units) : null), [layout, input.units]);

  async function save(args: { file: File | null; drawing: DxfDrawing; items: ReviewItem[]; background?: DrawingBackground | null }): Promise<SaveOutcome> {
    try {
      if (args.file) {
        const uploadKey = await upload.upload(args.file, args.file.type || "application/octet-stream");
        await uploadVersion.mutateAsync({ ...scope, uploadKey, fileName: args.file.name });
      }
      const current = await utils.masterPlans.drawingLayout.fetch(scope);
      const idByRef = new Map(current.polygons.map(polygon => [polygon.ref, polygon.id]));
      const refByPolygonId = new Map(current.polygons.map(polygon => [polygon.id, polygon.ref]));
      const saved = await saveLayout.mutateAsync({ ...scope, polygons: polygonsToSave(args.drawing, idByRef), ...(args.background !== undefined ? { background: args.background } : {}) });
      const savedIdByRef = new Map(saved.polygons.map(polygon => [polygon.ref, polygon.id]));
      const changes = linkChanges(args.items, refByPolygonId, current.links, savedIdByRef);
      for (const polygonId of changes.unlink) await unlinkUnit.mutateAsync({ ...scope, polygonId });
      for (const link of changes.link) await linkUnit.mutateAsync({ ...scope, ...link });
      await utils.masterPlans.drawingLayout.invalidate(scope);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: projectErrorCode(error) ?? (error instanceof Error ? error.message : "UNKNOWN") };
    }
  }

  async function saveCalibration(calibration: DrawingCalibration): Promise<SaveOutcome> {
    try {
      await calibrate.mutateAsync({ ...scope, calibration });
      await utils.masterPlans.drawingLayout.invalidate(scope);
      return { ok: true };
    } catch (error) {
      return { ok: false, code: projectErrorCode(error) ?? (error instanceof Error ? error.message : "UNKNOWN") };
    }
  }

  return {
    layout,
    saveCalibration,
    savedReview,
    loading: layoutQuery.isLoading,
    error: layoutQuery.error,
    refetch: () => layoutQuery.refetch(),
    save,
    busy: upload.busy || uploadVersion.isPending || saveLayout.isPending || linkUnit.isPending || unlinkUnit.isPending || calibrate.isPending,
  };
}

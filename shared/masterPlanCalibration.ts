// Two-point calibration of a master-plan drawing (Q-7): two points on the drawing and the real distance between them in metres give the scale, and
// any two points can then be measured in metres. Points are in the drawing's own coordinates (DXF units, or image pixels with y pointing up), so the
// scale holds at any zoom. Shared by the browser (measuring) and the server (refusing a calibration that cannot give a scale).

export type PlanPoint = { x: number; y: number };
export type DrawingCalibration = { a: PlanPoint; b: PlanPoint; meters: number };
// The background a raster drawing (image or PDF page) was read at, so the picture lines up with the saved shapes after a reload.
export type DrawingBackground = { width: number; height: number; page: number };

export const MAX_CALIBRATION_METERS = 100_000;
// Two clicks closer than this (in drawing units) are the same point: no scale can come from them.
export const MIN_CALIBRATION_SPAN = 1e-6;

export type CalibrationProblem = "SAME_POINTS" | "BAD_DISTANCE" | "BAD_POINT";

export const distance = (p: PlanPoint, q: PlanPoint) => Math.hypot(q.x - p.x, q.y - p.y);

export function calibrationProblem(calibration: DrawingCalibration): CalibrationProblem | null {
  const { a, b, meters } = calibration;
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return "BAD_POINT";
  if (!Number.isFinite(meters) || meters <= 0 || meters > MAX_CALIBRATION_METERS) return "BAD_DISTANCE";
  if (distance(a, b) < MIN_CALIBRATION_SPAN) return "SAME_POINTS";
  return null;
}

/** Metres per drawing unit. */
export const metersPerUnit = (calibration: DrawingCalibration) => calibration.meters / distance(calibration.a, calibration.b);

/** The real length between two points of the drawing, in metres. */
export const measureMeters = (calibration: DrawingCalibration, p: PlanPoint, q: PlanPoint) => distance(p, q) * metersPerUnit(calibration);

/** Reads a stored JSON value back; anything malformed reads as "not calibrated" rather than a wrong scale. */
export function parseCalibration(value: string | null | undefined): DrawingCalibration | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as DrawingCalibration;
    if (!parsed || typeof parsed !== "object" || !parsed.a || !parsed.b) return null;
    return calibrationProblem(parsed) ? null : { a: { x: parsed.a.x, y: parsed.a.y }, b: { x: parsed.b.x, y: parsed.b.y }, meters: parsed.meters };
  } catch {
    return null;
  }
}

export function parseBackground(value: string | null | undefined): DrawingBackground | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as DrawingBackground;
    const ok = [parsed.width, parsed.height, parsed.page].every(n => Number.isInteger(n) && n > 0);
    return ok ? { width: parsed.width, height: parsed.height, page: parsed.page } : null;
  } catch {
    return null;
  }
}

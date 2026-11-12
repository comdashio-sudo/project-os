// Q-7: two-point calibration and measuring on the master-plan drawing. The person picks two points on the map (a tap or a click) and types the real
// distance between them; the scale is saved on the server. "Measure" then picks any two points and shows the length in metres.
import React, { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatNumber } from "@/components/ds/format";
import { calibrationProblem, distance, measureMeters, type DrawingCalibration, type PlanPoint } from "@shared/masterPlanCalibration";

export type MeasureTool = "none" | "calibrate" | "measure";

const text = {
  ar: {
    calibrate: "معايرة بنقطتين",
    measure: "قياس مسافة",
    stop: "إنهاء",
    pickTwo: (n: number) => `انقر نقطتين على الرسم (${n} من 2).`,
    meters: "المسافة الحقيقية بين النقطتين (متر)",
    saveCalibration: "حفظ المعايرة",
    saveFirst: "احفظ التخطيط أولًا ثم عاير الرسم.",
    calibrated: (m: string) => `الرسم معايَر: ${m} متر لكل وحدة رسم.`,
    notCalibrated: "الرسم غير معايَر بعد. عايِره بنقطتين قبل القياس.",
    length: (m: string) => `الطول: ${m} متر`,
    badDistance: "أدخل مسافة أكبر من صفر ولا تتجاوز 100,000 متر.",
    samePoints: "النقطتان متطابقتان. اختر نقطتين متباعدتين.",
    savedCalibration: "حُفظت المعايرة.",
  },
  en: {
    calibrate: "Two-point calibration",
    measure: "Measure a distance",
    stop: "Done",
    pickTwo: (n: number) => `Tap two points on the drawing (${n} of 2).`,
    meters: "Real distance between the two points (metres)",
    saveCalibration: "Save calibration",
    saveFirst: "Save the layout first, then calibrate the drawing.",
    calibrated: (m: string) => `The drawing is calibrated: ${m} metres per drawing unit.`,
    notCalibrated: "The drawing is not calibrated yet. Calibrate it with two points before measuring.",
    length: (m: string) => `Length: ${m} m`,
    badDistance: "Enter a distance above zero and at most 100,000 metres.",
    samePoints: "The two points are the same. Pick two points apart.",
    savedCalibration: "Calibration saved.",
  },
  ur: {
    calibrate: "دو نقطوں سے انشانکن",
    measure: "فاصلہ ناپیں",
    stop: "ختم",
    pickTwo: (n: number) => `ڈرائنگ پر دو نقطے منتخب کریں (${n} از 2)۔`,
    meters: "دونوں نقطوں کے درمیان اصل فاصلہ (میٹر)",
    saveCalibration: "انشانکن محفوظ کریں",
    saveFirst: "پہلے خاکہ محفوظ کریں، پھر ڈرائنگ کا انشانکن کریں۔",
    calibrated: (m: string) => `ڈرائنگ کا انشانکن ہو چکا: ہر ڈرائنگ اکائی ${m} میٹر۔`,
    notCalibrated: "ڈرائنگ کا ابھی انشانکن نہیں ہوا۔ ناپنے سے پہلے دو نقطوں سے انشانکن کریں۔",
    length: (m: string) => `لمبائی: ${m} میٹر`,
    badDistance: "صفر سے زیادہ اور زیادہ سے زیادہ 100,000 میٹر فاصلہ درج کریں۔",
    samePoints: "دونوں نقطے ایک ہی ہیں۔ دو الگ نقطے منتخب کریں۔",
    savedCalibration: "انشانکن محفوظ ہو گیا۔",
  },
};

// Western digits in every language (the platform's rule), two decimals for lengths.
export const formatMeters = (value: number, digits = 2) => formatNumber(value, digits);

/** The point of the drawing under a tap: screen → the SVG's viewBox (the default "xMidYMid meet" fit) → the drawing's own y-up coordinates. */
export function drawingPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number, flipY: (y: number) => number): PlanPoint | null {
  // A browser knows the exact screen-to-SVG transform (fit, letterboxing, borders); the arithmetic below is only for an environment without it.
  const matrix = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
  if (matrix && typeof svg.createSVGPoint === "function") {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const inside = point.matrixTransform(matrix.inverse());
    return { x: inside.x, y: flipY(inside.y) };
  }
  const rect = svg.getBoundingClientRect();
  const [bx, by, bw, bh] = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const box = { x: bx, y: by, width: bw, height: bh };
  if (![bx, by, bw, bh].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || box.width <= 0 || box.height <= 0) return null;
  const scale = Math.min(rect.width / box.width, rect.height / box.height);
  const offsetX = (rect.width - box.width * scale) / 2;
  const offsetY = (rect.height - box.height * scale) / 2;
  const x = box.x + (clientX - rect.left - offsetX) / scale;
  const y = box.y + (clientY - rect.top - offsetY) / scale;
  return { x, y: flipY(y) };
}

export function MeasureOverlay({ picks, flipY, size }: { picks: PlanPoint[]; flipY: (y: number) => number; size: number }) {
  if (picks.length === 0) return null;
  const shown = picks.map(p => ({ x: p.x, y: flipY(p.y) }));
  return (
    <g pointerEvents="none" data-testid="measure-overlay" className="text-red-600">
      {shown.length === 2 ? <line x1={shown[0].x} y1={shown[0].y} x2={shown[1].x} y2={shown[1].y} stroke="currentColor" strokeWidth={size / 3} /> : null}
      {shown.map((p, index) => <circle key={index} cx={p.x} cy={p.y} r={size} fill="currentColor" className="stroke-white" strokeWidth={size / 4} />)}
    </g>
  );
}

export function MeasurePanel(props: {
  tool: MeasureTool;
  onTool: (tool: MeasureTool) => void;
  picks: PlanPoint[];
  calibration: DrawingCalibration | null;
  canCalibrate: boolean;
  busy: boolean;
  onSaveCalibration: (calibration: DrawingCalibration) => Promise<boolean>;
}) {
  const { language } = useLanguage();
  const t = text[language];
  const [meters, setMeters] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const button = "min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm";
  const active = "min-h-[44px] rounded-lg bg-slate-900 px-3 text-sm text-white";
  const { tool, picks, calibration } = props;

  async function save() {
    setSavedNote(false);
    if (picks.length !== 2) return;
    const candidate = { a: picks[0], b: picks[1], meters: Number(meters.trim()) };
    const found = meters.trim() === "" ? "BAD_DISTANCE" : calibrationProblem(candidate);
    if (found) {
      setProblem(found === "SAME_POINTS" ? t.samePoints : t.badDistance);
      return;
    }
    setProblem(null);
    if (await props.onSaveCalibration(candidate)) {
      setSavedNote(true);
      setMeters("");
      props.onTool("none");
    }
  }

  const choose = (next: MeasureTool) => {
    setProblem(null);
    setSavedNote(false);
    props.onTool(tool === next ? "none" : next);
  };

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3" aria-label={t.calibrate}>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tool === "calibrate" ? active : button} aria-pressed={tool === "calibrate"} disabled={!props.canCalibrate} onClick={() => choose("calibrate")}>{t.calibrate}</button>
        <button type="button" className={tool === "measure" ? active : button} aria-pressed={tool === "measure"} disabled={!calibration} onClick={() => choose("measure")}>{t.measure}</button>
        {tool !== "none" ? <button type="button" className={button} onClick={() => choose("none")}>{t.stop}</button> : null}
      </div>
      {!props.canCalibrate ? <p className="text-xs text-slate-600">{t.saveFirst}</p> : null}
      <p className="text-sm text-slate-700" role="status">{calibration ? t.calibrated(formatMeters(calibration.meters / distance(calibration.a, calibration.b), 4)) : t.notCalibrated}</p>
      {tool !== "none" ? <p className="text-sm">{t.pickTwo(picks.length)}</p> : null}
      {tool === "calibrate" && picks.length === 2 ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-xs">
            {t.meters}
            <input type="text" inputMode="decimal" dir="ltr" className="min-h-[44px] w-40 rounded-lg border border-slate-300 px-2 text-sm" value={meters} onChange={event => setMeters(event.target.value)} />
          </label>
          <button type="button" className="min-h-[44px] rounded-lg bg-primary px-3 text-sm text-white disabled:opacity-50" disabled={props.busy} onClick={save}>{t.saveCalibration}</button>
        </div>
      ) : null}
      {tool === "measure" && calibration && picks.length === 2 ? <p className="text-base font-semibold" aria-live="polite">{t.length(formatMeters(measureMeters(calibration, picks[0], picks[1])))}</p> : null}
      {problem ? <p role="alert" className="text-sm text-red-800">{problem}</p> : null}
      {savedNote ? <p role="status" className="text-sm text-emerald-800">{t.savedCalibration}</p> : null}
    </div>
  );
}

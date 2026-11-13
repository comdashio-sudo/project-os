// D-50: the weekly report as slides (16:9, 13.333 × 7.5 in). This file only LAYS OUT: it turns the period engine's figures (reportPeriods.get, D-48), the saved texts
// and photos (reportPeriods.weekly, D-49) and the project profile into slides of boxes. The same slides are written to PowerPoint (weeklyDeckPptx.ts, native charts)
// and drawn for the PDF (WeeklyDeckSlides.tsx), so both files carry the same sections, order, number and period. Every slide has the three logos on top and the
// footer «number · period · page» at the bottom; long text continues on a next slide instead of running over its box (deckProblems checks both).
import { formatNumber } from "@/components/ds/format";

export const SLIDE = { w: 13.333, h: 7.5 };
export type Box = { x: number; y: number; w: number; h: number };
export type ChartSpec = { type: "bar" | "line" | "doughnut"; stacked?: boolean; labels: string[]; series: Array<{ name: string; values: number[] }> };
export type Item =
  | { kind: "text"; role: "title" | "footer" | "body" | "heading"; box: Box; text: string; size: number; bold?: boolean }
  | { kind: "table"; box: Box; rows: string[][]; size: number }
  | { kind: "chart"; box: Box; title: string; chart: ChartSpec }
  | { kind: "image"; box: Box; url: string; caption?: string };
export type Slide = { items: Item[] };

type Day = { date: string; planned: number | null; actual: number | null };
export type DeckFigures = {
  period: { start: string; end: string; workingDayCount: number };
  reports: unknown[];
  missingWorkingDays: string[];
  activities: Array<{ code: string; name: string; period: { planned: number | null; actual: number | null; variance: number | null; percentOfPlan: number | null; completedUnits: number }; cumulative: { planned: number | null; actual: number | null }; daily: Day[] }>;
  labour: { period: { direct: number; indirect: number }; daily: Array<{ date: string; direct: number; indirect: number }> };
  equipment: Array<{ equipmentType: string; daily: Array<{ date: string; count: number }> }>;
  quality: { wir: { A: number; B: number; C: number; pending: number }; rfi: { submitted: number; answered: number; pending: number }; ncr: { opened: number; closed: number; open: number } };
  safety: { manHours: number; daysWithoutHours?: number } & Record<string, number | undefined>;
};
export type DeckInput = {
  language: "ar" | "en" | "ur";
  number: string;
  figures: DeckFigures;
  labels: Record<string, string>; // the eleven text headings, in the editor's order
  texts: Record<string, string | null | undefined>;
  photos: Array<{ url: string | null; caption?: string | null }>;
  logos: Array<string | null>; // client, consultant, contractor (a URL each, or none)
  parties: Array<string | null>;
  mapImage?: string | null;
  /** D-53 (b): the monthly report — the same deck with the month's S-curve (P6 plan against the daily reports), its milestones and earned value */
  monthly?: DeckMonthly;
};
export type DeckMonthly = {
  sCurve: { plannedSource: "p6" | null; points: Array<{ month: string; planned: number | null; actual: number | null }> };
  milestones: Array<{ code: string; name: string; plannedDate: string | null; actualDate: string | null; state: string; varianceDays: number | null }>;
  earnedValue: { asOf: string | null; pv: number; ev: number; ac: number; bac: number; cv: number; sv: number; cpi: number | null; spi: number | null } | null;
  financialHidden: boolean;
};

const words = {
  ar: { title: "التقرير الأسبوعي", page: "صفحة", cont: "تابع", figures: "أرقام الأسبوع", activity: "النشاط", planned: "المخطط", actual: "الفعلي", variance: "الانحراف", ofPlan: "% من المخطط", completed: "وحدات اكتملت", reports: "تقارير يومية", workingDays: "أيام العمل", missing: "أيام بلا تقرير", direct: "مباشرة", indirect: "غير مباشرة", daily: "المخطط والفعلي يوميًا", sCurve: "التراكمي % من المخطط", labour: "العمالة يوميًا (رجل×يوم)", split: "مباشرة / غير مباشرة", equipment: "انتشار المعدات يوميًا", quality: "الجودة", safety: "السلامة", manHours: "ساعات العمل", wirPending: "WIR معلّقة", rfiPending: "RFI معلّقة", ncrOpened: "NCR فُتحت", ncrClosed: "NCR أُغلقت", ncrOpen: "NCR مفتوحة", photos: "صور الأسبوع", map: "المخطط الملوّن", none: "لا بيانات في هذا الأسبوع.", monthTitle: "التقرير الشهري", monthFigures: "أرقام الشهر", curve: "منحنى S: المخطط (P6) والفعلي %", plannedLine: "المخطط (P6)", actualLine: "الفعلي", noPlan: "لا جدول P6 مستورد، فلا خط مخطط.", milestones: "المعالم", code: "الرمز", name: "المعلم", plannedDate: "المخطط", actualDate: "الفعلي", state: "الحالة", days: "الفرق (أيام)", states: { done: "منجز", done_late: "منجز متأخرًا", late: "متأخر", due_this_month: "مستحق هذا الشهر", ahead: "لاحق" } as Record<string, string>, ev: "القيمة المكتسبة", evNone: "لا لقطة قيمة مكتسبة حتى نهاية الشهر.", evHidden: "مخفية: تحتاج صلاحية الاطلاع المالي." },
  en: { title: "Weekly report", page: "Page", cont: "continued", figures: "The week's figures", activity: "Activity", planned: "Planned", actual: "Actual", variance: "Variance", ofPlan: "% of plan", completed: "Units completed", reports: "Daily reports", workingDays: "Working days", missing: "Days without a report", direct: "Direct", indirect: "Indirect", daily: "Planned and actual per day", sCurve: "Cumulative % of plan", labour: "Labour per day (man-days)", split: "Direct / indirect", equipment: "Equipment per day", quality: "Quality", safety: "Safety", manHours: "Man-hours", wirPending: "WIR pending", rfiPending: "RFI pending", ncrOpened: "NCR opened", ncrClosed: "NCR closed", ncrOpen: "NCR open", photos: "The week's photos", map: "Coloured master plan", none: "No data this week.", monthTitle: "Monthly report", monthFigures: "The month's figures", curve: "S-curve: planned (P6) and actual %", plannedLine: "Planned (P6)", actualLine: "Actual", noPlan: "No P6 schedule imported, so no planned line.", milestones: "Milestones", code: "Code", name: "Milestone", plannedDate: "Planned", actualDate: "Actual", state: "State", days: "Variance (days)", states: { done: "Done", done_late: "Done late", late: "Late", due_this_month: "Due this month", ahead: "Ahead" } as Record<string, string>, ev: "Earned value", evNone: "No earned value snapshot up to the month's end.", evHidden: "Hidden: needs the financial permission." },
  ur: { title: "ہفتہ وار رپورٹ", page: "صفحہ", cont: "جاری", figures: "ہفتے کے اعداد", activity: "سرگرمی", planned: "منصوبہ", actual: "اصل", variance: "فرق", ofPlan: "منصوبے کا %", completed: "مکمل یونٹس", reports: "روزانہ رپورٹیں", workingDays: "کام کے دن", missing: "رپورٹ کے بغیر دن", direct: "براہِ راست", indirect: "بالواسطہ", daily: "روزانہ منصوبہ اور اصل", sCurve: "مجموعی منصوبے کا %", labour: "روزانہ مزدوری (آدمی-دن)", split: "براہِ راست / بالواسطہ", equipment: "روزانہ آلات", quality: "معیار", safety: "حفاظت", manHours: "کام کے گھنٹے", wirPending: "زیر التوا WIR", rfiPending: "زیر التوا RFI", ncrOpened: "کھلی گئی NCR", ncrClosed: "بند NCR", ncrOpen: "کھلی NCR", photos: "ہفتے کی تصاویر", map: "رنگین ماسٹر پلان", none: "اس ہفتے کوئی ڈیٹا نہیں۔", monthTitle: "ماہانہ رپورٹ", monthFigures: "مہینے کے اعداد", curve: "S-کرو: منصوبہ (P6) اور اصل %", plannedLine: "منصوبہ (P6)", actualLine: "اصل", noPlan: "P6 شیڈول درآمد نہیں ہوا، اس لیے منصوبے کی لکیر نہیں۔", milestones: "سنگِ میل", code: "کوڈ", name: "سنگِ میل", plannedDate: "منصوبہ", actualDate: "اصل", state: "حالت", days: "فرق (دن)", states: { done: "مکمل", done_late: "تاخیر سے مکمل", late: "تاخیر", due_this_month: "اس مہینے واجب", ahead: "آگے" } as Record<string, string>, ev: "کمائی گئی قدر", evNone: "مہینے کے آخر تک کمائی گئی قدر کا کوئی ریکارڈ نہیں۔", evHidden: "پوشیدہ: مالی اجازت درکار ہے۔" },
};

/** The weekly report's number, from the system: the project's report prefix, WR and the week's first day (one week, one number). */
/** The monthly report's number: the prefix, MR and the month (YYYYMM). */
export const monthlyReportNumber = (prefix: string | null, month: string) => `${prefix ? `${prefix}-` : ""}MR-${month.replace("-", "")}`;
export const weeklyReportNumber = (prefix: string | null, weekStart: string) => `${prefix ? `${prefix}-` : ""}WR-${weekStart.replaceAll("-", "")}`;

const BODY = { x: 0.4, y: 1.15, w: SLIDE.w - 0.8, h: 5.7 };
const n = (value: number | null | undefined, decimals = 0) => (value === null || value === undefined ? "—" : formatNumber(value, decimals));
const day = (date: string) => date.slice(5); // MM-DD, Western digits on every axis

/** How many characters fit a box at a size (a conservative estimate: an average glyph of 0.55 em, lines of 1.35 em). */
export function capacity(box: Box, size: number) {
  return Math.max(40, Math.floor(((box.w * 72) / (size * 0.55)) * Math.floor((box.h * 72) / (size * 1.35)) * 0.85));
}
/** Cuts text into pieces that each fit `limit`, at a space or line break where possible. */
export function splitText(text: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    const cut = Math.max(rest.lastIndexOf("\n", limit), rest.lastIndexOf(" ", limit));
    const at = cut > limit * 0.5 ? cut : limit;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function buildWeeklyDeck(input: DeckInput): Slide[] {
  const w = words[input.language];
  const f = input.figures;
  const title = input.monthly ? w.monthTitle : w.title;
  const bodies: Array<{ heading: string; items: Item[] }> = [];
  const cover: Item[] = [
    { kind: "text", role: "body", box: { x: 0.8, y: 1.6, w: 11.7, h: 0.9 }, text: title, size: 36, bold: true },
    { kind: "text", role: "body", box: { x: 0.8, y: 2.6, w: 11.7, h: 0.6 }, text: `${input.number} · ${f.period.start} – ${f.period.end}`, size: 20 },
    { kind: "text", role: "body", box: { x: 0.8, y: 3.3, w: 11.7, h: 0.6 }, text: input.parties.filter(Boolean).join(" · "), size: 16 },
  ];
  bodies.push({ heading: "", items: cover });

  // the figures: six numbers, then the activities table (10 rows a slide, so it ends above the footer)
  const tiles: Array<[string, string]> = [[w.reports, n(f.reports.length)], [w.workingDays, n(f.period.workingDayCount)], [w.missing, n(f.missingWorkingDays.length)], [w.direct, n(f.labour.period.direct)], [w.indirect, n(f.labour.period.indirect)], [w.ncrOpen, n(f.quality.ncr.open)]];
  const tileItems: Item[] = tiles.map(([label, value], index) => ({ kind: "text", role: "body", box: { x: BODY.x + index * 2.09, y: BODY.y, w: 1.95, h: 0.9 }, text: `${value}\n${label}`, size: 14, bold: true }));
  const head = [w.activity, w.planned, w.actual, w.variance, w.ofPlan, w.completed];
  const rows = f.activities.map(a => [`${a.code} · ${a.name}`, n(a.period.planned, 2), n(a.period.actual, 2), n(a.period.variance, 2), a.period.percentOfPlan === null ? "—" : `${formatNumber(a.period.percentOfPlan, 1)}%`, n(a.period.completedUnits)]);
  const chunks = rows.length ? Array.from({ length: Math.ceil(rows.length / 10) }, (_, i) => rows.slice(i * 10, i * 10 + 10)) : [[[w.none, "", "", "", "", ""]]];
  chunks.forEach((chunk, index) => bodies.push({ heading: index ? `${input.monthly ? w.monthFigures : w.figures} (${w.cont})` : input.monthly ? w.monthFigures : w.figures, items: [...(index ? [] : tileItems), { kind: "table", box: { x: BODY.x, y: BODY.y + (index ? 0 : 1.1), w: BODY.w, h: 0.38 * (chunk.length + 1) }, rows: [head, ...chunk], size: 12 }] }));

  if (input.monthly) {
    const m = input.monthly;
    const points = m.sCurve.points;
    bodies.push({ heading: w.curve, items: [
      { kind: "chart", box: { x: BODY.x, y: BODY.y, w: BODY.w, h: m.sCurve.plannedSource ? BODY.h : BODY.h - 0.6 }, title: w.curve, chart: { type: "line", labels: points.map(point => point.month), series: [
        ...(m.sCurve.plannedSource ? [{ name: w.plannedLine, values: points.map(point => point.planned ?? 0) }] : []), { name: w.actualLine, values: points.map(point => point.actual ?? 0) }] } },
      ...(m.sCurve.plannedSource ? [] : [{ kind: "text", role: "body", box: { x: BODY.x, y: BODY.y + BODY.h - 0.5, w: BODY.w, h: 0.45 }, text: w.noPlan, size: 12 } as Item]),
    ] });
    const rowsOf = m.milestones.map(item => [item.code, item.name, item.plannedDate ?? "—", item.actualDate ?? "—", w.states[item.state] ?? item.state, n(item.varianceDays)]);
    for (let i = 0; i < Math.max(1, rowsOf.length); i += 10) {
      const chunk = rowsOf.length ? rowsOf.slice(i, i + 10) : [[w.none, "", "", "", "", ""]];
      bodies.push({ heading: i ? `${w.milestones} (${w.cont})` : w.milestones, items: [{ kind: "table", box: { x: BODY.x, y: BODY.y, w: BODY.w, h: 0.38 * (chunk.length + 1) }, size: 12, rows: [[w.code, w.name, w.plannedDate, w.actualDate, w.state, w.days], ...chunk] }] });
    }
    const ev = m.earnedValue;
    bodies.push({ heading: w.ev, items: m.financialHidden || !ev ? [{ kind: "text", role: "body", box: { x: BODY.x, y: BODY.y, w: BODY.w, h: 0.6 }, text: m.financialHidden ? w.evHidden : w.evNone, size: 16 }]
      : [{ kind: "table", box: { x: BODY.x, y: BODY.y, w: BODY.w / 2 - 0.15, h: 0.38 * 9 }, size: 14, rows: [[w.ev, ev.asOf ?? "—"], ["PV", n(ev.pv)], ["EV", n(ev.ev)], ["AC", n(ev.ac)], ["BAC", n(ev.bac)], ["CV", n(ev.cv)], ["SV", n(ev.sv)], ["CPI", n(ev.cpi, 2)], ["SPI", n(ev.spi, 2)]] }] });
  }

  // the charts: daily planned and actual (the main activities, as each is in its own unit), and each one's cumulative % of its plan
  const days = f.labour.daily.map(item => item.date);
  const top = [...f.activities].filter(a => a.daily.length).sort((a, b) => (b.period.planned ?? b.period.actual ?? 0) - (a.period.planned ?? a.period.actual ?? 0)).slice(0, 4);
  if (top.length) {
    const half = { w: BODY.w / 2 - 0.15, h: BODY.h };
    const valueOn = (a: (typeof top)[number], date: string, key: "planned" | "actual") => a.daily.find(d => d.date === date)?.[key] ?? 0;
    const main = top[0];
    const curve = top.map(a => {
      const before = (a.cumulative.planned ?? 0) - (a.period.planned ?? 0);
      const doneBefore = (a.cumulative.actual ?? 0) - (a.period.actual ?? 0);
      let plan = before; let done = doneBefore;
      return { name: a.code, values: days.map(date => { plan += valueOn(a, date, "planned"); done += valueOn(a, date, "actual"); return plan > 0 ? Math.round((done / plan) * 1000) / 10 : 0; }) };
    });
    bodies.push({ heading: `${w.daily} · ${main.code}`, items: [
      { kind: "chart", box: { x: BODY.x, y: BODY.y, ...half }, title: `${main.code} · ${main.name}`, chart: { type: "bar", labels: days.map(day), series: [{ name: w.planned, values: days.map(d => valueOn(main, d, "planned")) }, { name: w.actual, values: days.map(d => valueOn(main, d, "actual")) }] } },
      { kind: "chart", box: { x: BODY.x + half.w + 0.3, y: BODY.y, ...half }, title: w.sCurve, chart: { type: "line", labels: days.map(day), series: curve } },
    ] });
  }
  const half = { w: BODY.w / 2 - 0.15, h: BODY.h };
  bodies.push({ heading: w.labour, items: [
    { kind: "chart", box: { x: BODY.x, y: BODY.y, ...half }, title: w.labour, chart: { type: "bar", stacked: true, labels: days.map(day), series: [{ name: w.direct, values: f.labour.daily.map(d => d.direct) }, { name: w.indirect, values: f.labour.daily.map(d => d.indirect) }] } },
    { kind: "chart", box: { x: BODY.x + half.w + 0.3, y: BODY.y, ...half }, title: w.split, chart: { type: "doughnut", labels: [w.direct, w.indirect], series: [{ name: w.split, values: [f.labour.period.direct, f.labour.period.indirect] }] } },
  ] });
  if (f.equipment.length) {
    const types = Array.from(new Set(f.equipment.map(item => item.equipmentType)));
    bodies.push({ heading: w.equipment, items: [{ kind: "chart", box: BODY, title: w.equipment, chart: { type: "bar", stacked: true, labels: days.map(day), series: types.map(type => ({ name: type, values: days.map(date => f.equipment.filter(item => item.equipmentType === type).reduce((t, item) => t + (item.daily.find(d => d.date === date)?.count ?? 0), 0)) })) } }] });
  }
  const q = f.quality;
  bodies.push({ heading: `${w.quality} · ${w.safety}`, items: [
    { kind: "table", box: { x: BODY.x, y: BODY.y, w: half.w, h: 0.38 * 8 }, size: 14, rows: [[w.quality, ""], ["WIR A / B / C", `${n(q.wir.A)} / ${n(q.wir.B)} / ${n(q.wir.C)}`], [w.wirPending, n(q.wir.pending)], ["RFI", n(q.rfi.submitted)], [w.rfiPending, n(q.rfi.pending)], [w.ncrOpened, n(q.ncr.opened)], [w.ncrClosed, n(q.ncr.closed)], [w.ncrOpen, n(q.ncr.open)]] },
    { kind: "table", box: { x: BODY.x + half.w + 0.3, y: BODY.y, w: half.w, h: 0.38 * 2 }, size: 14, rows: [[w.safety, ""], [w.manHours, n(f.safety.manHours, 0)]] },
  ] });

  // the texts, two boxes a slide; a text longer than its box continues on the next slide
  const textBox = (side: 0 | 1): Box => ({ x: BODY.x + side * (half.w + 0.3), y: BODY.y + 0.5, w: half.w, h: BODY.h - 0.5 });
  const pieces = Object.entries(input.labels).flatMap(([key, label]) => {
    const value = input.texts[key]?.trim();
    return value ? splitText(value, capacity(textBox(0), 14)).map((part, index) => ({ label: index ? `${label} (${w.cont})` : label, part })) : [];
  });
  for (let i = 0; i < pieces.length; i += 2) {
    bodies.push({ heading: pieces[i].label, items: pieces.slice(i, i + 2).flatMap((piece, side) => [
      { kind: "text", role: "heading", box: { ...textBox(side as 0 | 1), y: BODY.y, h: 0.45 }, text: piece.label, size: 16, bold: true },
      { kind: "text", role: "body", box: textBox(side as 0 | 1), text: piece.part, size: 14 },
    ] as Item[]) });
  }
  const photos = input.photos.filter((photo): photo is { url: string; caption?: string | null } => Boolean(photo.url));
  for (let i = 0; i < photos.length; i += 6) {
    bodies.push({ heading: w.photos, items: photos.slice(i, i + 6).map((photo, index) => ({ kind: "image", box: { x: BODY.x + (index % 3) * 4.2, y: BODY.y + Math.floor(index / 3) * 2.85, w: 3.95, h: 2.6 }, url: photo.url, caption: photo.caption ?? undefined })) });
  }
  if (input.mapImage) bodies.push({ heading: w.map, items: [{ kind: "image", box: BODY, url: input.mapImage }] });

  // the frame of every slide: the logos and the heading on top, the number, the period and the page at the bottom — from the system, the same on every slide
  // Arabic and Urdu read from the right: the slide is mirrored, so the first box of a row (a tile, a text, a chart) stands on the right
  const mirror = (item: Item): Item => (input.language === "en" ? item : { ...item, box: { ...item.box, x: Math.round((SLIDE.w - item.box.x - item.box.w) * 1000) / 1000 } });
  return bodies.map((body, index) => ({ items: ([
    ...input.logos.flatMap((url, i): Item[] => (url ? [{ kind: "image", box: { x: 0.3 + i * 1.5, y: 0.2, w: 1.35, h: 0.7 }, url }] : [])),
    { kind: "text", role: "title", box: { x: 4.9, y: 0.2, w: 8.13, h: 0.7 }, text: body.heading || title, size: 22, bold: true },
    ...body.items,
    { kind: "text", role: "footer", box: { x: 0.3, y: 7.0, w: 12.73, h: 0.35 }, text: `${input.number} · ${f.period.start} – ${f.period.end} · ${w.page} ${index + 1}/${bodies.length}`, size: 10 },
  ] as Item[]).map(mirror) }));
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
/** What would print wrong: a box over another, a box past the slide's edge, or text longer than its box holds. Empty for a good deck. */
export function deckProblems(slides: Slide[]): string[] {
  const problems: string[] = [];
  slides.forEach((slide, s) => slide.items.forEach((item, i) => {
    const { x, y, w, h } = item.box;
    if (x < 0 || y < 0 || x + w > SLIDE.w + 1e-6 || y + h > SLIDE.h + 1e-6) problems.push(`slide ${s + 1} item ${i + 1}: outside the slide`);
    if (item.kind === "text" && item.text.length > capacity(item.box, item.size)) problems.push(`slide ${s + 1} item ${i + 1}: text longer than its box`);
    slide.items.slice(i + 1).forEach((other, j) => { if (overlap(item.box, other.box)) problems.push(`slide ${s + 1}: items ${i + 1} and ${i + j + 2} overlap`); });
  }));
  return problems;
}

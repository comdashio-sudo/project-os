// The invented content of the demo company ("شركة العرض"), kept apart from the code that writes it so it can be read, counted and tested without a database.
// Everything here is made up and says so: no real person, company, project, client, engineer or figure (CLAUDE.md §3). Deterministic: the same call gives the same
// result, so a re-run builds the same company and a test can count what the screens must show.
import { wbsProgressFromPmc } from "../../server/domain/pmcEvmBridge";

export const DEMO = {
  slug: "demo-show-company",
  legalName: "شركة العرض",
  portfolioCode: "PF-DEMO",
  portfolioName: "محفظة العرض",
  projectCode: "PRJ-DEMO-1",
  projectName: "مشروع فلل العرض (500 فيلا)",
  secondProjectCode: "PRJ-DEMO-2",
  secondProjectName: "مبنى الخدمات المشتركة (عرض)",
  ownerName: "مدير شركة العرض",
  defaultOwnerEmail: "demo.admin@example.test",
  currency: "SAR",
} as const;

/** Small, fixed-seed generator (mulberry32): the demo must not change between runs. */
export function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DAY = 86_400_000;
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);

// ---------------------------------------------------------------------------------------------------------------- the people (one per level, and the team)
export type DemoPerson = { key: string; email: string; name: string; role: string; scope: "company" | "portfolio" | "project"; level: string };
export const DEMO_PEOPLE: readonly DemoPerson[] = [
  { key: "board", email: "board.member@show.example.test", name: "عضو مجلس الإدارة (عرض)", role: "EXECUTIVE", scope: "company", level: "الشركة" },
  { key: "pmo", email: "portfolio.lead@show.example.test", name: "مدير المحفظة (عرض)", role: "PMO_LEAD", scope: "portfolio", level: "المحفظة" },
  { key: "pm", email: "project.manager@show.example.test", name: "مدير المشروع (عرض)", role: "PROJECT_MANAGER", scope: "project", level: "المشروع" },
  { key: "keeper", email: "warehouse.keeper@show.example.test", name: "أمين المستودع (عرض)", role: "WAREHOUSE_CUSTODIAN", scope: "project", level: "المستودع" },
  { key: "site1", email: "site.engineer.1@show.example.test", name: "مهندس الموقع الأول (عرض)", role: "SITE_ENGINEER", scope: "project", level: "الميدان" },
  { key: "site2", email: "site.engineer.2@show.example.test", name: "مهندس الموقع الثاني (عرض)", role: "SITE_ENGINEER", scope: "project", level: "الميدان" },
  { key: "qc", email: "quality.manager@show.example.test", name: "مدير الجودة (عرض)", role: "QA_QC_MANAGER", scope: "project", level: "الجودة" },
  { key: "coord", email: "project.coordinator@show.example.test", name: "منسق المشروع (عرض)", role: "PROJECT_COORDINATOR", scope: "project", level: "التنسيق" },
  { key: "cost", email: "cost.controller@show.example.test", name: "مراقب التكاليف (عرض)", role: "COST_CONTROLLER", scope: "project", level: "التكلفة" },
  { key: "plan", email: "planning.engineer@show.example.test", name: "مهندس التخطيط (عرض)", role: "PLANNING_ENGINEER", scope: "project", level: "التخطيط" },
];

export const CONSULTANTS = ["استشاري العرض أ", "استشاري العرض ب", "استشاري العرض ج"] as const;

// ---------------------------------------------------------------------------------------------------------------- the money (SAR)
export const MONEY = {
  contractValue: 450_000_000,
  bac: 380_000_000,
  approvedChange: 9_000_000,
  pendingChange: 4_500_000,
  /** where the demonstration stands: cost efficiency and schedule efficiency the screens should show */
  targetCpi: 0.96,
  targetSpi: 0.88,
};

// ---------------------------------------------------------------------------------------------------------------- the work breakdown and the unit activities
export type DemoActivity = { code: string; name: string; group: string; weight: number; wbs: string; days: number; after: string[] };
export const GROUPS = [
  { code: "STR", name: "الهيكل الإنشائي" },
  { code: "ARC", name: "الأعمال المعمارية" },
  { code: "MEP", name: "الأعمال الكهروميكانيكية" },
] as const;
/** weights add up to 100 per model; `days` is the typical duration on one villa; `after` are the activities that must finish first */
export const ACTIVITIES: readonly DemoActivity[] = [
  { code: "EXC", name: "الحفر", group: "STR", weight: 4, wbs: "1", days: 4, after: [] },
  { code: "FND", name: "الأساسات", group: "STR", weight: 8, wbs: "2", days: 12, after: ["EXC"] },
  { code: "SLB", name: "البلاطة الأرضية", group: "STR", weight: 6, wbs: "3", days: 6, after: ["FND"] },
  { code: "COL", name: "الأعمدة والأسقف", group: "STR", weight: 14, wbs: "3", days: 26, after: ["SLB"] },
  { code: "BLK", name: "أعمال البلوك", group: "ARC", weight: 10, wbs: "4", days: 22, after: ["COL"] },
  { code: "PLS", name: "اللياسة", group: "ARC", weight: 8, wbs: "5", days: 18, after: ["BLK"] },
  { code: "TIL", name: "البلاط والأرضيات", group: "ARC", weight: 9, wbs: "6", days: 12, after: ["PLS"] },
  { code: "PNT", name: "الدهان", group: "ARC", weight: 8, wbs: "5", days: 12, after: ["TIL"] },
  { code: "DWS", name: "الأبواب والنوافذ", group: "ARC", weight: 6, wbs: "7", days: 8, after: ["PNT"] },
  { code: "ELR", name: "التمديدات الكهربائية", group: "MEP", weight: 9, wbs: "8", days: 16, after: ["BLK"] },
  { code: "PLR", name: "التمديدات الصحية", group: "MEP", weight: 8, wbs: "9", days: 16, after: ["BLK"] },
  { code: "MEF", name: "التجهيزات النهائية", group: "MEP", weight: 10, wbs: "10", days: 12, after: ["DWS", "ELR", "PLR"] },
];
export const WBS_ITEMS = [
  { code: "1", name: "الأعمال الترابية" },
  { code: "2", name: "الأساسات" },
  { code: "3", name: "الهيكل الخرساني" },
  { code: "4", name: "أعمال البناء" },
  { code: "5", name: "اللياسة والدهان" },
  { code: "6", name: "الأرضيات" },
  { code: "7", name: "النجارة والألمنيوم" },
  { code: "8", name: "الأعمال الكهربائية" },
  { code: "9", name: "الأعمال الصحية" },
  { code: "10", name: "التجهيزات النهائية" },
] as const;
/** WBS item planned value: the share of the model's weight its activities carry, of the budget */
export const wbsValue = (code: string) => (ACTIVITIES.filter(item => item.wbs === code).reduce((sum, item) => sum + item.weight, 0) / 100) * MONEY.bac;

// ---------------------------------------------------------------------------------------------------------------- the site layout: 5 zones x 5 blocks x 20 villas
export const ZONES = 5; export const BLOCKS_PER_ZONE = 5; export const UNITS_PER_BLOCK = 20; export const UNIT_COUNT = ZONES * BLOCKS_PER_ZONE * UNITS_PER_BLOCK;
export const zoneName = ["الشمالية", "الجنوبية", "الشرقية", "الغربية", "المركزية"];
/** A unit's place on the plan, in 0..1 of the drawing (origin top left): blocks in a 5x5 grid, villas in 5 columns x 4 rows inside a block. */
export function unitPolygon(index: number): Array<[number, number]> {
  const block = Math.floor(index / UNITS_PER_BLOCK); const inBlock = index % UNITS_PER_BLOCK;
  const blockCol = block % 5; const blockRow = Math.floor(block / 5);
  const col = inBlock % 5; const row = Math.floor(inBlock / 5);
  const cellW = 1 / 5; const cellH = 1 / 5; const margin = 0.012; const gap = 0.004;
  const innerW = (cellW - 2 * margin - 4 * gap) / 5; const innerH = (cellH - 2 * margin - 3 * gap) / 4;
  const x = blockCol * cellW + margin + col * (innerW + gap); const y = blockRow * cellH + margin + row * (innerH + gap);
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return [[r(x), r(y)], [r(x + innerW), r(y)], [r(x + innerW), r(y + innerH)], [r(x), r(y + innerH)]];
}
/** The same layout as a DXF drawing (units are metres: a 500 m x 500 m site), one closed polyline per villa on layer VILLAS with its number as text, and one rectangle per block. */
export function demoDxf(): string {
  const W = 500; const H = 500;
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  // villas are closed shapes (the matcher reads closed shapes as unit boundaries); a block outline is drawn open (its last point stops 5 cm short), so it is not read as a unit
  const poly = (layer: string, ring: Array<[number, number]>, closed = true) => {
    out.push("0", "LWPOLYLINE", "8", layer, "90", String(ring.length), "70", closed ? "1" : "0");
    for (const [x, y] of ring) out.push("10", (x * W).toFixed(3), "20", ((1 - y) * H).toFixed(3));
  };
  for (let block = 0; block < ZONES * BLOCKS_PER_ZONE; block++) {
    const bc = block % 5; const br = Math.floor(block / 5);
    const x0 = bc * 0.2 + 0.004; const y0 = br * 0.2 + 0.004; const s = 0.192;
    poly("BLOCKS", [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0 + 0.0001]], false);
  }
  for (let index = 0; index < UNIT_COUNT; index++) {
    const ring = unitPolygon(index); poly("VILLAS", ring);
    const cx = (ring[0][0] + ring[2][0]) / 2; const cy = (ring[0][1] + ring[2][1]) / 2;
    out.push("0", "TEXT", "8", "LABELS", "10", (cx * W).toFixed(3), "20", ((1 - cy) * H).toFixed(3), "40", "1.2", "1", String(index + 1));
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------------------------- the construction timeline (the same law makes every number)
export type CellState = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE";
export type Cell = { unit: number; activity: string; start: number; finish: number };
/** `startRate` is the days between one block starting and the next. Day 0 is the project start; "today" is `today` days later. */
export function buildTimeline(startRate: number, seed = 20261024): Cell[] {
  const random = rng(seed);
  const cells: Cell[] = [];
  for (let unit = 0; unit < UNIT_COUNT; unit++) {
    const block = Math.floor(unit / UNITS_PER_BLOCK); const inBlock = unit % UNITS_PER_BLOCK;
    const start0 = 4 + block * startRate + inBlock * 0.3 + random() * 2;
    const finish = new Map<string, number>();
    for (const activity of ACTIVITIES) {
      const start = activity.after.length ? Math.max(...activity.after.map(code => finish.get(code)!)) + random() * 1.5 : start0;
      const days = activity.days * (0.85 + random() * 0.3);
      finish.set(activity.code, start + days);
      cells.push({ unit, activity: activity.code, start, finish: start + days });
    }
  }
  return cells;
}
export function stateAt(cell: Cell, day: number): CellState {
  if (day >= cell.finish + 2) return "COMPLETE";
  if (day >= cell.finish) return "UNDER_REVIEW"; // finished two days ago or less: waiting for the consultant's inspection
  if (day >= cell.start) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export type ProgressInput = Parameters<typeof wbsProgressFromPmc>[0];
/** Progress of every WBS item at `day`, by the very function the platform's own bridge uses (server/domain/pmcEvmBridge.ts). */
export function progressByWbs(cells: Cell[], day: number, definitions: Array<{ id: string; modelCode: string; weightPercent: number; wbsItemId: string; code: string }>, unitIds: string[], unitModel: (unit: number) => string, factors: Record<CellState, number>) {
  const idOf = new Map(definitions.map(item => [`${item.modelCode}:${item.code}`, item.id]));
  const rows: ProgressInput["cells"] = [];
  for (const cell of cells) {
    const status = stateAt(cell, day);
    if (status === "NOT_STARTED") continue;
    rows.push({ unitId: unitIds[cell.unit], definitionId: idOf.get(`${unitModel(cell.unit)}:${cell.activity}`)!, status });
  }
  return wbsProgressFromPmc({ units: unitIds.map((id, index) => ({ id, modelCode: unitModel(index), weight: 1 })), definitions, cells: rows, factors });
}

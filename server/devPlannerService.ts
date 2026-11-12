// Q-11 (b): the development planner on the platform — the engine of part (a) (server/domain/devPlanner.ts) behind two procedures:
//   - runDevPlanner: the plan as a screen reads it (three scenarios in months, the activities of the likely scenario with the critical path, the monthly labour
//     histogram and the sales curve). Nothing is stored: the planner works before a project exists.
//   - exportDevPlanner: the same plan as an Excel workbook (Summary, Activities, Labour, Sales).
// Who: any active member of the company holding a PROJECT planning permission (project.schedule.manage, project.manage or project.pmc.manage). The input is
// bounded here (counts, areas, crews) so a request cannot ask the engine for an unbounded schedule.
import ExcelJS from "exceljs";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { assertProjectWithinTenant, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { planDevelopment, type PlannerInput } from "./domain/devPlanner";
import { getBaselineStatus, writePlanMonthsAudited, writePlannedLabourAudited } from "./projectBaseline";
import { projectGate } from "./projectProfile";

const MONTH = 30.44;
const n = (max: number, min = 0) => z.number().finite().min(min).max(max);
const model = z.object({ name: z.string().trim().min(1).max(80), count: n(5000).int(), bua: n(5000, 1), floors: n(10, 1).int(), plot: n(20000, 1) });
const building = z.object({ name: z.string().trim().min(1).max(80), count: n(500).int(), floors: n(60, 1).int(), floorArea: n(20000, 1), unitsPerFloor: n(50, 1).int(), basement: n(5).int() });
export const plannerInputSchema = z.object({
  type: z.enum(["villa", "townhouse", "apartments"]),
  workingDaysPerWeek: z.union([z.literal(5), z.literal(6), z.literal(7)]),
  risk: n(1, 0.5), season: z.boolean(),
  roads: n(10_000_000).nullable().optional(), networks: n(1_000_000).nullable().optional(),
  villaModels: z.array(model).max(20), townhouseModels: z.array(model).max(20), buildings: z.array(building).max(20),
  labourMode: z.enum(["fronts", "cap", "target"]), fronts: n(200, 1).int(), cap: n(20_000, 1).int(), targetMonths: n(120, 1),
  salesMode: z.enum(["offplan", "ready"]), salesPerMonth: n(1000, 0.1), launchMultiplier: n(5, 1),
}).strict();

const PLANNING = ["project.schedule.manage", "project.manage", "project.pmc.manage"] as const;
async function snapshotOf(userId: number, tenantId: string) {
  const snapshot = await getTenantAccessSnapshot({ userId, tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  return snapshot;
}

const months = (days: number) => Math.round((days / MONTH) * 10) / 10;

/** The plan in the shape the screen and the workbook read: months rounded to one decimal, the activities of the likely scenario in start order. */
export function summarizePlan(input: PlannerInput) {
  const plan = planDevelopment(input);
  const likely = plan.scenarios.likely;
  const scenario = (key: "min" | "likely" | "max") => ({ totalMonths: months(plan.scenarios[key].totalDays), buildStartMonths: months(plan.scenarios[key].buildStartDays), buildMonths: months(plan.scenarios[key].buildCalendarDays) });
  return {
    crewMultiplier: Math.round(plan.crewMultiplier * 1000) / 1000, labourTargetFeasible: plan.labourTargetFeasible,
    units: plan.units.saleUnits,
    scenarios: { min: scenario("min"), likely: scenario("likely"), max: scenario("max") },
    activities: likely.sc.acts.filter(a => a.F > a.S).map(a => ({ id: a.id, name: a.name, trade: a.trade, crews: a.crews, workers: a.workers, startMonth: months(likely.buildStartDays + a.S * likely.cf), finishMonth: months(likely.buildStartDays + a.F * likely.cf), critical: a.crit }))
      .sort((a, b) => a.startMonth - b.startMonth),
    labour: { months: plan.labour.hist, peak: plan.labour.peak },
    sales: { launchMonth: Math.round(plan.sales.launchMonth * 10) / 10, sellingMonths: plan.sales.sellingMonths, endMonth: Math.round(plan.sales.endMonth * 10) / 10, curve: plan.sales.curve },
  };
}

export async function runDevPlanner(input: { userId: number; tenantId: string; plan: PlannerInput }) {
  assertTenantAccess(await snapshotOf(input.userId, input.tenantId), { tenantId: input.tenantId, product: "PROJECT", permission: PLANNING });
  return summarizePlan(input.plan);
}

const HEAD = {
  ar: { summary: "الملخص", activities: "الأنشطة", labour: "العمالة", sales: "المبيعات", scenario: "السيناريو", total: "المدة الكلية (شهر)", start: "بدء التنفيذ (شهر)", build: "مدة التنفيذ (شهر)", min: "الأدنى", likely: "المرجّح", max: "الأقصى", activity: "النشاط", trade: "المهنة", crews: "الفرق", workers: "العمال", from: "من الشهر", to: "إلى الشهر", critical: "حرج", month: "الشهر", sold: "المباع تراكميًا", units: "الوحدات", peak: "ذروة العمالة", launch: "إطلاق البيع (شهر)", yes: "نعم", no: "" },
  en: { summary: "Summary", activities: "Activities", labour: "Labour", sales: "Sales", scenario: "Scenario", total: "Total duration (months)", start: "Construction start (month)", build: "Construction (months)", min: "Min", likely: "Likely", max: "Max", activity: "Activity", trade: "Trade", crews: "Crews", workers: "Workers", from: "From month", to: "To month", critical: "Critical", month: "Month", sold: "Units sold (cumulative)", units: "Units", peak: "Peak labour", launch: "Sales launch (month)", yes: "Yes", no: "" },
} as const;

export async function exportDevPlanner(input: { userId: number; tenantId: string; plan: PlannerInput; locale: "ar" | "en" | "ur" }) {
  assertTenantAccess(await snapshotOf(input.userId, input.tenantId), { tenantId: input.tenantId, product: "PROJECT", permission: PLANNING });
  const s = summarizePlan(input.plan); const t = input.locale === "ar" ? HEAD.ar : HEAD.en; const rtl = input.locale !== "en";
  const book = new ExcelJS.Workbook();
  const sheet = (name: string, headers: string[], rows: unknown[][]) => { const ws = book.addWorksheet(name, { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 1 }] }); ws.addRow(headers); ws.getRow(1).font = { bold: true }; rows.forEach(row => ws.addRow(row)); headers.forEach((header, i) => { ws.getColumn(i + 1).width = Math.max(12, Math.min(40, header.length + 6)); }); };
  sheet(t.summary, [t.scenario, t.total, t.start, t.build], (["min", "likely", "max"] as const).map((key): unknown[] => [t[key], s.scenarios[key].totalMonths, s.scenarios[key].buildStartMonths, s.scenarios[key].buildMonths]).concat([[t.units, s.units], [t.peak, s.labour.peak], [t.launch, s.sales.launchMonth]]));
  sheet(t.activities, [t.activity, t.trade, t.crews, t.workers, t.from, t.to, t.critical], s.activities.map(a => [a.name, a.trade, a.crews, a.workers, a.startMonth, a.finishMonth, a.critical ? t.yes : t.no]));
  sheet(t.labour, [t.month, t.workers], s.labour.months.map((workers, i) => [i + 1, workers]));
  sheet(t.sales, [t.month, t.sold], s.sales.curve.map((sold, i) => [Math.round((s.sales.launchMonth + i) * 10) / 10, sold]));
  return { fileName: "development-plan.xlsx", base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64") };
}

// ------------------------------------------------------------------ Q-11 (c): the plan applied to a project's base file

const addMonths = (start: string, offset: number) => { const [y, m] = start.split("-").map(Number); const total = y * 12 + (m - 1) + offset; return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`; };

/**
 * The likely scenario's monthly labour histogram becomes the project's planned labour (all trades, one row a month), and the planned cash flow is that histogram's
 * shape — each month's share of the total worker-months, so the shares total exactly 100% (the last month takes the rounding). Month one is the construction start
 * the person chose. It replaces the project's two plans (as an upload would), audited with source «planner». project.manage on the project.
 */
export function plannerMonths(plan: PlannerInput, constructionStart: string) {
  const hist = summarizePlan(plan).labour.months;
  const total = hist.reduce((sum, workers) => sum + workers, 0);
  if (!total) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CASHFLOW_EMPTY" });
  let running = 0;
  const cash = hist.map((workers, i) => { const fraction = i === hist.length - 1 ? Math.max(0, 1 - running) : Math.round((workers / total) * 1e8) / 1e8; running += fraction; return { month: addMonths(constructionStart, i), fraction, cumulative: i === hist.length - 1 ? 1 : running }; });
  return { labour: hist.map((workers, i) => ({ month: addMonths(constructionStart, i), trade: "", workers })), cash, peak: Math.max(0, ...hist) };
}

export async function applyPlannerToProject(input: { userId: number; tenantId: string; projectId: string; plan: PlannerInput; constructionStart: string }) {
  const scope = { userId: input.userId, tenantId: input.tenantId, projectId: input.projectId };
  // the gate, explicit: project.manage on THIS project, and the project belongs to this company; projectGate then gives the request's database
  assertTenantAccess(await snapshotOf(input.userId, input.tenantId), { tenantId: input.tenantId, product: "PROJECT", permission: "project.manage", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const db = await projectGate(scope, ["project.manage"]);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.constructionStart)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CONTRACT_DATES_INVALID" });
  const months = plannerMonths(input.plan, input.constructionStart);
  await writePlannedLabourAudited(db, scope, months.labour, months.peak, "planner");
  await writePlanMonthsAudited(db, scope, months.cash, "planner");
  return getBaselineStatus(scope);
}

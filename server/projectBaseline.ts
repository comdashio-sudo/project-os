// Q-10 (a): the project's «base file» — one checklist of what any project needs before the platform can plan it, and where each piece stands.
//   - getBaselineStatus: for each of the eight items, whether the project has it (uploaded), lacks it (missing) or may go without it (optional), with the count behind that word.
//     Read-only: one count per table, always filtered by company and project.
//   - saveProjectContract: the one item that is a form, not a file — the contract value and its start and end dates.
// Reading takes project.read or project.manage; writing takes project.manage. The audit row is written in the same transaction as the change. No import happens here:
// the checklist points at the importers that already exist (WBS, schedule, units, weights, BOQ) and the status is read from what they stored.
import { randomUUID } from "node:crypto";
import { and, count, countDistinct, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activities, auditLogs, boqItems, pmcActivityDefinitions, pmcPlanMonths, pmcUnits, projects, wbsItems } from "../drizzle/schema";
import { projectGate } from "./projectProfile";

type Scope = { userId: number; tenantId: string; projectId: string };
const READ = ["project.read", "project.manage"] as const;
const WRITE = ["project.manage"] as const;

export const BASELINE_ITEMS = ["contract", "schedule", "cashFlow", "weights", "units", "boq", "wbs", "labour"] as const;
export type BaselineItemCode = (typeof BASELINE_ITEMS)[number];
export type BaselineState = "uploaded" | "missing" | "optional";
export type BaselineItem = { code: BaselineItemCode; state: BaselineState; count: number; detail: { contractValue?: string; plannedStartAt?: string | null; plannedFinishAt?: string | null; models?: number } };

/** What a project must have (required) or may have (optional); labour is the only optional one. A required item with nothing behind it is «missing», an optional one «optional». */
const OPTIONAL: ReadonlySet<BaselineItemCode> = new Set<BaselineItemCode>(["labour"]);
const stateOf = (code: BaselineItemCode, count: number): BaselineState => (count > 0 ? "uploaded" : OPTIONAL.has(code) ? "optional" : "missing");
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export async function getBaselineStatus(input: Scope): Promise<{ items: BaselineItem[]; ready: number; required: number }> {
  const db = await projectGate(input, READ);
  const total = async (rows: Promise<Array<{ n: number }>>) => Number((await rows)[0]?.n ?? 0);
  const [[project], scheduleCount, cashFlowCount, [weights], unitCount, boqCount, wbsCount] = await Promise.all([
    db.select({ contractValue: projects.contractValue, plannedStartAt: projects.plannedStartAt, plannedFinishAt: projects.plannedFinishAt }).from(projects).where(and(eq(projects.tenantId, input.tenantId), eq(projects.id, input.projectId))).limit(1),
    total(db.select({ n: count() }).from(activities).where(mine(activities, input))),
    total(db.select({ n: count() }).from(pmcPlanMonths).where(mine(pmcPlanMonths, input))),
    db.select({ n: count(), models: countDistinct(pmcActivityDefinitions.modelCode) }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    total(db.select({ n: count() }).from(pmcUnits).where(mine(pmcUnits, input))),
    total(db.select({ n: count() }).from(boqItems).where(mine(boqItems, input))),
    total(db.select({ n: count() }).from(wbsItems).where(mine(wbsItems, input))),
  ]);
  const contractValue = Number(project?.contractValue ?? 0);
  // the contract counts as given when it has a value and both dates (a value of zero or a missing date is not a contract)
  const contractGiven = contractValue > 0 && project?.plannedStartAt != null && project?.plannedFinishAt != null;
  const items: BaselineItem[] = [
    { code: "contract", state: contractGiven ? "uploaded" : "missing", count: contractGiven ? 1 : 0, detail: { contractValue: String(project?.contractValue ?? "0"), plannedStartAt: isoDay(project?.plannedStartAt ?? null), plannedFinishAt: isoDay(project?.plannedFinishAt ?? null) } },
    { code: "schedule", state: stateOf("schedule", scheduleCount), count: scheduleCount, detail: {} },
    { code: "cashFlow", state: stateOf("cashFlow", cashFlowCount), count: cashFlowCount, detail: {} },
    { code: "weights", state: stateOf("weights", Number(weights?.n ?? 0)), count: Number(weights?.n ?? 0), detail: { models: Number(weights?.models ?? 0) } },
    { code: "units", state: stateOf("units", unitCount), count: unitCount, detail: {} },
    { code: "boq", state: stateOf("boq", boqCount), count: boqCount, detail: {} },
    { code: "wbs", state: stateOf("wbs", wbsCount), count: wbsCount, detail: {} },
    // planned labour has no table yet (Q-10 c): it is optional and reads as such until it exists
    { code: "labour", state: "optional", count: 0, detail: {} },
  ];
  const required = items.filter(item => !OPTIONAL.has(item.code)).length;
  return { items, ready: items.filter(item => !OPTIONAL.has(item.code) && item.state === "uploaded").length, required };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const parseDay = (value: string) => { if (!DAY.test(value)) return null; const date = new Date(`${value}T00:00:00.000Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null; };

/** The contract value and the planned start and finish. A value must be a positive number, both dates real days and the finish not before the start; each refusal has its own translated message. */
export async function saveProjectContract(input: Scope & { contractValue: number; plannedStartAt: string; plannedFinishAt: string }) {
  const db = await projectGate(input, WRITE);
  if (!Number.isFinite(input.contractValue) || input.contractValue <= 0 || input.contractValue >= 1e15) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CONTRACT_VALUE_INVALID" });
  const start = parseDay(input.plannedStartAt); const finish = parseDay(input.plannedFinishAt);
  if (!start || !finish || finish < start) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CONTRACT_DATES_INVALID" });
  await db.transaction(async tx => {
    const updated = await tx.update(projects).set({ contractValue: input.contractValue.toFixed(2), plannedStartAt: start, plannedFinishAt: finish, updatedAt: new Date() })
      .where(and(eq(projects.tenantId, input.tenantId), eq(projects.id, input.projectId))).returning({ id: projects.id });
    // zero rows is a stated outcome, not a silent success: the project is gone or belongs elsewhere
    if (!updated.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROJECT_NOT_FOUND" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.contract_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ projectId: input.projectId, contractValue: input.contractValue.toFixed(2), plannedStartAt: input.plannedStartAt, plannedFinishAt: input.plannedFinishAt }) });
  });
  return getBaselineStatus(input);
}

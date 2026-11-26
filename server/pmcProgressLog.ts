// Q-70 (1): the project's progress log — who entered what, on which villas, from what to what, and where it came from (the progress update, an import, a
// daily report, an undo, a single cell, a QC receipt). Read with project.pmc.read; every read is filtered by the company and the project. The rows are folded
// into entries by server/domain/progressLog.ts. The newest MAX_ROWS history rows in the chosen dates are read; past that the answer says it is cut.
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { pmcActivityDefinitions, pmcBlocks, pmcQcReceiptEvents, pmcQcReceipts, pmcUnitActivityHistory, pmcUnitActivityProgress, pmcUnits, users } from "../drizzle/schema";
import { groupProgressLog, LOG_SOURCES, type LogRow, type LogSource } from "./domain/progressLog";
import { authorize, mine, type Scope } from "./pmcService";
import { villaKey } from "./wo22Shared";

export const PROGRESS_LOG_MAX_ROWS = 20_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day (2026-13-01 and 2026-02-30 are not). */
const isDay = (day: string) => { if (!DAY.test(day)) return false; const moment = Date.parse(`${day}T00:00:00Z`); return !Number.isNaN(moment) && new Date(moment).toISOString().slice(0, 10) === day; };
/** The start of a Riyadh day (UTC+3, no daylight saving) as a moment. */
const riyadhStart = (day: string) => new Date(`${day}T00:00:00+03:00`);
const nextDay = (day: string) => new Date(riyadhStart(day).getTime() + 86_400_000);

export type ProgressLogFilter = { from?: string; to?: string; byUserId?: number; blockCode?: string; activityCode?: string; source?: LogSource };

export async function getPmcProgressLog(input: Scope & ProgressLogFilter) {
  for (const day of [input.from, input.to]) if (day !== undefined && !isDay(day)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PROGRESS_LOG_DATE_INVALID" });
  if (input.from && input.to && input.from > input.to) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PROGRESS_LOG_DATE_INVALID" });
  if (input.source && !LOG_SOURCES.includes(input.source)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PROGRESS_LOG_SOURCE_INVALID" });
  const db = await authorize(input, "project.pmc.read");
  const scope = { tenantId: input.tenantId, projectId: input.projectId };
  const wantQc = !input.source || input.source === "qc"; const wantHistory = input.source !== "qc";

  const historyWhere = and(
    mine(pmcUnitActivityHistory, scope),
    input.from ? gte(pmcUnitActivityHistory.changedAt, riyadhStart(input.from)) : undefined,
    input.to ? lt(pmcUnitActivityHistory.changedAt, nextDay(input.to)) : undefined,
    input.byUserId ? eq(pmcUnitActivityHistory.changedByUserId, input.byUserId) : undefined,
    input.activityCode ? eq(pmcActivityDefinitions.code, input.activityCode) : undefined,
  );
  const qcWhere = and(
    mine(pmcQcReceiptEvents, scope),
    input.from ? gte(pmcQcReceiptEvents.changedAt, riyadhStart(input.from)) : undefined,
    input.to ? lt(pmcQcReceiptEvents.changedAt, nextDay(input.to)) : undefined,
    input.byUserId ? eq(pmcQcReceiptEvents.changedByUserId, input.byUserId) : undefined,
    input.activityCode ? eq(pmcActivityDefinitions.code, input.activityCode) : undefined,
  );
  const [history, qc, blocks, people, qcPeople, activityList] = await Promise.all([
    wantHistory ? db.select({ id: pmcUnitActivityHistory.id, at: pmcUnitActivityHistory.changedAt, note: pmcUnitActivityHistory.note, from: pmcUnitActivityHistory.fromStatus, to: pmcUnitActivityHistory.toStatus, byUserId: pmcUnitActivityHistory.changedByUserId, byName: users.name, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, blockId: pmcUnits.blockId, activityCode: pmcActivityDefinitions.code, activityName: pmcActivityDefinitions.name })
      .from(pmcUnitActivityHistory)
      .innerJoin(pmcUnitActivityProgress, and(eq(pmcUnitActivityProgress.id, pmcUnitActivityHistory.unitActivityProgressId), mine(pmcUnitActivityProgress, scope)))
      .innerJoin(pmcUnits, and(eq(pmcUnits.id, pmcUnitActivityProgress.unitId), mine(pmcUnits, scope)))
      .innerJoin(pmcActivityDefinitions, and(eq(pmcActivityDefinitions.id, pmcUnitActivityProgress.activityDefinitionId), mine(pmcActivityDefinitions, scope)))
      .leftJoin(users, eq(users.id, pmcUnitActivityHistory.changedByUserId))
      .where(historyWhere).orderBy(desc(pmcUnitActivityHistory.changedAt)).limit(PROGRESS_LOG_MAX_ROWS + 1) : Promise.resolve([]),
    wantQc ? db.select({ id: pmcQcReceiptEvents.id, at: pmcQcReceiptEvents.changedAt, batchId: pmcQcReceiptEvents.batchId, from: pmcQcReceiptEvents.fromReceived, to: pmcQcReceiptEvents.toReceived, byUserId: pmcQcReceiptEvents.changedByUserId, byName: users.name, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, blockId: pmcUnits.blockId, activityCode: pmcActivityDefinitions.code, activityName: pmcActivityDefinitions.name })
      .from(pmcQcReceiptEvents)
      .innerJoin(pmcQcReceipts, and(eq(pmcQcReceipts.id, pmcQcReceiptEvents.receiptId), mine(pmcQcReceipts, scope)))
      .innerJoin(pmcUnits, and(eq(pmcUnits.id, pmcQcReceipts.unitId), mine(pmcUnits, scope)))
      .innerJoin(pmcActivityDefinitions, and(eq(pmcActivityDefinitions.id, pmcQcReceipts.activityDefinitionId), mine(pmcActivityDefinitions, scope)))
      .leftJoin(users, eq(users.id, pmcQcReceiptEvents.changedByUserId))
      .where(qcWhere).orderBy(desc(pmcQcReceiptEvents.changedAt)).limit(PROGRESS_LOG_MAX_ROWS + 1) : Promise.resolve([]),
    db.select({ id: pmcBlocks.id, code: pmcBlocks.code }).from(pmcBlocks).where(mine(pmcBlocks, scope)),
    db.selectDistinct({ id: users.id, name: users.name }).from(pmcUnitActivityHistory).innerJoin(users, eq(users.id, pmcUnitActivityHistory.changedByUserId)).where(mine(pmcUnitActivityHistory, scope)),
    // review of #569 (C, note 2): whoever made only QC receipts is a person of the log too, so the person list reads both
    db.selectDistinct({ id: users.id, name: users.name }).from(pmcQcReceiptEvents).innerJoin(users, eq(users.id, pmcQcReceiptEvents.changedByUserId)).where(mine(pmcQcReceiptEvents, scope)),
    // the activity list is the project's own, so choosing one never empties the list of the others (the filters run on the server)
    db.selectDistinct({ code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
  ]);
  const truncated = history.length > PROGRESS_LOG_MAX_ROWS || qc.length > PROGRESS_LOG_MAX_ROWS;
  const blockCode = new Map(blocks.map(block => [block.id, block.code]));
  const qcStatus = (received: boolean | null) => (received === null ? null : received ? "RECEIVED" : "NOT_RECEIVED");
  const rows: LogRow[] = [
    ...history.slice(0, PROGRESS_LOG_MAX_ROWS).map(row => ({ id: row.id, at: row.at, note: row.note, activityCode: row.activityCode, activityName: row.activityName, from: row.from, to: row.to, byUserId: row.byUserId, byName: row.byName, villa: villaKey(row.villaLabel ?? row.unitNumber), blockCode: blockCode.get(row.blockId) ?? "" })),
    ...qc.slice(0, PROGRESS_LOG_MAX_ROWS).map(row => ({ id: row.id, at: row.at, note: null, isQc: true, qcBatchId: row.batchId, activityCode: row.activityCode, activityName: row.activityName, from: qcStatus(row.from), to: qcStatus(row.to)!, byUserId: row.byUserId, byName: row.byName, villa: villaKey(row.villaLabel ?? row.unitNumber), blockCode: blockCode.get(row.blockId) ?? "" })),
  ];
  let entries = groupProgressLog(rows).filter(entry => !input.source || entry.source === input.source);
  // a block keeps the entries that touched it, with only its own villas
  if (input.blockCode) {
    const wanted = input.blockCode;
    const villasOf = new Map(rows.filter(row => row.blockCode === wanted).map(row => [row.villa, true]));
    entries = entries.filter(entry => entry.blocks.includes(wanted)).map(entry => ({ ...entry, villas: entry.villas.filter(villa => villasOf.has(villa)), blocks: [wanted] }));
  }
  return {
    entries: entries.map(entry => ({ ...entry, at: entry.at.toISOString(), villaCount: entry.villas.length })),
    truncated, maxRows: PROGRESS_LOG_MAX_ROWS,
    filters: {
      people: Array.from(new Map([...people, ...qcPeople].filter(person => person.name).map(person => [person.id, person])).values()).sort((a, b) => String(a.name).localeCompare(String(b.name))),
      blocks: blocks.map(block => block.code).sort(),
      activities: Array.from(new Map(activityList.map(item => [item.code, item])).values()).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true })),
    },
  };
}

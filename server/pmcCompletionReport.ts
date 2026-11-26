// Q-70 (2): «تقرير الإنجاز» — one row per villa × activity of the villa's own model: block, phase, model, the activity's weight, its status now, the day it
// started (first move to IN_PROGRESS), the day it was completed (the last move to COMPLETE), the QC receipt and its day, and who moved it last. Computed from
// what the site wrote (pmc_unit_activity_progress, pmc_unit_activity_history, pmc_qc_receipts); a cell never touched is «not started» with no dates.
// Read with project.pmc.read; every table in the query is filtered by the company and the project. A whole project is 1,230 villas × 216 activities ≈ 265
// thousand rows, so the rows come in pages (at most PAGE_MAX) in a stable order, with the total, and the screen exports them page by page.
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authorize, type Scope } from "./pmcService";

export const COMPLETION_PAGE_MAX = 5000;
export const COMPLETION_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE"] as const;
export type CompletionFilter = { blockCode?: string; phase?: string; activityCode?: string; status?: (typeof COMPLETION_STATUSES)[number]; villa?: string };
export type CompletionRow = {
  villa: string; blockCode: string; phase: string | null; modelCode: string; activityCode: string; activityName: string; weightPercent: number;
  status: (typeof COMPLETION_STATUSES)[number]; startedOn: string | null; completedOn: string | null; qcReceived: boolean | null; qcOn: string | null; lastBy: string | null; lastAt: string | null;
};

const riyadhDay = (value: unknown) => (value ? new Date(new Date(value as string).getTime() + 3 * 3_600_000).toISOString().slice(0, 10) : null);

export async function getPmcCompletionReport(input: Scope & CompletionFilter & { offset?: number; limit?: number }) {
  if (input.status && !COMPLETION_STATUSES.includes(input.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_COMPLETION_FILTER_INVALID" });
  const offset = Math.max(0, Math.trunc(input.offset ?? 0)); const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 1000)), COMPLETION_PAGE_MAX);
  const db = await authorize(input, "project.pmc.read");
  const { tenantId: t, projectId: p } = input;
  // the villa as a person writes it: the number of «Villa 700» (the same key as everywhere else)
  const villaNumber = input.villa ? Number((input.villa.match(/\d+/g) ?? []).pop()) : null;
  if (input.villa && !Number.isFinite(villaNumber)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_COMPLETION_FILTER_INVALID" });
  const where = sql`u.tenant_id = ${t} AND u.project_id = ${p} AND d.tenant_id = ${t} AND d.project_id = ${p} AND b.tenant_id = ${t} AND b.project_id = ${p}
    ${input.blockCode ? sql`AND b.code = ${input.blockCode}` : sql``}
    ${input.phase ? sql`AND upper(u.phase) = upper(${input.phase})` : sql``}
    ${input.activityCode ? sql`AND d.code = ${input.activityCode}` : sql``}
    ${input.status ? sql`AND coalesce(c.status::text, 'NOT_STARTED') = ${input.status}` : sql``}
    ${villaNumber !== null ? sql`AND u.unit_number = ${villaNumber}` : sql``}`;
  const from = sql`FROM pmc_units u
    JOIN pmc_blocks b ON b.id = u.block_id
    JOIN pmc_activity_definitions d ON d.model_code = u.model_code
    LEFT JOIN pmc_unit_activity_progress c ON c.unit_id = u.id AND c.activity_definition_id = d.id AND c.tenant_id = ${t} AND c.project_id = ${p}`;
  const [countResult, pageResult, optionResult] = await Promise.all([
    db.execute(sql`SELECT count(*)::int AS n ${from} WHERE ${where}`),
    db.execute(sql`SELECT u.unit_number AS "unitNumber", u.villa_label AS "villaLabel", b.code AS "blockCode", u.phase, u.model_code AS "modelCode",
        d.code AS "activityCode", d.name AS "activityName", d.weight_percent AS "weightPercent", coalesce(c.status::text, 'NOT_STARTED') AS status,
        h.started_at AS "startedAt", h.completed_at AS "completedAt", q.received AS "qcReceived", q.received_on AS "qcOn", who.name AS "lastBy", c.last_changed_at AS "lastAt"
      ${from}
      LEFT JOIN LATERAL (
        SELECT min(x.changed_at) FILTER (WHERE x.to_status = 'IN_PROGRESS') AS started_at, max(x.changed_at) FILTER (WHERE x.to_status = 'COMPLETE') AS completed_at
        FROM pmc_unit_activity_history x WHERE x.unit_activity_progress_id = c.id AND x.tenant_id = ${t} AND x.project_id = ${p}
      ) h ON c.id IS NOT NULL
      LEFT JOIN pmc_qc_receipts q ON q.unit_id = u.id AND q.activity_definition_id = d.id AND q.tenant_id = ${t} AND q.project_id = ${p}
      LEFT JOIN users who ON who.id = c.last_changed_by_user_id
      WHERE ${where}
      ORDER BY u.unit_number, d.code, d.id
      LIMIT ${limit} OFFSET ${offset}`),
    // the lists the screen's filters choose from (the project's own blocks, phases and activities), read once with the first page
    offset === 0 ? db.execute(sql`SELECT 'block' AS kind, code AS value, NULL AS label FROM pmc_blocks WHERE tenant_id = ${t} AND project_id = ${p}
      UNION SELECT DISTINCT 'phase', phase, NULL FROM pmc_units WHERE tenant_id = ${t} AND project_id = ${p} AND phase IS NOT NULL
      UNION SELECT DISTINCT 'activity', code, min(name) FROM pmc_activity_definitions WHERE tenant_id = ${t} AND project_id = ${p} GROUP BY code`) : Promise.resolve(null),
  ]);
  const total = Number((countResult.rows[0] as { n: number } | undefined)?.n ?? 0);
  const rows: CompletionRow[] = (pageResult.rows as Array<Record<string, unknown>>).map(row => ({
    villa: String(row.unitNumber), blockCode: String(row.blockCode), phase: (row.phase as string | null) ?? null, modelCode: String(row.modelCode),
    activityCode: String(row.activityCode), activityName: String(row.activityName), weightPercent: Number(row.weightPercent),
    status: row.status as CompletionRow["status"],
    // a COMPLETE cell completed without passing through «in progress» has no start day: «—», not a guess
    startedOn: riyadhDay(row.startedAt), completedOn: row.status === "COMPLETE" ? riyadhDay(row.completedAt) : null,
    qcReceived: (row.qcReceived as boolean | null) ?? null, qcOn: row.qcOn ? String(row.qcOn).slice(0, 10) : null,
    lastBy: (row.lastBy as string | null) ?? null, lastAt: row.lastAt ? new Date(row.lastAt as string).toISOString() : null,
  }));
  const options = optionResult ? (optionResult.rows as Array<{ kind: string; value: string; label: string | null }>) : null;
  const pick = (kind: string) => (options ?? []).filter(option => option.kind === kind).sort((a, b) => a.value.localeCompare(b.value, "en", { numeric: true }));
  const filters = options ? { blocks: pick("block").map(option => option.value), phases: pick("phase").map(option => option.value), activities: pick("activity").map(option => ({ code: option.value, name: option.label ?? option.value })) } : null;
  return { total, offset, limit, rows, filters, nextOffset: offset + rows.length < total ? offset + rows.length : null };
}

// Q-71 (1) (the owner, 26-11: «progress entry looks tied to the schedule's items, and that is wrong»): in a project with a PMC catalogue, a WBS item that a PMC
// activity is linked to (pmc_activity_definitions.wbs_item_id) takes its progress from the villas' cells — syncPmcProgressToEvm writes it in the same
// transaction as every PMC write — so it is not entered by hand: a typed percent would compete with the computed one and be overwritten by the next PMC write.
// Manual entry stays for every WBS item no PMC activity points to (a project without PMC keeps it whole). Every read is filtered by the company and the project.
import { and, eq, isNotNull } from "drizzle-orm";
import { pmcActivityDefinitions } from "../drizzle/schema";

type Reader = { select: (...args: never[]) => unknown };
export const PROGRESS_COMPUTED_FROM_PMC = "PROJECT_OS_PROGRESS_COMPUTED_FROM_PMC";

/** WBS item id → the codes of the PMC activities that compute it (sorted), for this company and project. */
export async function pmcComputedWbs(reader: Reader, scope: { tenantId: string; projectId: string }): Promise<Map<string, string[]>> {
  const rows = await (reader as unknown as { select: (fields: Record<string, unknown>) => { from: (table: unknown) => { where: (condition: unknown) => Promise<Array<{ wbsItemId: string | null; code: string }>> } } })
    .select({ wbsItemId: pmcActivityDefinitions.wbsItemId, code: pmcActivityDefinitions.code })
    .from(pmcActivityDefinitions)
    .where(and(eq(pmcActivityDefinitions.tenantId, scope.tenantId), eq(pmcActivityDefinitions.projectId, scope.projectId), isNotNull(pmcActivityDefinitions.wbsItemId)));
  const out = new Map<string, string[]>();
  for (const row of rows) { if (!row.wbsItemId) continue; const codes = out.get(row.wbsItemId) ?? []; if (!codes.includes(row.code)) codes.push(row.code); out.set(row.wbsItemId, codes); }
  out.forEach(codes => codes.sort((a, b) => a.localeCompare(b, "en", { numeric: true })));
  return out;
}

/** The source shown beside a WBS item: computed from PMC (with its activities) or entered by hand. */
export const progressSourceOf = (computed: Map<string, string[]>, wbsItemId: string) => { const codes = computed.get(wbsItemId); return codes ? { computedFromPmc: true as const, pmcActivityCodes: codes } : { computedFromPmc: false as const, pmcActivityCodes: [] as string[] }; };

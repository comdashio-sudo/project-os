// Q-55 batch 1: the demonstration's first project in «weights and deliveries mode» (specs/dashio-two-project-modes). On top of the catalogue, the cells and the master
// plan the seed already writes, this adds what that mode shows: English names beside the Arabic ones, a WIR number per activity, QC receipts for the completed work,
// the site's own list of activities (one per catalogue activity, its link confirmed), the site's state of each villa, and two weekly exports from the consultant
// (synthetic, a week apart) imported through the platform's own importer, so the comparison screen has real differences in both directions.
// Everything is invented and says so. It runs after the main transaction has committed, because the importer and the link confirmation open their own.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { buildWo22ConsultantExport } from "../../server/domain/smartImport/wo22Fixture";
import { confirmConsultantImport } from "../../server/consultantImport";
import { ACTIVITIES, GROUPS, UNIT_COUNT, UNITS_PER_BLOCK, BLOCKS_PER_ZONE, stateAt, type Cell, type CellState } from "./demoData";

type Bulk = (client: PoolClient, table: string, columns: string[], rows: unknown[][]) => Promise<void>;
type Caller = { pmcSite: { confirmLinks(input: { tenantId: string; projectId: string; links: Array<{ siteActivityId: string; activityCodes: string[] }> }): Promise<unknown>; linkConsultantColumns(input: { tenantId: string; projectId: string; links: Array<{ columnId: string; activityCode: string | null }> }): Promise<unknown>; consultantColumns(input: { tenantId: string; projectId: string }): Promise<Array<{ id: string; wirCode: string | null; activityCode: string | null }>> } };

/** The WIR number the catalogue carries for an activity, and the one the consultant writes: the same, except for the last two (the owner matches those once). */
export const demoWir = (index: number) => `WIR-${101 + index}`;
export const consultantWir = (index: number) => (index >= ACTIVITIES.length - 2 ? `WIR-${901 + index}` : demoWir(index));
/** The consultant receives work a few days after the site finishes it, and now and then records a villa the site has not finished yet. */
export const CONSULTANT_LAG_DAYS = 3;
export const consultantReceived = (cell: Cell, unitIndex: number, activityIndex: number, day: number) =>
  stateAt(cell, day - CONSULTANT_LAG_DAYS) === "COMPLETE" || ((unitIndex * 7 + activityIndex * 13) % 89 === 0 && stateAt(cell, day) === "IN_PROGRESS");
/** The site's state of a cell, in the site's words (the catalogue's UNDER_REVIEW is the site's «inspection requested»). */
export const siteStatusOf = (state: CellState, qcReceived: boolean) =>
  state === "COMPLETE" ? (qcReceived ? "QC_APPROVED" : "DONE") : state === "UNDER_REVIEW" ? "INSPECTION_REQUESTED" : state === "IN_PROGRESS" ? "IN_PROGRESS" : null;
/** A completed cell is received by QC unless it is one of the few the QC engineer has not signed yet. */
export const qcReceivedOf = (unitIndex: number, activityIndex: number) => (unitIndex + activityIndex * 5) % 23 !== 0;
/** The two export days, in days since the project started: last week's and this week's. */
export const exportDays = (today: number) => [today - 7, today];

export async function seedWeightsModeProject(input: {
  client: PoolClient; bulk: Bulk; tenantId: string; projectId: string; ownerId: number; qcUserId: number; siteUserId: number;
  unitIds: string[]; cells: Cell[]; defId: (model: string, code: string) => string; modelOf: (unit: number) => string;
  groupIds: Map<string, string>; stageIds: Map<string, string>; day: (n: number) => Date; today: number; owner: Caller;
  storagePut?: (key: string, data: Uint8Array, type: string) => Promise<{ key: string }>; log: (message: string) => void;
}) {
  const { client, bulk, tenantId, projectId } = input;
  const ymd = (n: number) => input.day(n).toISOString().slice(0, 10);
  const scope = { tenantId, projectId };

  // 1. the catalogue in two languages, with a CSI division per group and a WIR number per activity
  for (const group of GROUPS) await client.query("UPDATE pmc_activity_groups SET name_en = $1 WHERE id = $2 AND tenant_id = $3", [group.nameEn, input.groupIds.get(group.code), tenantId]);
  for (const [index, activity] of ACTIVITIES.entries()) {
    await client.query("UPDATE pmc_activity_stages SET name_en = $1 WHERE id = $2 AND tenant_id = $3", [activity.nameEn, input.stageIds.get(activity.code), tenantId]);
    await client.query("UPDATE pmc_activity_definitions SET name_en = $1, wir_code = $2 WHERE tenant_id = $3 AND project_id = $4 AND code = $5", [activity.nameEn, demoWir(index), tenantId, projectId, activity.code]);
  }

  // 2. QC receipts for the completed cells, dated the day the work was accepted
  const activityIndex = new Map(ACTIVITIES.map((activity, index) => [activity.code, index]));
  const receipts: unknown[][] = [];
  for (const cell of input.cells) {
    if (stateAt(cell, input.today) !== "COMPLETE" || !qcReceivedOf(cell.unit, activityIndex.get(cell.activity)!)) continue;
    const at = input.day(cell.finish + 2);
    receipts.push([randomUUID(), tenantId, projectId, input.unitIds[cell.unit], input.defId(input.modelOf(cell.unit), cell.activity), true, at.toISOString().slice(0, 10), input.qcUserId, at, at]);
  }
  await bulk(client, "pmc_qc_receipts", ["id", "tenant_id", "project_id", "unit_id", "activity_definition_id", "received", "received_on", "updated_by_user_id", "created_at", "updated_at"], receipts);

  // 3. the site's list of activities (one per catalogue activity) and its state of each villa
  const total = ACTIVITIES.reduce((sum, activity) => sum + activity.weight, 0);
  const siteIds = new Map(ACTIVITIES.map(activity => [activity.code, randomUUID()]));
  await bulk(client, "pmc_site_activities", ["id", "tenant_id", "project_id", "code", "csi_name", "sub_name", "name", "weight", "sort_order"],
    ACTIVITIES.map((activity, index) => [siteIds.get(activity.code), tenantId, projectId, `S-${activity.code}`, GROUPS.find(group => group.code === activity.group)!.name, null, activity.name, (activity.weight / total).toFixed(8), index + 1]));
  const siteCells: unknown[][] = [];
  for (const cell of input.cells) {
    const state = stateAt(cell, input.today);
    const status = siteStatusOf(state, qcReceivedOf(cell.unit, activityIndex.get(cell.activity)!));
    if (!status) continue;
    const started = ymd(cell.start); const done = state === "COMPLETE" || state === "UNDER_REVIEW" ? ymd(cell.finish) : null;
    const statusOn = status === "QC_APPROVED" || status === "DONE" ? ymd(cell.finish + 2) : status === "INSPECTION_REQUESTED" ? ymd(cell.finish) : started;
    siteCells.push([randomUUID(), tenantId, projectId, input.unitIds[cell.unit], siteIds.get(cell.activity), status, statusOn, started, done, status === "INSPECTION_REQUESTED" || status === "QC_APPROVED" || status === "DONE" ? done : null, status === "QC_APPROVED" ? statusOn : null, input.siteUserId]);
  }
  await bulk(client, "pmc_site_cells", ["id", "tenant_id", "project_id", "unit_id", "site_activity_id", "status", "status_on", "in_progress_on", "done_on", "inspection_requested_on", "qc_approved_on", "updated_by_user_id"], siteCells);
  // the link of each site activity to its catalogue activity, confirmed through the platform (the screen's «confirm links»)
  await input.owner.pmcSite.confirmLinks({ ...scope, links: ACTIVITIES.map(activity => ({ siteActivityId: siteIds.get(activity.code)!, activityCodes: [activity.code] })) });

  // 4. the consultant's two weekly exports, imported by the platform's importer (each one is new work received since the last)
  const byCell = new Map(input.cells.map(cell => [`${cell.unit}:${cell.activity}`, cell]));
  const villas = Array.from({ length: UNIT_COUNT }, (_v, unit) => {
    const block = Math.floor(unit / UNITS_PER_BLOCK); const zone = Math.floor(block / BLOCKS_PER_ZONE);
    return { label: String(unit + 1), zone: `Z${zone + 1}`, block: `B${String(block + 1).padStart(2, "0")}`, cluster: `C${block + 1}`, model: input.modelOf(unit), area: 0, price: 0, oracle: "" };
  });
  const catalog = ACTIVITIES.map((activity, index) => ({ name: activity.nameEn, section: GROUPS.find(group => group.code === activity.group)!.nameEn, subgroup: activity.nameEn, location: "Whole building", weight: activity.weight / total, wir: demoWir(index), consultantWir: consultantWir(index), site: index }));
  const imports: Array<{ day: string; newlyReceived: number; receivedTotal: number; unlinked: number }> = [];
  // an import record points at its original file: without a storage service there is no file to keep, so the exports are not imported (as the photos are not made)
  if (!input.storagePut) input.log("weights mode: no storage service, the consultant's exports are not imported");
  for (const [n, exportDay] of input.storagePut ? exportDays(input.today).entries() : []) {
    const received = villas.map((_v, unit) => ACTIVITIES.map((activity, index) => consultantReceived(byCell.get(`${unit}:${activity.code}`)!, unit, index, exportDay)));
    const date = ymd(exportDay);
    const bytes = await buildWo22ConsultantExport({ villas, catalog, consultant: received, consultantDate: date }, { received, exportDate: date, project: "Demo villas (synthetic)" });
    const { key } = await input.storagePut!(`tenants/${tenantId}/demo/consultant-export-${date}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const plan = await confirmConsultantImport({ userId: input.ownerId, ...scope, bytes, source: { key, name: `تصدير الاستشاري ${date} (عرض).xlsx` } });
    imports.push({ day: date, newlyReceived: plan.newlyReceived, receivedTotal: plan.receivedTotal, unlinked: plan.unlinked.length });
    if (n === 0) {
      // the two columns whose WIR differs from the catalogue's are matched once by the owner, as on the screen; the match holds for the next export
      const columns = await input.owner.pmcSite.consultantColumns(scope);
      const links = columns.filter(column => !column.activityCode).map(column => {
        const index = ACTIVITIES.findIndex((_a, i) => consultantWir(i) === column.wirCode);
        return { columnId: column.id, activityCode: index >= 0 ? ACTIVITIES[index].code : null };
      }).filter(link => link.activityCode);
      if (links.length) await input.owner.pmcSite.linkConsultantColumns({ ...scope, links });
    }
  }
  input.log(`weights mode: ${receipts.length} QC receipts, ${siteCells.length} site cells, consultant exports ${imports.map(item => `${item.day} (+${item.newlyReceived})`).join(", ")}`);
  return { qcReceipts: receipts.length, siteCells: siteCells.length, imports };
}

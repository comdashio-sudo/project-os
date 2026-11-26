// Q-55 batch 3 (b), the adviser's decision (I57, 26-11 08:41, option a): the demonstration company's live schedule, in a third small project of its own
// (PRJ-DEMO-3 «جدول P6») so the two projects' figures are untouched. Its activities come from a made-up Primavera P6 file through the platform's own P6
// importer (the first import is the baseline), then two progress updates through the platform's own P6 update — the planning engineer does both, with the
// role the owner gives them on this project through the platform's own procedure. Everything is obviously made up: names end in «(عرض)». The live-schedule
// screen then reads the baseline and the updates and compares them. Called from seedDemoCompany; the erasure removes it with the company.
import ExcelJS from "exceljs";
import { confirmP6Import } from "../../server/p6Import";
import { confirmScheduleUpdate } from "../../server/p6Update";

type OwnerCaller = {
  projects: { create(input: Record<string, unknown>): Promise<{ id: string }> };
  tenant: { assignMembershipRole(input: Record<string, unknown>): Promise<unknown> };
};

// WBS, then activities in order (code, name, working days); each follows the one before it (finish-to-start), so the dates chain
const WBS = [["D3.1", "أعمال الموقع (عرض)"], ["D3.2", "الهيكل الإنشائي (عرض)"], ["D3.3", "الأعمال الكهروميكانيكية (عرض)"], ["D3.4", "التشطيبات (عرض)"]] as const;
const ACTIVITIES = [
  ["D3.1", "D3-1010", "تجهيز الموقع والتسوير (عرض)", 6], ["D3.1", "D3-1020", "الحفر والردم (عرض)", 10], ["D3.1", "D3-1030", "خرسانة النظافة (عرض)", 4],
  ["D3.2", "D3-2010", "القواعد والميد (عرض)", 12], ["D3.2", "D3-2020", "أعمدة الدور الأرضي (عرض)", 8], ["D3.2", "D3-2030", "سقف الدور الأرضي (عرض)", 10],
  ["D3.2", "D3-2040", "أعمدة الدور الأول (عرض)", 8], ["D3.2", "D3-2050", "سقف الدور الأول (عرض)", 10], ["D3.2", "D3-2060", "أعمال البلوك (عرض)", 14],
  ["D3.3", "D3-3010", "تمديدات الكهرباء (عرض)", 12], ["D3.3", "D3-3020", "تمديدات السباكة (عرض)", 12], ["D3.3", "D3-3030", "مجاري التكييف (عرض)", 10],
  ["D3.4", "D3-4010", "اللياسة (عرض)", 14], ["D3.4", "D3-4020", "البلاط (عرض)", 14], ["D3.4", "D3-4030", "الدهانات (عرض)", 10], ["D3.4", "D3-4040", "الواجهات (عرض)", 12],
] as const;
// the two updates: activity code → [actual start delay, actual finish delay] in days against the plan (null = not finished yet); one chain, so every
// activity is on the critical path (float 0) and a late finish pushes what follows. The second update stops at what has started by today.
const UPDATE_1: Record<string, [number, number | null]> = { "D3-1010": [0, 1], "D3-1020": [1, 3], "D3-1030": [3, 3], "D3-2010": [3, null] };
const UPDATE_2: Record<string, [number, number | null]> = { "D3-2010": [3, 6], "D3-2020": [6, 8], "D3-2030": [8, null] };

export async function seedLiveSchedule(input: {
  tenantId: string; now: Date; ownerCaller: OwnerCaller; plannerUserId: number; plannerMembershipId: string; planningRoleId: string; log: (message: string) => void;
  /** with a storage service the files are kept, as an upload keeps them (the import's record points at a file that is there) */
  storagePut?: (key: string, data: Uint8Array, type: string) => Promise<{ key: string }>;
}) {
  const { id: projectId } = await input.ownerCaller.projects.create({ tenantId: input.tenantId, code: "PRJ-DEMO-3", name: "جدول P6 — مبنى الخدمات (عرض)", projectType: "building", currency: "SAR" });
  await input.ownerCaller.tenant.assignMembershipRole({ tenantId: input.tenantId, membershipId: input.plannerMembershipId, roleId: input.planningRoleId, scopeType: "project", scopeId: projectId });
  const scope = { userId: input.plannerUserId, tenantId: input.tenantId, projectId };
  const keep = async (name: string, bytes: Uint8Array, type: string) => {
    const key = `tenants/${input.tenantId}/demo/${name}`;
    return input.storagePut ? (await input.storagePut(key, bytes, type)).key : key;
  };

  // the plan: it started 75 days ago; the file's data date is the start (the baseline, before any progress)
  const dayMs = 86_400_000; const start = new Date(input.now.getTime() - 75 * dayMs);
  const ymd = (date: Date) => date.toISOString().slice(0, 10);
  const plan: Record<string, { start: Date; finish: Date }> = {};
  let cursor = start;
  for (const [, code, , days] of ACTIVITIES) { const finish = new Date(cursor.getTime() + days * dayMs); plan[code] = { start: cursor, finish }; cursor = finish; }
  const xer = [
    `ERMHDR\t25.12\t${ymd(start)}\tProject\tadmin\tadmin\tdb\tProject Management\tSAR`,
    "%T\tPROJECT", "%F\tproj_id\tproj_short_name\tplan_start_date\tscd_end_date\tlast_recalc_date",
    `%R\t700\tPRJ-DEMO-3\t${ymd(start)} 08:00\t${ymd(cursor)} 17:00\t${ymd(start)} 00:00`,
    "%T\tPROJWBS", "%F\twbs_id\tproj_id\tproj_node_flag\tseq_num\twbs_short_name\twbs_name\tparent_wbs_id",
    "%R\t7000\t700\tY\t0\tD3\tمبنى الخدمات (عرض)\t",
    ...WBS.map(([code, name], i) => `%R\t${7001 + i}\t700\tN\t${i + 1}\t${code}\t${name}\t7000`),
    "%T\tTASK", "%F\ttask_id\tproj_id\twbs_id\ttask_type\tstatus_code\ttask_code\ttask_name\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\ttarget_start_date\ttarget_end_date",
    ...ACTIVITIES.map(([wbs, code, name, days], i) => `%R\t${7100 + i}\t700\t${7001 + WBS.findIndex(([w]) => w === wbs)}\tTT_Task\tTK_NotStart\t${code}\t${name}\t${days * 8}\t${days * 8}\t0\t${ymd(plan[code].start)} 08:00\t${ymd(plan[code].finish)} 17:00`),
    "%T\tTASKPRED", "%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt",
    ...ACTIVITIES.slice(1).map((_, i) => `%R\t${7200 + i}\t${7101 + i}\t${7100 + i}\tPR_FS\t0`),
    "%E",
  ].join("\r\n");
  const baselineBytes = new Uint8Array(Buffer.from(xer, "utf8"));
  await confirmP6Import({ ...scope, bytes: baselineBytes, source: { key: await keep("PRJ-DEMO-3-baseline.xer", baselineBytes, "application/octet-stream"), name: "PRJ-DEMO-3-baseline.xer" } });

  // two progress updates, as the planner exports them from P6 (Activity ID, actual start, actual finish)
  for (const [number, update] of [[1, UPDATE_1], [2, UPDATE_2]] as const) {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("TASK");
    sheet.addRow(["Activity ID", "(*)Start", "(*)Finish"]);
    for (const [code, [startLate, finishLate]] of Object.entries(update)) {
      const actualStart = new Date(plan[code].start.getTime() + startLate * dayMs);
      const actualFinish = finishLate === null ? null : new Date(plan[code].finish.getTime() + finishLate * dayMs);
      sheet.addRow([code, ymd(actualStart), actualFinish && actualFinish <= input.now ? ymd(actualFinish) : ""]);
    }
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer()); const name = `PRJ-DEMO-3-update-${number}.xlsx`;
    await confirmScheduleUpdate({ ...scope, bytes, source: { key: await keep(name, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), name } });
  }
  input.log(`live schedule: PRJ-DEMO-3 with ${ACTIVITIES.length} activities from a P6 file, then two updates`);
  return { projectId, activities: ACTIVITIES.length, updates: 2 };
}

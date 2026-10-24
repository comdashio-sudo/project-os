// "شركة العرض": a demonstration company with a full project, built for the owner to look at and to sell with (work order 15, item 1).
// Everything in it is invented and says so. It never touches another company: it creates its own and every write carries that company's id.
//
//   seedDemoCompany({ ownerEmail })   builds it, or reports that it already exists (no second copy, no change to the first)
//   deleteDemoCompany({ ownerEmail }) erases it with the platform's own audited erasure and checks that nothing of it is left
//
// The history is written with real dates (the project started 92 days ago) by the same laws the platform computes with: unit progress feeds earned value through
// the bridge function the server uses, planned value from the schedule, actual cost from posted cost entries, final profit from the contract and the EAC.
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { appRouter } from "../../server/routers";
import { createTenantForUser, getDb, upsertUser } from "../../server/db";
import { deleteTenantData } from "../../server/tenantData";
import { calculateEvm } from "../../server/domain/evm";
import { fpac } from "../../server/domain/profitability";
import { effectiveStatusFactors } from "../../server/domain/pmc";
import {
  ACTIVITIES, BLOCKS_PER_ZONE, CONSULTANTS, DAY, DEMO, DEMO_PEOPLE, GROUPS, MONEY, UNITS_PER_BLOCK, UNIT_COUNT, WBS_ITEMS, ZONES,
  addDays, buildTimeline, progressByWbs, rng, stateAt, unitPolygon, wbsValue, zoneName, type Cell, type CellState,
} from "./demoData";

type Log = (message: string) => void;
type Row = Record<string, unknown>;
const openIdOf = (email: string) => `email:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 40)}`;
const pad = (n: number, width = 3) => String(n).padStart(width, "0");
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const PROJECT_DAYS = 92;

/** Multi-row INSERT in chunks that stay under PostgreSQL's 65 535-parameter limit. */
async function bulk(client: PoolClient, table: string, columns: string[], rows: unknown[][]) {
  if (!rows.length) return;
  const per = Math.max(1, Math.floor(60_000 / columns.length));
  for (let start = 0; start < rows.length; start += per) {
    const part = rows.slice(start, start + per);
    const values: unknown[] = [];
    const tuples = part.map(row => `(${row.map(value => { values.push(value); return `$${values.length}`; }).join(",")})`);
    await client.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}`, values);
  }
}

export async function findDemoCompany(): Promise<{ id: string; status: string } | null> {
  const db = await getDb(); if (!db) throw new Error("DATABASE_URL is required.");
  const client = await (db as unknown as { $client: { connect(): Promise<PoolClient> } }).$client.connect();
  try {
    const { rows } = await client.query("SELECT id, status FROM companies WHERE slug = $1", [DEMO.slug]);
    return rows[0] ?? null;
  } finally { client.release(); }
}

/** The caller of a procedure, as the person: the same tRPC procedures the screens call, so the demonstration passes through the same checks. */
function callerFor(user: { id: number; openId: string; name: string | null; email: string | null }) {
  return appRouter.createCaller({ user: { ...user, loginMethod: "email", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as never);
}

export async function seedDemoCompany(options: { ownerEmail: string; log?: Log }) {
  const log: Log = options.log ?? (() => undefined);
  const ownerEmail = options.ownerEmail.trim().toLowerCase();
  const existing = await findDemoCompany();
  if (existing) {
    if (existing.status !== "active") throw new Error("A company with the demonstration slug exists but is not active; refusing to touch it.");
    const db = await getDb(); const client = await (db as unknown as { $client: { connect(): Promise<PoolClient> } }).$client.connect();
    try {
      const { rows } = await client.query("SELECT id FROM projects WHERE tenant_id = $1 AND code = $2", [existing.id, DEMO.projectCode]);
      return { created: false as const, tenantId: existing.id, projectId: rows[0]?.id as string | undefined };
    } finally { client.release(); }
  }

  const db = await getDb(); if (!db) throw new Error("DATABASE_URL is required.");
  const now = new Date();
  const T0 = addDays(now, -PROJECT_DAYS);
  const day = (n: number) => addDays(T0, n);
  const random = rng(20261024);

  // ------------------------------------------------------------------------------------------------------------ 1. the company, its owner and its people
  const ownerOpenId = openIdOf(ownerEmail);
  await upsertUser({ openId: ownerOpenId, name: DEMO.ownerName, email: ownerEmail, loginMethod: "email" });
  const people = new Map<string, { id: number; openId: string; name: string; email: string }>();
  const client0 = await (db as unknown as { $client: { connect(): Promise<PoolClient> } }).$client.connect();
  const idOfUser = async (openId: string) => Number((await client0.query("SELECT id FROM users WHERE open_id = $1", [openId])).rows[0].id);
  const owner = { id: await idOfUser(ownerOpenId), openId: ownerOpenId, name: DEMO.ownerName, email: ownerEmail };
  for (const person of DEMO_PEOPLE) {
    const openId = openIdOf(person.email);
    await upsertUser({ openId, name: person.name, email: person.email, loginMethod: "email" });
    people.set(person.key, { id: await idOfUser(openId), openId, name: person.name, email: person.email });
  }
  const { tenantId } = await createTenantForUser({ userId: owner.id, legalName: DEMO.legalName, slug: DEMO.slug, packageCode: "ALL-IN-ONE" });
  log(`company ${tenantId}`);
  const ownerCaller = callerFor(owner);
  const people0 = { pm: people.get("pm")!.id };

  try {
    // ---------------------------------------------------------------------------------------------------------- 2. the structure: portfolio, projects, WBS, units
    const portfolioId = randomUUID(); const projectId = randomUUID(); const project2Id = randomUUID();
    const unitIds = Array.from({ length: UNIT_COUNT }, () => randomUUID());
    const modelOf = (unit: number) => (unit < 350 ? "A" : "B");
    const factorRows: Array<{ status: CellState; factor: number }> = [];
    const factors = effectiveStatusFactors(factorRows);
    // the pace at which blocks start is chosen so the demonstration stands where MONEY says it should (earned value / budget around 16%)
    let startRate = 3.2; let cells: Cell[] = buildTimeline(startRate); let lo = 1.2; let hi = 6;
    const wbsIds = new Map(WBS_ITEMS.map(item => [item.code, randomUUID()]));
    const groupIds = new Map(GROUPS.map(item => [item.code, randomUUID()]));
    const stageIds = new Map(ACTIVITIES.map(item => [item.code, randomUUID()]));
    const definitions: Array<{ id: string; modelCode: string; weightPercent: number; wbsItemId: string; code: string; stageCode: string }> = [];
    for (const modelCode of ["A", "B"]) for (const activity of ACTIVITIES) definitions.push({ id: randomUUID(), modelCode, weightPercent: activity.weight, wbsItemId: wbsIds.get(activity.wbs)!, code: activity.code, stageCode: activity.code });
    const defId = (modelCode: string, code: string) => definitions.find(item => item.modelCode === modelCode && item.code === code)!.id;
    const evAt = (dayNumber: number, timeline: Cell[]) => {
      const progress = progressByWbs(timeline, dayNumber, definitions, unitIds, modelOf, factors);
      return WBS_ITEMS.reduce((sum, item) => sum + wbsValue(item.code) * ((progress.get(wbsIds.get(item.code)!) ?? 0) / 100), 0);
    };
    const targetEv = MONEY.bac * 0.165;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; cells = buildTimeline(mid); startRate = mid; if (evAt(PROJECT_DAYS, cells) > targetEv) lo = mid; else hi = mid; }
    cells = buildTimeline(startRate);
    log(`block start pace ${startRate.toFixed(2)} days; earned value ${Math.round(evAt(PROJECT_DAYS, cells)).toLocaleString("en-US")}`);

    const client = client0;
    await client.query("BEGIN");
    // `lock_timeout` is not needed here: this is a brand-new company, nothing else touches its rows
    await client.query(`INSERT INTO tenant_policies (id, tenant_id, qc_completion_mode, qc_accepted_codes, material_approval_mode, ncr_acceptance_mode, updated_by_user_id) VALUES ($1,$2,'warn','A,B','warn','block',$3) ON CONFLICT DO NOTHING`, [randomUUID(), tenantId, owner.id]);
    await bulk(client, "portfolios", ["id", "tenant_id", "code", "name", "status"], [[portfolioId, tenantId, DEMO.portfolioCode, DEMO.portfolioName, "active"]]);
    await bulk(client, "projects", ["id", "tenant_id", "portfolio_id", "code", "name", "project_type", "lifecycle_stage", "status", "currency", "contract_value", "original_budget", "current_budget", "planned_start_at", "planned_finish_at", "forecast_finish_at"], [
      [projectId, tenantId, portfolioId, DEMO.projectCode, DEMO.projectName, "villas", "execution", "active", DEMO.currency, MONEY.contractValue, MONEY.bac, MONEY.bac, T0, addDays(T0, 500), addDays(T0, 530)],
      [project2Id, tenantId, portfolioId, DEMO.secondProjectCode, DEMO.secondProjectName, "building", "execution", "active", DEMO.currency, 28_000_000, 24_000_000, 24_000_000, addDays(T0, 20), addDays(T0, 330), addDays(T0, 330)],
    ]);
    // work breakdown (ten packages) with its budget lines, BOQ and the schedule activities the planned value is read from
    const wbsRows: unknown[][] = []; const budgetRows: unknown[][] = []; const boqRows: unknown[][] = []; const activityRows: unknown[][] = [];
    const schedule: Record<string, [number, number]> = { "1": [0, 120], "2": [10, 170], "3": [30, 270], "4": [60, 330], "5": [90, 410], "6": [150, 440], "7": [180, 470], "8": [100, 450], "9": [100, 450], "10": [200, 490] };
    const scheduleScale = { k: 1 };
    const activityCodeOf = new Map<string, string>();
    for (const item of WBS_ITEMS) {
      const value = wbsValue(item.code);
      wbsRows.push([wbsIds.get(item.code), tenantId, projectId, item.code, item.name, value]);
      budgetRows.push([randomUUID(), tenantId, projectId, wbsIds.get(item.code), `CC-${pad(Number(item.code), 2)}`, value, value]);
      boqRows.push([randomUUID(), tenantId, projectId, wbsIds.get(item.code), `BOQ-${pad(Number(item.code), 2)}`, `${item.name} — لكل الفلل (عرض)`, "lot", 500, round2(value * (MONEY.contractValue / MONEY.bac) / 500), round2(value * (MONEY.contractValue / MONEY.bac)), "SAR", owner.id]);
      activityCodeOf.set(item.code, `SCH-${pad(Number(item.code), 2)}`);
    }
    // planned value at "today" should be earned value / SPI: scale the schedule's finish dates until it is
    const targetPv = evAt(PROJECT_DAYS, cells) / MONEY.targetSpi;
    const pvAt = (n: number, k: number) => WBS_ITEMS.reduce((sum, item) => { const [s, f0] = schedule[item.code]; const f = s + (f0 - s) * k; return sum + wbsValue(item.code) * Math.max(0, Math.min(1, (n - s) / (f - s))); }, 0);
    let kLo = 0.3; let kHi = 3;
    for (let i = 0; i < 40; i++) { const mid = (kLo + kHi) / 2; if (pvAt(PROJECT_DAYS, mid) > targetPv) kLo = mid; else kHi = mid; }
    scheduleScale.k = (kLo + kHi) / 2;
    for (const item of WBS_ITEMS) {
      const [s, f0] = schedule[item.code]; const f = s + (f0 - s) * scheduleScale.k;
      activityRows.push([randomUUID(), tenantId, projectId, wbsIds.get(item.code), activityCodeOf.get(item.code), `${item.name} (الجدول)`, "in_progress", wbsValue(item.code), day(s), day(f)]);
    }
    await bulk(client, "wbs_items", ["id", "tenant_id", "project_id", "code", "name", "planned_value"], wbsRows);
    await bulk(client, "budget_lines", ["id", "tenant_id", "project_id", "wbs_item_id", "cost_code", "original_amount", "current_amount"], budgetRows);
    await bulk(client, "boq_items", ["id", "tenant_id", "project_id", "wbs_item_id", "code", "description", "unit_of_measure", "quantity", "unit_rate", "total_amount", "currency", "created_by_user_id"], boqRows);
    await bulk(client, "activities", ["id", "tenant_id", "project_id", "wbs_item_id", "code", "name", "status", "planned_value", "planned_start_at", "planned_finish_at"], activityRows);

    // the second, smaller project of the portfolio
    const wbs2 = [["1", "الأعمال الإنشائية", 11_000_000], ["2", "الأعمال المعمارية", 7_000_000], ["3", "الأعمال الكهروميكانيكية", 6_000_000]] as const;
    const wbs2Ids = wbs2.map(() => randomUUID());
    await bulk(client, "wbs_items", ["id", "tenant_id", "project_id", "code", "name", "planned_value"], wbs2.map((item, index) => [wbs2Ids[index], tenantId, project2Id, item[0], item[1], item[2]]));
    await bulk(client, "budget_lines", ["id", "tenant_id", "project_id", "wbs_item_id", "cost_code", "original_amount", "current_amount"], wbs2.map((item, index) => [randomUUID(), tenantId, project2Id, wbs2Ids[index], `CC2-${item[0]}`, item[2], item[2]]));
    await bulk(client, "activities", ["id", "tenant_id", "project_id", "wbs_item_id", "code", "name", "status", "planned_value", "planned_start_at", "planned_finish_at"], wbs2.map((item, index) => [randomUUID(), tenantId, project2Id, wbs2Ids[index], `SCH2-${item[0]}`, `${item[1]} (الجدول)`, "in_progress", item[2], day(20 + index * 20), day(250 + index * 40)]));
    const completed2 = [8, 4, 1]; const progress2 = completed2.map(n => n / 24);
    for (const checkpoint of [30, 62, 92]) {
      await bulk(client, "progress_entries", ["id", "tenant_id", "project_id", "wbs_item_id", "progress_percent", "status", "measured_at"], wbs2.map((item, index) => [randomUUID(), tenantId, project2Id, wbs2Ids[index], round2(100 * progress2[index] * (checkpoint / 92)), "submitted", day(checkpoint)]));
    }
    let ac2 = 0;
    for (const checkpoint of [30, 62, 92]) for (const [index, item] of wbs2.entries()) { const amount = round2(item[2] * progress2[index] * 0.33 * 1.04 * (1 + random() * 0.04)); ac2 += amount; await client.query("INSERT INTO cost_entries (id, tenant_id, project_id, wbs_item_id, amount, entry_type, status, incurred_at, category) VALUES ($1,$2,$3,$4,$5,'actual','posted',$6,'subcontract')", [randomUUID(), tenantId, project2Id, wbs2Ids[index], amount, day(checkpoint - 3)]); }
    // its unit register: one block of 24 units and the three activities, so the portfolio level can read its progress the same way (the cells give exactly the percentages above)
    {
      const zone2 = randomUUID(); const block2 = randomUUID(); const group2 = randomUUID();
      const units2 = Array.from({ length: 24 }, () => randomUUID()); const stages2 = wbs2.map(() => randomUUID()); const defs2 = wbs2.map(() => randomUUID());
      await bulk(client, "pmc_zones", ["id", "tenant_id", "project_id", "code", "name"], [[zone2, tenantId, project2Id, "Z1", "المنطقة الوحيدة"]]);
      await bulk(client, "pmc_blocks", ["id", "tenant_id", "project_id", "zone_id", "code", "name"], [[block2, tenantId, project2Id, zone2, "B01", "المبنى"]]);
      await bulk(client, "pmc_units", ["id", "tenant_id", "project_id", "block_id", "unit_number", "model_code", "unit_weight"], units2.map((id, index) => [id, tenantId, project2Id, block2, index + 1, "A", 1]));
      await bulk(client, "pmc_activity_groups", ["id", "tenant_id", "project_id", "code", "name"], [[group2, tenantId, project2Id, "ALL", "كل الأعمال"]]);
      await bulk(client, "pmc_activity_stages", ["id", "tenant_id", "project_id", "group_id", "code", "name"], wbs2.map((item, index) => [stages2[index], tenantId, project2Id, group2, `S${item[0]}`, item[1]]));
      await bulk(client, "pmc_activity_definitions", ["id", "tenant_id", "project_id", "group_id", "stage_id", "wbs_item_id", "model_code", "code", "name", "weight_percent"], wbs2.map((item, index) => [defs2[index], tenantId, project2Id, group2, stages2[index], wbs2Ids[index], "A", `S${item[0]}`, item[1], [50, 30, 20][index]]));
      const cells2: unknown[][] = [];
      completed2.forEach((done, index) => { for (let u = 0; u < Math.min(24, done + 3); u++) cells2.push([randomUUID(), tenantId, project2Id, units2[u], defs2[index], u < done ? "COMPLETE" : "IN_PROGRESS", people0.pm, people0.pm, day(30 + u * 2)]); });
      await bulk(client, "pmc_unit_activity_progress", ["id", "tenant_id", "project_id", "unit_id", "activity_definition_id", "status", "assigned_user_id", "last_changed_by_user_id", "last_changed_at"], cells2);
    }
    await bulk(client, "contracts", ["id", "tenant_id", "project_id", "code", "title", "counterparty", "counterparty_kind", "contract_value", "currency", "status", "start_at", "end_at"], [[randomUUID(), tenantId, project2Id, "CT2-CLIENT", "عقد الخدمات المشتركة (عرض)", "العميل — شركة التطوير التجريبية", "client", 28_000_000, "SAR", "active", addDays(T0, 20), addDays(T0, 330)]]);

    // PMC catalogue: zones, blocks, units, groups, stages, activity definitions
    const zoneIds = Array.from({ length: ZONES }, () => randomUUID());
    const blockIds = Array.from({ length: ZONES * BLOCKS_PER_ZONE }, () => randomUUID());
    await bulk(client, "pmc_zones", ["id", "tenant_id", "project_id", "code", "name"], zoneIds.map((id, index) => [id, tenantId, projectId, `Z${index + 1}`, `المنطقة ${zoneName[index]}`]));
    await bulk(client, "pmc_blocks", ["id", "tenant_id", "project_id", "zone_id", "code", "name"], blockIds.map((id, index) => [id, tenantId, projectId, zoneIds[Math.floor(index / BLOCKS_PER_ZONE)], `B${pad(index + 1, 2)}`, `المجموعة ${index + 1}`]));
    await bulk(client, "pmc_units", ["id", "tenant_id", "project_id", "block_id", "unit_number", "model_code", "sale_status", "geometry_json", "unit_weight"],
      unitIds.map((id, index) => [id, tenantId, projectId, blockIds[Math.floor(index / UNITS_PER_BLOCK)], index + 1, modelOf(index), index % 7 === 0 ? "reserved" : index % 3 === 0 ? "sold" : "available", JSON.stringify({ type: "Polygon", coordinates: [unitPolygon(index)] }), 1]));
    await bulk(client, "pmc_activity_groups", ["id", "tenant_id", "project_id", "code", "name"], GROUPS.map(item => [groupIds.get(item.code), tenantId, projectId, item.code, item.name]));
    await bulk(client, "pmc_activity_stages", ["id", "tenant_id", "project_id", "group_id", "code", "name"], ACTIVITIES.map(item => [stageIds.get(item.code), tenantId, projectId, groupIds.get(item.group), item.code, item.name]));
    await bulk(client, "pmc_activity_definitions", ["id", "tenant_id", "project_id", "group_id", "stage_id", "wbs_item_id", "model_code", "code", "name", "weight_percent"],
      definitions.map(item => { const activity = ACTIVITIES.find(a => a.code === item.code)!; return [item.id, tenantId, projectId, groupIds.get(activity.group), stageIds.get(activity.code), item.wbsItemId, item.modelCode, item.code, activity.name, item.weightPercent]; }));

    // the cells: only those that have started, with the history that got them there (every change dated)
    const cellRows: unknown[][] = []; const historyRows: unknown[][] = [];
    const cellIdOf = new Map<string, string>();
    const staff = [people.get("site1")!, people.get("site2")!, people.get("pm")!, people.get("qc")!];
    for (const cell of cells) {
      const status = stateAt(cell, PROJECT_DAYS);
      if (status === "NOT_STARTED") continue;
      const id = randomUUID(); cellIdOf.set(`${cell.unit}:${cell.activity}`, id);
      const who = staff[(cell.unit + cell.activity.charCodeAt(0)) % 2];
      const lastAt = status === "COMPLETE" ? day(cell.finish + 2) : status === "UNDER_REVIEW" ? day(cell.finish) : day(cell.start);
      cellRows.push([id, tenantId, projectId, unitIds[cell.unit], defId(modelOf(cell.unit), cell.activity), status, who.id, who.id, lastAt]);
      historyRows.push([randomUUID(), tenantId, projectId, id, "NOT_STARTED", "IN_PROGRESS", who.id, day(cell.start), "بدء العمل"]);
      if (status !== "IN_PROGRESS") historyRows.push([randomUUID(), tenantId, projectId, id, "IN_PROGRESS", "UNDER_REVIEW", who.id, day(cell.finish), "اكتمل التنفيذ وطُلب الفحص"]);
      if (status === "COMPLETE") historyRows.push([randomUUID(), tenantId, projectId, id, "UNDER_REVIEW", "COMPLETE", staff[3].id, day(cell.finish + 2), "قبول الاستشاري"]);
    }
    await bulk(client, "pmc_unit_activity_progress", ["id", "tenant_id", "project_id", "unit_id", "activity_definition_id", "status", "assigned_user_id", "last_changed_by_user_id", "last_changed_at"], cellRows);
    await bulk(client, "pmc_unit_activity_history", ["id", "tenant_id", "project_id", "unit_activity_progress_id", "from_status", "to_status", "changed_by_user_id", "changed_at", "note"], historyRows);
    log(`${cellRows.length} cells, ${historyRows.length} history rows`);

    // progress entries per WBS item at the three month-end checkpoints, computed from the cells as they stood (so "today" equals what the bridge computes now)
    const checkpoints = [31, 62, PROJECT_DAYS];
    const progressRows: unknown[][] = [];
    for (const checkpoint of checkpoints) {
      const progress = progressByWbs(cells, checkpoint, definitions, unitIds, modelOf, factors);
      for (const item of WBS_ITEMS) { const value = progress.get(wbsIds.get(item.code)!); if (value && value > 0) progressRows.push([randomUUID(), tenantId, projectId, wbsIds.get(item.code), value, "submitted", day(checkpoint)]); }
    }
    await bulk(client, "progress_entries", ["id", "tenant_id", "project_id", "wbs_item_id", "progress_percent", "status", "measured_at"], progressRows);

    // suppliers, contracts, commitments, change orders, invoices
    const supplierIds = [randomUUID(), randomUUID(), randomUUID()];
    await bulk(client, "suppliers", ["id", "tenant_id", "code", "legal_name", "contact_name", "contact_email", "active", "created_by_user_id"], [
      [supplierIds[0], tenantId, "SUP-001", "مورد الخرسانة (عرض)", "جهة اتصال (عرض)", "supplier.concrete@show.example.test", true, owner.id],
      [supplierIds[1], tenantId, "SUP-002", "مقاول الأعمال الكهروميكانيكية (عرض)", "جهة اتصال (عرض)", "supplier.mep@show.example.test", true, owner.id],
      [supplierIds[2], tenantId, "SUP-003", "مقاول التشطيبات (عرض)", "جهة اتصال (عرض)", "supplier.finishing@show.example.test", true, owner.id],
    ]);
    const clientContract = randomUUID(); const contractIds = [randomUUID(), randomUUID(), randomUUID()];
    await bulk(client, "contracts", ["id", "tenant_id", "project_id", "code", "title", "counterparty", "counterparty_kind", "supplier_id", "contract_value", "currency", "status", "start_at", "end_at"], [
      [clientContract, tenantId, projectId, "CT-CLIENT", "عقد مشروع فلل العرض مع المالك", "العميل — شركة التطوير التجريبية", "client", null, MONEY.contractValue, "SAR", "active", T0, addDays(T0, 500)],
      [contractIds[0], tenantId, projectId, "CT-SUP-001", "توريد الخرسانة الجاهزة", "مورد الخرسانة (عرض)", "supplier", supplierIds[0], 62_000_000, "SAR", "active", addDays(T0, 5), addDays(T0, 420)],
      [contractIds[1], tenantId, projectId, "CT-SUP-002", "الأعمال الكهروميكانيكية للفلل", "مقاول الأعمال الكهروميكانيكية (عرض)", "supplier", supplierIds[1], 71_000_000, "SAR", "active", addDays(T0, 60), addDays(T0, 470)],
      [contractIds[2], tenantId, projectId, "CT-SUP-003", "أعمال التشطيبات", "مقاول التشطيبات (عرض)", "supplier", supplierIds[2], 96_000_000, "SAR", "active", addDays(T0, 120), addDays(T0, 490)],
    ]);
    await bulk(client, "commitments", ["id", "tenant_id", "project_id", "contract_id", "code", "description", "amount", "currency", "status", "committed_at"], contractIds.map((id, index) => [randomUUID(), tenantId, projectId, id, `CM-${index + 1}`, `التزام ${["الخرسانة", "الكهروميكانيكا", "التشطيبات"][index]} (عرض)`, [62_000_000, 71_000_000, 96_000_000][index], "SAR", "committed", addDays(T0, [5, 60, 120][index])]));
    await bulk(client, "change_requests", ["id", "tenant_id", "project_id", "change_number", "title", "description", "impact_schedule_days", "impact_cost", "contract_value_impact", "currency", "status", "created_by_user_id", "submitted_at", "reviewed_by_user_id", "reviewed_at"], [
      [randomUUID(), tenantId, projectId, "CO-001", "إضافة مظلات مواقف السيارات", "طلب المالك إضافة مظلات لكل الفلل (عرض)", 12, 6_800_000, MONEY.approvedChange, "SAR", "approved", people.get("pm")!.id, day(40), owner.id, day(55)],
      [randomUUID(), tenantId, projectId, "CO-002", "تغيير مواصفات البلاط", "تحسين مواصفات بلاط الصالات (عرض)", 5, 3_100_000, MONEY.pendingChange, "SAR", "under_review", people.get("pm")!.id, day(80), null, null],
    ]);
    const invoice = (n: number, at: number, amount: number, status: string, paidAt: number | null) => [randomUUID(), tenantId, projectId, `INV-${pad(n)}`, day(at), "العميل — شركة التطوير التجريبية", amount, round2(amount * 0.15), round2(amount * 1.15), "SAR", status, paidAt === null ? null : day(paidAt), owner.id];
    await bulk(client, "project_commercial_invoices", ["id", "tenant_id", "project_id", "invoice_number", "invoice_date", "client_name", "amount", "vat_amount", "total_amount", "currency", "status", "paid_at", "created_by_user_id"], [
      invoice(1, 8, 45_000_000, "paid", 20), invoice(2, 45, 11_400_000, "paid", 62), invoice(3, 75, 15_300_000, "issued", null),
    ]);

    // ---------------------------------------------------------------------------------------------------------- 3. quality: inspections, NCRs; submittals
    const stepsOrder = ["CONFIGURATIONS", "MANAGER_APPROVAL", "TECHNICAL_ASSISTANT", "WAITING_CONSULTANT", "RESULT_RECEIVING"];
    const inspections: unknown[][] = []; const inspectionUnits: unknown[][] = []; const inspectionSteps: unknown[][] = [];
    const inspectedActivities = ["FND", "COL", "BLK", "PLS", "ELR", "PLR", "TIL"];
    let inspectionNumber = 0;
    const codes = ["A", "A", "A", "B", "B", "C", "UR", null];
    for (const code of inspectedActivities) {
      const finished = cells.filter(cell => cell.activity === code && stateAt(cell, PROJECT_DAYS) !== "NOT_STARTED");
      for (let at = 0; at < finished.length; at += 12) {
        const group = finished.slice(at, at + 12);
        const requestedAt = day(Math.max(...group.map(cell => cell.finish)) + 0.5);
        if (requestedAt > now) continue;
        const id = randomUUID(); inspectionNumber++;
        const response = codes[(inspectionNumber * 5 + code.charCodeAt(0)) % codes.length];
        const answered = response !== null && requestedAt < addDays(now, -2);
        inspections.push([id, tenantId, projectId, `IR-${pad(inspectionNumber, 4)}`, defId("A", code), JSON.stringify(group.map(cell => cell.unit + 1)), "المقاول (عرض)", CONSULTANTS[inspectionNumber % 3], answered ? response : null, requestedAt, answered ? null : "بانتظار نتيجة الاستشاري"]);
        for (const cell of group) inspectionUnits.push([randomUUID(), tenantId, projectId, id, unitIds[cell.unit]]);
        stepsOrder.forEach((step, index) => inspectionSteps.push([randomUUID(), tenantId, projectId, id, step, index + 1, index < 3 ? "فريق المقاول (عرض)" : CONSULTANTS[inspectionNumber % 3], answered || index < 3 ? "complete" : index === 3 ? "in_progress" : "pending", answered || index < 3 ? addDays(requestedAt, index * 0.6) : null]));
      }
    }
    await bulk(client, "pmc_inspection_requests", ["id", "tenant_id", "project_id", "request_code", "activity_definition_id", "unit_ids_json", "contractor_label", "consultant_label", "response_code", "requested_at", "notes"], inspections);
    await bulk(client, "pmc_inspection_request_units", ["id", "tenant_id", "project_id", "inspection_request_id", "unit_id"], inspectionUnits);
    await bulk(client, "pmc_inspection_steps", ["id", "tenant_id", "project_id", "inspection_request_id", "step_code", "step_order", "holder_label", "status", "completed_at"], inspectionSteps);
    log(`${inspections.length} inspection requests`);

    const ncrTitles = ["تشقق في بلاطة الأرضية", "انحراف في مستوى الأساسات", "نقص في تغطية حديد التسليح", "تسريب في تمديدات المياه", "عيب في لياسة الجدران", "عدم مطابقة بلاط الصالة", "تباين في لون الدهان", "ثقوب غير مطابقة للمخطط الكهربائي", "تأخر معالجة الخرسانة", "عيب في تركيب النوافذ", "تعشيش في عمود", "ارتفاع غير مطابق للبلوك"];
    const ncrStatuses = ["open", "open", "under_investigation", "corrective_action", "verification", "closed", "closed", "closed", "closed", "open", "closed", "corrective_action"];
    const ncrActivity = ["SLB", "FND", "COL", "PLR", "PLS", "TIL", "PNT", "ELR", "COL", "DWS", "COL", "BLK"];
    const ncrRows = ncrTitles.map((title, index) => {
      // the activity named for this defect, or — when no villa has reached it yet — the nearest one that has been worked on
      const startedOf = (code: string) => cells.filter(item => item.activity === code && stateAt(item, PROJECT_DAYS) !== "NOT_STARTED");
      const activity = startedOf(ncrActivity[index]).length ? ncrActivity[index] : "BLK"; const pool = startedOf(activity); const cell = pool.find(item => item.unit % 12 === index % 12) ?? pool[index % pool.length];
      return [randomUUID(), tenantId, projectId, `NCR-${pad(index + 1)}`, title, `${title} — مُسجَّل أثناء الفحص (بيانات عرض)`, ncrStatuses[index], unitIds[cell.unit], defId(modelOf(cell.unit), activity), addDays(now, index < 5 ? 6 - index * 3 : -10), staff[2].id, day(Math.max(3, cell.finish - 1))];
    });
    await bulk(client, "ncrs", ["id", "tenant_id", "project_id", "ncr_number", "title", "description", "status", "pmc_unit_id", "pmc_activity_definition_id", "due_at", "created_by_user_id", "created_at"], ncrRows);

    // consultant submittals: four reply codes, aged and overdue ones included
    const subTypes = ["shop_drawing", "material_approval", "method_statement", "sample"];
    const subNames: Record<string, string[]> = { shop_drawing: ["مخططات ورشة الأساسات", "مخططات ورشة الهيكل", "مخططات ورشة الواجهات", "مخططات ورشة الكهرباء", "مخططات ورشة السباكة"], material_approval: ["اعتماد الخرسانة الجاهزة", "اعتماد حديد التسليح", "اعتماد البلوك", "اعتماد البلاط", "اعتماد الدهانات", "اعتماد الكابلات"], method_statement: ["طريقة صب الأسقف", "طريقة معالجة الخرسانة", "طريقة تركيب الواجهات"], sample: ["عينة بلاط الصالة", "عينة لون الواجهة", "عينة الأبواب الداخلية"] };
    const replyCodeSequence = ["A", "A", "B", "A", "C", "B", "A", "D", "B", "A", "C", "A", "B", "D", "A", "B", "A", "C", "A", "B", "A", "B", "D", "A", "A", "C", "B", "A"];
    const submittalRows: unknown[][] = []; let sn = 0;
    for (const round of [1, 2, 3]) for (const type of subTypes) for (const base of subNames[type]) {
      const title = round === 1 ? base : `${base} — مرحلة ${round}`;
      sn++;
      const sentAt = day(4 + sn * 1.7); const dueAt = addDays(sentAt, 14);
      const replied = sn <= 34; const awaiting = !replied && sn <= 46;
      const code = replied ? replyCodeSequence[(sn - 1) % replyCodeSequence.length] : null;
      const repliedAt = replied ? addDays(sentAt, 6 + (sn % 11)) : null;
      submittalRows.push([randomUUID(), tenantId, projectId, type, `${{ shop_drawing: "SD", material_approval: "MA", method_statement: "MS", sample: "SM" }[type]}-${pad(sn)}`, 0, title, replied ? "replied" : awaiting ? "sent" : "draft",
        replied || awaiting ? sentAt : null, replied || awaiting ? dueAt : null, repliedAt, code, replied ? (code === "A" ? "معتمد" : code === "B" ? "معتمد مع ملاحظات" : code === "C" ? "أعد التقديم بعد التعديل" : "مرفوض") : null,
        CONSULTANTS[sn % 3], type === "shop_drawing" ? ["architectural", "technical"][sn % 2] : null, people.get("coord")!.id, replied || awaiting ? people.get("coord")!.id : null, replied ? people.get("coord")!.id : null, sentAt]);
    }
    await bulk(client, "consultant_submittals", ["id", "tenant_id", "project_id", "submittal_type", "submittal_number", "revision", "title", "status", "sent_at", "due_at", "replied_at", "reply_code", "reply_note", "consultant", "discipline", "created_by_user_id", "sent_by_user_id", "replied_by_user_id", "created_at"], submittalRows);
    const replyCodes = [["A", "معتمد", "Approved", true], ["B", "معتمد مع ملاحظات", "Approved as noted", true], ["C", "أعد التقديم", "Revise and resubmit", false], ["D", "مرفوض", "Rejected", false]] as const;
    await bulk(client, "submittal_reply_codes", ["id", "tenant_id", "code", "label_ar", "label_en", "approved", "sort_order", "active"], replyCodes.map((item, index) => [randomUUID(), tenantId, item[0], item[1], item[2], item[3], index, true]));

    // daily reports: every working day (Sunday to Thursday) of the last 92 days, by the two site engineers; the last three still wait for the manager
    const reportRows: unknown[][] = []; const lineRows: unknown[][] = [];
    const weather = ["صافٍ", "غائم جزئيًا", "حار", "مغبر", "صافٍ"]; let reports = 0;
    for (let back = PROJECT_DAYS - 3; back >= 0; back--) {
      const date = addDays(now, -back); const dow = date.getUTCDay(); if (dow === 5 || dow === 6) continue;
      const id = randomUUID(); reports++;
      const status = back === 0 ? "draft" : back <= 2 ? "submitted" : reports % 29 === 0 ? "rejected" : "approved";
      const author = staff[reports % 2];
      reportRows.push([id, tenantId, projectId, ymd(date), weather[reports % weather.length], 28 + (reports % 14), `تقرير يومي (عرض): سير الأعمال وفق الخطة، العمالة ${60 + (reports % 40)} فردًا.`, reports % 6 === 0 ? "تأخر توريد الحديد لساعتين" : null, status, author.id, status === "draft" ? null : addDays(date, 0.3), status === "approved" || status === "rejected" ? staff[2].id : null, status === "approved" || status === "rejected" ? addDays(date, 1) : null, status === "rejected" ? "أعد التقرير بتفاصيل الكميات" : null]);
      const active = cells.filter(cell => stateAt(cell, PROJECT_DAYS - back) === "IN_PROGRESS");
      for (let i = 0; i < 3 && active.length; i++) { const cell = active[(reports * 7 + i * 13) % active.length]; lineRows.push([randomUUID(), tenantId, projectId, id, "work", defId(modelOf(cell.unit), cell.activity), unitIds[cell.unit], null, 1, null, "تنفيذ حسب البرنامج", "IN_PROGRESS", i]); }
      lineRows.push([randomUUID(), tenantId, projectId, id, "labour", null, null, "عمال (عرض)", 40 + (reports % 25), 8, null, null, 4]);
      lineRows.push([randomUUID(), tenantId, projectId, id, "equipment", null, null, "حفارة ومعدات (عرض)", 2 + (reports % 3), 8, null, null, 5]);
    }
    await bulk(client, "site_daily_reports", ["id", "tenant_id", "project_id", "report_date", "weather", "temperature_c", "summary", "obstacles", "status", "prepared_by_user_id", "submitted_at", "reviewed_by_user_id", "reviewed_at", "review_note"], reportRows);
    await bulk(client, "site_daily_report_lines", ["id", "tenant_id", "project_id", "report_id", "line_type", "pmc_activity_definition_id", "pmc_unit_id", "label", "quantity", "hours", "description", "reported_status", "sort_order"], lineRows);
    log(`${reportRows.length} daily reports, ${submittalRows.length} submittals, ${ncrRows.length} NCRs`);

    // ---------------------------------------------------------------------------------------------------------- 4. the master plan: one drawing, the blocks and every villa on it
    const planId = randomUUID(); const versionId = randomUUID();
    await bulk(client, "master_plans", ["id", "tenant_id", "project_id", "code", "title", "status", "created_by_user_id"], [[planId, tenantId, projectId, "MP-DEMO", "الماستر بلان التجريبي (عرض)", "active", owner.id]]);
    await bulk(client, "master_plan_versions", ["id", "tenant_id", "project_id", "master_plan_id", "version_number", "version_kind", "description", "source_file_name", "rotation_degrees", "map_width_meters", "map_height_meters", "uploaded_by_user_id"], [[versionId, tenantId, projectId, planId, 1, "original", "مخطط تجريبي بصيغة DXF: 25 مجموعة و500 فيلا", "master-plan-demo.dxf", 0, 500, 500, owner.id]]);
    const blockEntityIds = blockIds.map(() => randomUUID());
    const cellAt = new Map(cells.map(c => [`${c.unit}:${c.activity}`, c] as const));
    const unitPercent = (unit: number) => { const weights = ACTIVITIES.reduce((s, a) => s + a.weight, 0); return round2(100 * ACTIVITIES.reduce((s, a) => s + (stateAt(cellAt.get(`${unit}:${a.code}`)!, PROJECT_DAYS) === "COMPLETE" ? a.weight : 0), 0) / weights); };
    const entityRows: unknown[][] = blockIds.map((_, index) => {
      const col = index % 5; const row = Math.floor(index / 5); const blockUnits = Array.from({ length: UNITS_PER_BLOCK }, (__, k) => index * UNITS_PER_BLOCK + k);
      const percent = round2(blockUnits.reduce((s, u) => s + unitPercent(u), 0) / UNITS_PER_BLOCK);
      return [blockEntityIds[index], tenantId, projectId, versionId, null, `B${pad(index + 1, 2)}`, `المجموعة ${index + 1}`, "block", JSON.stringify({ x: col * 20 + 0.4, y: row * 20 + 0.4, width: 19.2, height: 19.2 }), percent === 0 ? "not_started" : percent >= 100 ? "completed" : "in_progress", percent];
    });
    await bulk(client, "master_plan_spatial_entities", ["id", "tenant_id", "project_id", "master_plan_version_id", "parent_entity_id", "code", "name", "entity_type", "geometry", "status", "progress_percent"], entityRows);
    const unitEntities: unknown[][] = unitIds.map((_, index) => {
      const ring = unitPolygon(index); const percent = unitPercent(index);
      return [randomUUID(), tenantId, projectId, versionId, blockEntityIds[Math.floor(index / UNITS_PER_BLOCK)], `V${pad(index + 1)}`, `الفيلا ${index + 1}`, "unit", JSON.stringify({ x: round2(ring[0][0] * 100), y: round2(ring[0][1] * 100), width: round2((ring[1][0] - ring[0][0]) * 100), height: round2((ring[2][1] - ring[0][1]) * 100) }), percent >= 100 ? "completed" : percent > 0 ? "in_progress" : "not_started", percent];
    });
    await bulk(client, "master_plan_spatial_entities", ["id", "tenant_id", "project_id", "master_plan_version_id", "parent_entity_id", "code", "name", "entity_type", "geometry", "status", "progress_percent"], unitEntities);
    await client.query("COMMIT");
    log("structure committed");

    // ---------------------------------------------------------------------------------------------------------- 5. the people get their levels (through the platform's own invitation flow)
    const administration = await ownerCaller.tenant.administration({ tenantId });
    const roleIds = new Map(administration.roles.map(role => [role.code, role.id]));
    for (const person of DEMO_PEOPLE) {
      const user = people.get(person.key)!;
      const invitation = await ownerCaller.tenant.createInvitation({ tenantId, email: person.email, roleId: roleIds.get(person.role)!, scopeType: person.scope, scopeId: person.scope === "project" ? projectId : person.scope === "portfolio" ? portfolioId : undefined });
      await callerFor(user).tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    }
    // the person-in-charge of the second project is the portfolio lead too
    log("people assigned");

    // ---------------------------------------------------------------------------------------------------------- 6. warehouse: materials, receipts, issues to unit cells (each one a stock movement + a posted cost entry)
    const catalogue: Array<{ code: string; description: string; unit: string; category: string; price: number; qty: number; issue: { activity: string; per: number }; reorder?: number }> = [
      { code: "CEM-50", description: "أسمنت 50 كجم (عرض)", unit: "bag", category: "cement", price: 21.5, qty: 90_000, issue: { activity: "COL", per: 160 }, reorder: 12_000 },
      { code: "STL-12", description: "حديد تسليح 12 مم (عرض)", unit: "ton", category: "steel", price: 2_850, qty: 1_400, issue: { activity: "FND", per: 2.4 }, reorder: 1_200 },
      { code: "STL-16", description: "حديد تسليح 16 مم (عرض)", unit: "ton", category: "steel", price: 2_930, qty: 1_100, issue: { activity: "COL", per: 3.1 } },
      { code: "SND-01", description: "رمل مغسول (عرض)", unit: "m3", category: "aggregate", price: 44, qty: 40_000, issue: { activity: "SLB", per: 22 } },
      { code: "BLK-20", description: "بلوك 20 سم (عرض)", unit: "piece", category: "block", price: 3.15, qty: 700_000, issue: { activity: "BLK", per: 1_900 }, reorder: 600_000 },
      { code: "TIL-60", description: "بلاط 60×60 (عرض)", unit: "m2", category: "tiles", price: 37, qty: 30_000, issue: { activity: "TIL", per: 120 } },
      { code: "PNT-18", description: "دهان داخلي 18 لتر (عرض)", unit: "bucket", category: "paint", price: 185, qty: 6_000, issue: { activity: "PNT", per: 14 }, reorder: 5_000 },
      { code: "CBL-04", description: "كابل 4 مم (عرض)", unit: "roll", category: "electrical", price: 235, qty: 4_000, issue: { activity: "ELR", per: 6 } },
      { code: "PIP-25", description: "أنبوب PPR 25 مم (عرض)", unit: "m", category: "plumbing", price: 8.6, qty: 90_000, issue: { activity: "PLR", per: 160 } },
    ];
    const keeper = callerFor(people.get("keeper")!);
    const materialIds = new Map<string, string>();
    for (const item of catalogue) await ownerCaller.materials.createMaster({ tenantId, code: item.code, description: item.description, unitOfMeasure: item.unit, category: item.category });
    const masterRows = (await client.query("SELECT id, code FROM material_masters WHERE tenant_id = $1", [tenantId])).rows;
    for (const row of masterRows) materialIds.set(row.code, row.id);
    await ownerCaller.warehouses.create({ tenantId, projectId, code: "WH-MAIN", name: "المستودع الرئيسي (عرض)", locationDescription: "مدخل الموقع الشمالي" });
    await ownerCaller.warehouses.create({ tenantId, projectId, code: "WH-STEEL", name: "ساحة الحديد (عرض)", locationDescription: "الجهة الشرقية" });
    const warehouses = (await client.query("SELECT id, code FROM project_warehouses WHERE tenant_id = $1", [tenantId])).rows;
    const mainWarehouse = warehouses.find(row => row.code === "WH-MAIN").id as string; const steelYard = warehouses.find(row => row.code === "WH-STEEL").id as string;
    // three deliveries per material over the three months (the price drifts a little), then the issues, newest cells last
    for (const item of catalogue) {
      const warehouseId = item.category === "steel" ? steelYard : mainWarehouse;
      for (const [index, at] of [3, 33, 63].entries()) await keeper.warehouses.recordInventory({ tenantId, projectId, warehouseId, materialId: materialIds.get(item.code)!, transactionType: "receipt", quantityDelta: Math.round(item.qty / 3), unitCost: round2(item.price * (1 + index * 0.012)), referenceNumber: `GRN-${item.code}-${index + 1}`, occurredAt: day(at) });
      if (item.reorder) await ownerCaller.materials.saveProjectOverride({ tenantId, projectId, materialId: materialIds.get(item.code)!, reorderLevel: item.reorder, active: true });
    }
    let issues = 0;
    for (const item of catalogue) {
      const candidates = cells.filter(cell => cell.activity === item.issue.activity && stateAt(cell, PROJECT_DAYS) !== "NOT_STARTED" && cell.unit % 3 === 0).slice(0, 18);
      for (const cell of candidates) {
        const warehouseId = item.category === "steel" ? steelYard : mainWarehouse;
        await keeper.warehouses.issueToCell({ tenantId, projectId, warehouseId, materialId: materialIds.get(item.code)!, pmcUnitId: unitIds[cell.unit], pmcActivityDefinitionId: defId(modelOf(cell.unit), cell.activity), issuedQuantity: round2(item.issue.per * 6 * (0.9 + random() * 0.2)), issuedAt: day(Math.min(PROJECT_DAYS - 0.2, cell.start + 1 + random() * (cell.finish - cell.start))), referenceNumber: `MI-${pad(++issues, 4)}` });
      }
    }
    log(`${issues} material issues through the warehouse`);

    // ---------------------------------------------------------------------------------------------------------- 7. actual cost: what the issues did not cover, so cost efficiency stands at the target
    await client.query("BEGIN");
    const progressNowByWbs = progressByWbs(cells, PROJECT_DAYS, definitions, unitIds, modelOf, factors);
    const evNow = WBS_ITEMS.reduce((s, i) => s + wbsValue(i.code) * ((progressNowByWbs.get(wbsIds.get(i.code)!) ?? 0) / 100), 0);
    const acTarget = evNow / MONEY.targetCpi;
    const acSoFar = Number((await client.query("SELECT COALESCE(SUM(amount),0) AS s FROM cost_entries WHERE tenant_id = $1 AND project_id = $2 AND status = 'posted' AND entry_type = 'actual'", [tenantId, projectId])).rows[0].s);
    const remaining = Math.max(0, acTarget - acSoFar);
    const weeks = 13; const categories = ["labour", "subcontract", "materials", "other"] as const; const catShare = [0.24, 0.5, 0.2, 0.06];
    const wbsEv = new Map(WBS_ITEMS.map(item => [item.code, wbsValue(item.code) * ((progressNowByWbs.get(wbsIds.get(item.code)!) ?? 0) / 100)]));
    const evTotal = Array.from(wbsEv.values()).reduce((s, v) => s + v, 0) || 1;
    const costRows: unknown[][] = []; let spent = 0;
    for (const item of WBS_ITEMS) {
      const share = (wbsEv.get(item.code) ?? 0) / evTotal; if (share === 0) continue;
      // later weeks cost more (more crews on site)
      const weekWeights = Array.from({ length: weeks }, (_, week) => week + 3); const weightSum = weekWeights.reduce((s, v) => s + v, 0);
      categories.forEach((category, c) => weekWeights.forEach((w, week) => {
        const amount = round2((remaining * share * catShare[c] * w) / weightSum * (0.94 + random() * 0.12));
        if (amount <= 0) return; spent += amount;
        costRows.push([randomUUID(), tenantId, projectId, wbsIds.get(item.code), amount, "actual", "posted", day(week * 7 + 3 + (c % 3)), category]);
      }));
    }
    await bulk(client, "cost_entries", ["id", "tenant_id", "project_id", "wbs_item_id", "amount", "entry_type", "status", "incurred_at", "category"], costRows.filter(row => (row[7] as Date) <= now));
    await client.query("COMMIT");
    log(`cost: issues ${Math.round(acSoFar).toLocaleString("en-US")} + entries ${Math.round(spent).toLocaleString("en-US")}`);

    // ---------------------------------------------------------------------------------------------------------- 8. earned-value snapshots at the three month-ends, and the project's headline columns
    await client.query("BEGIN");
    const bac = MONEY.bac;
    const snapshots: unknown[][] = [];
    for (const checkpoint of checkpoints) {
      const at = day(checkpoint);
      const progress = progressByWbs(cells, checkpoint, definitions, unitIds, modelOf, factors);
      const ev = WBS_ITEMS.reduce((s, i) => s + wbsValue(i.code) * ((progress.get(wbsIds.get(i.code)!) ?? 0) / 100), 0);
      const ac = Number((await client.query("SELECT COALESCE(SUM(amount),0) AS s FROM cost_entries WHERE tenant_id = $1 AND project_id = $2 AND status = 'posted' AND entry_type = 'actual' AND incurred_at <= $3", [tenantId, projectId, at])).rows[0].s);
      const pv = pvAt(checkpoint, scheduleScale.k);
      const result = calculateEvm({ pv, ev, ac, bac, eacMethod: "ac_plus_remaining" });
      const adjusted = MONEY.contractValue + MONEY.approvedChange;
      const profit = fpac({ adjustedContractValue: adjusted, eac: result.eac });
      snapshots.push([randomUUID(), tenantId, projectId, at, round2(pv), round2(ev), round2(ac), bac, result.cv, result.sv, result.cpi, result.spi, result.eac, result.etc, result.vac, result.tcpi, "ac_plus_remaining", adjusted, profit.fpac]);
    }
    await bulk(client, "evm_snapshots", ["id", "tenant_id", "project_id", "period_at", "pv", "ev", "ac", "bac", "cv", "sv", "cpi", "spi", "eac", "etc", "vac", "tcpi", "eac_method", "adjusted_contract_value", "fpac"], snapshots);
    const acNow = Number((await client.query("SELECT COALESCE(SUM(amount),0) AS s FROM cost_entries WHERE tenant_id = $1 AND project_id = $2 AND status = 'posted' AND entry_type = 'actual'", [tenantId, projectId])).rows[0].s);
    const evmNow = calculateEvm({ pv: pvAt(PROJECT_DAYS, scheduleScale.k), ev: evNow, ac: acNow, bac, eacMethod: "ac_plus_remaining" });
    await client.query("UPDATE projects SET actual_cost = $1, committed_cost = $2, forecast_cost = $3 WHERE id = $4", [round2(acNow), 229_000_000, round2(evmNow.eac), projectId]);
    for (const item of WBS_ITEMS) {
      const progress = progressNowByWbs.get(wbsIds.get(item.code)!) ?? 0;
      const ac = Number((await client.query("SELECT COALESCE(SUM(amount),0) AS s FROM cost_entries WHERE wbs_item_id = $1 AND status = 'posted' AND entry_type = 'actual'", [wbsIds.get(item.code)])).rows[0].s);
      await client.query("UPDATE wbs_items SET progress_percent = $1, earned_value = $2, actual_cost = $3 WHERE id = $4", [progress, round2(wbsValue(item.code) * progress / 100), round2(ac), wbsIds.get(item.code)]);
    }
    await client.query("COMMIT");
    log(`EVM now: PV ${Math.round(evmNow.pv)} EV ${Math.round(evmNow.ev)} AC ${Math.round(evmNow.ac)} CPI ${evmNow.cpi} SPI ${evmNow.spi} EAC ${Math.round(evmNow.eac)}`);

    // the audit trail records that this is the demonstration
    await client.query("INSERT INTO audit_logs (id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,'demo.seeded','company',$2,$4)", [randomUUID(), tenantId, owner.id, JSON.stringify({ units: UNIT_COUNT, reports: reportRows.length, submittals: submittalRows.length, inspections: inspections.length, ncrs: ncrRows.length, issues })]);
    client0.release();
    return { created: true as const, tenantId, projectId, project2Id, portfolioId, owner: { email: ownerEmail }, people: DEMO_PEOPLE.map(person => ({ level: person.level, email: person.email })), evm: { pv: evmNow.pv, ev: evmNow.ev, ac: evmNow.ac, cpi: evmNow.cpi, spi: evmNow.spi, eac: evmNow.eac } };
  } catch (error) {
    await client0.query("ROLLBACK").catch(() => undefined);
    client0.release();
    // a half-built demonstration is worse than none: erase what this run created (its own company only), then report the failure
    await deleteDemoCompany({ ownerEmail, log }).catch(cleanup => log(`cleanup failed: ${cleanup instanceof Error ? cleanup.message : cleanup}`));
    throw error;
  }
}

/** The audited erasure of the demonstration company, and only of it: found by its fixed slug, refused unless its name and marker match, and checked afterwards. */
export async function deleteDemoCompany(options: { ownerEmail: string; log?: Log }) {
  const log: Log = options.log ?? (() => undefined);
  const db = await getDb(); if (!db) throw new Error("DATABASE_URL is required.");
  const client = await (db as unknown as { $client: { connect(): Promise<PoolClient> } }).$client.connect();
  try {
    const { rows } = await client.query("SELECT id, legal_name, status FROM companies WHERE slug = $1", [DEMO.slug]);
    if (!rows.length) return { deleted: false as const, reason: "no demonstration company exists" };
    const company = rows[0];
    if (company.legal_name !== DEMO.legalName || company.status !== "active") throw new Error("Refusing: the company with the demonstration slug does not look like the demonstration company.");
    const marker = (await client.query("SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND action = 'tenant.created'", [company.id])).rowCount;
    const members = (await client.query("SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = $1", [company.id])).rows.map(row => String(row.email ?? ""));
    const allowed = new Set([options.ownerEmail.trim().toLowerCase(), ...DEMO_PEOPLE.map(person => person.email)]);
    const strangers = members.filter(email => !allowed.has(email.toLowerCase()));
    if (!marker || strangers.length) throw new Error(`Refusing: the company has members that are not the demonstration's own (${strangers.length}).`);
    const owner = (await client.query("SELECT id FROM users WHERE email = $1", [options.ownerEmail.trim().toLowerCase()])).rows[0];
    if (!owner) throw new Error("The owner's user was not found.");
    const report = await deleteTenantData({ db, tenantId: company.id, actorUserId: Number(owner.id) });
    log(`erased: ${report.verification}, ${report.rowsDeleted} rows over ${report.tablesChecked} tables, ${report.passes} pass(es), ${report.retained.auditRows} audit rows kept`);
    return { deleted: true as const, verification: report.verification, rowsDeleted: report.rowsDeleted, tablesChecked: report.tablesChecked, remaining: report.remaining, auditRowsKept: report.retained.auditRows, peopleScrubbed: report.people.scrubbed };
  } finally { client.release(); }
}

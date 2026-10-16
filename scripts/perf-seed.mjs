// Synthetic volume for the performance check: one company with 50 projects, 20,000 plan activities and 100,000 stock movements
// (plus the WBS, budgets, costs, progress, warehouses and materials that sit around them). Invented names only.
//
//   . env (DATABASE_URL naming project_os_integration_test)
//   node scripts/migrate.mjs
//   node --import tsx scripts/perf-seed.mjs            # PERF_PROJECTS=50 PERF_ACTIVITIES=20000 PERF_MOVEMENTS=100000
//
// It writes straight to the TEST database in batches of a thousand rows (the point is volume, not the API path), then prints
// the ids that scripts/perf-measure.mjs needs. It never touches a database that is not project_os_integration_test.
import { randomBytes, randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { createTenantForUser, getDb, upsertUser } from "../server/db.ts";
import { users } from "../drizzle/schema.ts";
import { eq } from "drizzle-orm";
import { emailOpenId } from "./lib/roleFixture.mjs";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const PROJECTS = Number(process.env.PERF_PROJECTS ?? 50);
const ACTIVITIES = Number(process.env.PERF_ACTIVITIES ?? 20_000);
const MOVEMENTS = Number(process.env.PERF_MOVEMENTS ?? 100_000);
const WBS_PER_PROJECT = 20;
const MATERIALS = 200;
const run = randomBytes(3).toString("hex");

const db = await getDb();
const email = `perf.owner.${run}@perf.example.test`;
await upsertUser({ openId: emailOpenId(email), name: `Perf owner ${run}`, email, loginMethod: "email" });
const [owner] = await db.select().from(users).where(eq(users.openId, emailOpenId(email))).limit(1);
const { tenantId } = await createTenantForUser({ userId: owner.id, legalName: `Perf Volume Co. ${run}`, slug: `perf-volume-${run}`, packageCode: "ALL-IN-ONE" });
const connection = await mysql.createConnection({ uri: dbUrl.toString(), multipleStatements: false });

async function bulk(table, columns, rows) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    await connection.query(`INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(",")}) VALUES ?`, [chunk]);
  }
}
const started = Date.now();
const day = 86400000;
const now = Date.now();
const projects = [], wbs = [], activities = [], budgets = [], costs = [], progress = [], warehouses = [], txns = [];
const materialRows = Array.from({ length: MATERIALS }, (_, i) => [randomUUID(), tenantId, `MAT-${String(i + 1).padStart(4, "0")}`, `Material ${i + 1}`, i % 2 ? "bag" : "ton", ["concrete", "steel", "finish", "mep"][i % 4], owner.id]);
const projectIds = [];
for (let p = 0; p < PROJECTS; p++) {
  const id = randomUUID(); projectIds.push(id);
  projects.push([id, tenantId, `P-${String(p + 1).padStart(3, "0")}`, `Perf Project ${p + 1}`, "residential", "execution", "active", "SAR", 1_000_000 + p * 10_000, 800_000, 800_000, new Date(now - 120 * day), new Date(now + 240 * day)]);
  const wbsIds = [];
  for (let w = 0; w < WBS_PER_PROJECT; w++) {
    const wid = randomUUID(); wbsIds.push(wid);
    wbs.push([wid, tenantId, id, null, String(w + 1), `Package ${w + 1}`, 40_000, 20_000, 18_000, 40 + (w % 5) * 10]);
    budgets.push([randomUUID(), tenantId, id, wid, `B${w + 1}`, 40_000, 40_000]);
  }
  const wh = [randomUUID(), randomUUID()];
  warehouses.push([wh[0], tenantId, id, "WH-1", "Main store", owner.id], [wh[1], tenantId, id, "WH-2", "Second store", owner.id]);
  const perProject = Math.floor(ACTIVITIES / PROJECTS);
  for (let a = 0; a < perProject; a++) {
    activities.push([randomUUID(), tenantId, id, wbsIds[a % WBS_PER_PROJECT], `A-${a + 1}`, `Activity ${a + 1}`, ["not_started", "in_progress", "completed", "blocked"][a % 4], 1_000, a % 4 === 2 ? 1_000 : (a % 4) * 250, new Date(now - (100 - (a % 90)) * day), new Date(now - (50 - (a % 90)) * day)]);
  }
  for (let c = 0; c < 60; c++) costs.push([randomUUID(), tenantId, id, wbsIds[c % WBS_PER_PROJECT], 500 + c * 17, "actual", "posted", new Date(now - (c % 100) * day), ["materials", "labour", "subcontract", "other"][c % 4]]);
  for (let g = 0; g < 100; g++) progress.push([randomUUID(), tenantId, id, wbsIds[g % WBS_PER_PROJECT], 10 + (g % 90), "validated", new Date(now - (g % 100) * day)]);
  const perMoves = Math.floor(MOVEMENTS / PROJECTS);
  for (let m = 0; m < perMoves; m++) {
    const material = materialRows[(m * 7 + p) % MATERIALS][0];
    const receipt = m % 3 !== 2;
    const quantity = (receipt ? 1 : -1) * (5 + (m % 40));
    txns.push([randomUUID(), tenantId, id, wh[m % 2], material, receipt ? "receipt" : "issue", quantity, `REF-${p}-${m}`, new Date(now - (m % 200) * day), owner.id, 12.5, quantity * 12.5]);
  }
}
await bulk("material_masters", ["id", "tenantId", "code", "description", "unitOfMeasure", "category", "createdByUserId"], materialRows);
await bulk("projects", ["id", "tenantId", "code", "name", "projectType", "lifecycleStage", "status", "currency", "contractValue", "originalBudget", "currentBudget", "plannedStartAt", "plannedFinishAt"], projects);
await bulk("wbs_items", ["id", "tenantId", "projectId", "parentId", "code", "name", "plannedValue", "earnedValue", "actualCost", "progressPercent"], wbs);
await bulk("budget_lines", ["id", "tenantId", "projectId", "wbsItemId", "costCode", "originalAmount", "currentAmount"], budgets);
await bulk("project_warehouses", ["id", "tenantId", "projectId", "code", "name", "createdByUserId"], warehouses);
await bulk("activities", ["id", "tenantId", "projectId", "wbsItemId", "code", "name", "status", "plannedValue", "earnedValue", "plannedStartAt", "plannedFinishAt"], activities);
await bulk("cost_entries", ["id", "tenantId", "projectId", "wbsItemId", "amount", "entryType", "status", "incurredAt", "category"], costs);
await bulk("progress_entries", ["id", "tenantId", "projectId", "wbsItemId", "progressPercent", "status", "measuredAt"], progress);
await bulk("warehouse_inventory_transactions", ["id", "tenantId", "projectId", "warehouseId", "materialId", "transactionType", "quantityDelta", "referenceNumber", "occurredAt", "createdByUserId", "unitCost", "valueDelta"], txns);
const [[counts]] = await connection.query("SELECT (SELECT COUNT(*) FROM projects WHERE tenantId = ?) AS projects, (SELECT COUNT(*) FROM activities WHERE tenantId = ?) AS activities, (SELECT COUNT(*) FROM warehouse_inventory_transactions WHERE tenantId = ?) AS movements", [tenantId, tenantId, tenantId]);
console.log(JSON.stringify({ seeded: true, seconds: Math.round((Date.now() - started) / 1000), tenantId, ownerEmail: email, firstProjectId: projectIds[0], counts }));
await connection.end();
process.exit(0);

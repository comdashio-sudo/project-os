// Q-68: a SYNTHETIC project with the SHAPE of the owner's real one, for the page sweep: 1,230 villas in 58 blocks over 4 phases, 7 models with codes that carry
// a hyphen or a plus (A-End, B+, C+), 216 weighted items in 30 groups where some models lack some items (their weights add to less than 100), a project with
// no programme and no progress yet — as a project looks right after its lists were imported. Invented names only; nothing real in it.
//
//   . env (DATABASE_URL naming project_os_integration_test, JWT_SECRET)
//   node --import tsx scripts/demo/seed-owner-shaped.mjs <sessionOutFile>
//
// It refuses to run on any other database. It writes the token of the synthetic owner to the file you name (mode 600), never to stdout, and prints the ids the audit needs.
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { users } from "../../drizzle/schema.ts";
import { sdk } from "../../server/_core/sdk.ts";
import { createProjectForTenant, createTenantForUser, getDb, upsertUser } from "../../server/db.ts";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const sessionFile = process.argv[2];
if (!sessionFile) { console.error("usage: node --import tsx scripts/demo/seed-owner-shaped.mjs <sessionOutFile>"); process.exit(2); }

const VILLAS = 1230; const BLOCKS = 58; const PHASES = 4; const GROUPS = 30; const ITEMS = 216;
const MODELS = ["A-End", "A-Mid", "B", "B+", "C", "C+", "D"];
const pad = (n, width) => String(n).padStart(width, "0");

const email = "owner.shaped@example.test";
const openId = `email:${createHash("sha256").update(email).digest("hex").slice(0, 40)}`;
await upsertUser({ openId, name: "مالك المشروع (مختلق)", email, loginMethod: "email" });
const db = await getDb();
const [owner] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
const { tenantId } = await createTenantForUser({ userId: owner.id, legalName: "شركة الشكل الواقعي (مختلقة)", slug: `owner-shaped-${randomUUID().slice(0, 8)}`, packageCode: "ALL-IN-ONE" });
const { id: projectId } = await createProjectForTenant({ userId: owner.id, tenantId, code: "SHAPED-1", name: "مشروع بشكل مشروع المالك (مختلق)", projectType: "villas", currency: "SAR" });

const client = await db.$client.connect();
async function bulk(table, columns, rows) {
  const per = Math.max(1, Math.floor(60_000 / columns.length));
  for (let start = 0; start < rows.length; start += per) {
    const part = rows.slice(start, start + per); const values = [];
    const tuples = part.map(row => `(${row.map(value => { values.push(value); return `$${values.length}`; }).join(",")})`);
    await client.query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}`, values);
  }
}
try {
  const zoneIds = Array.from({ length: PHASES }, () => randomUUID());
  await bulk("pmc_zones", ["id", "tenant_id", "project_id", "code", "name"], zoneIds.map((id, index) => [id, tenantId, projectId, `PH${index + 1}`, `المرحلة ${index + 1}`]));
  const blockIds = Array.from({ length: BLOCKS }, () => randomUUID());
  await bulk("pmc_blocks", ["id", "tenant_id", "project_id", "zone_id", "code", "name"], blockIds.map((id, index) => [id, tenantId, projectId, zoneIds[Math.floor(index * PHASES / BLOCKS)], `BLK ${pad(index + 1, 2)}`, `BLK ${pad(index + 1, 2)}`]));
  const unitRows = Array.from({ length: VILLAS }, (_unused, index) => [randomUUID(), tenantId, projectId, blockIds[Math.floor(index * BLOCKS / VILLAS)], index + 1, MODELS[index % MODELS.length], 1]);
  await bulk("pmc_units", ["id", "tenant_id", "project_id", "block_id", "unit_number", "model_code", "unit_weight"], unitRows);
  const groupIds = Array.from({ length: GROUPS }, () => randomUUID());
  await bulk("pmc_activity_groups", ["id", "tenant_id", "project_id", "code", "name"], groupIds.map((id, index) => [id, tenantId, projectId, `Q${pad(index + 1, 2)}`, `المجموعة Q${pad(index + 1, 2)}`]));
  const stageIds = Array.from({ length: ITEMS }, () => randomUUID());
  const stageRows = stageIds.map((id, index) => [id, tenantId, projectId, groupIds[index % GROUPS], `IP-${pad(index + 1, 3)}`, `البند ${index + 1}`]);
  await bulk("pmc_activity_stages", ["id", "tenant_id", "project_id", "group_id", "code", "name"], stageRows);
  // every model has every item except the ones it lacks (about one in ten): its weights then add to less than 100, as the owner's did
  const definitions = [];
  for (const [modelIndex, model] of MODELS.entries()) {
    const present = stageIds.map((_id, index) => ((index * 7 + modelIndex * 3) % 10 === 0 ? -1 : index)).filter(index => index >= 0);
    const share = 100 / ITEMS; // a fixed share per item of the full list, so a model that lacks items sums to less than 100
    for (const index of present) definitions.push([randomUUID(), tenantId, projectId, groupIds[index % GROUPS], stageIds[index], null, model, `IP-${pad(index + 1, 3)}`, `البند ${index + 1}`, Number(share.toFixed(6))]);
  }
  await bulk("pmc_activity_definitions", ["id", "tenant_id", "project_id", "group_id", "stage_id", "wbs_item_id", "model_code", "code", "name", "weight_percent"], definitions);
  // optional: SEED_CELLS_PERCENT=40 gives that share of every villa's activities a status and a history row, as a project with a few weeks of site updates has (default 0: a project just imported)
  const share = Math.max(0, Math.min(100, Number(process.env.SEED_CELLS_PERCENT ?? 0)));
  let cells = 0;
  if (share > 0) {
    const defsOfModel = new Map(); for (const row of definitions) (defsOfModel.get(row[6]) ?? defsOfModel.set(row[6], []).get(row[6])).push(row[0]);
    const cellRows = []; const historyRows = []; const now = new Date();
    for (const [unitIndex, unit] of unitRows.entries()) for (const [defIndex, definitionId] of (defsOfModel.get(unit[5]) ?? []).entries()) {
      if (((unitIndex * 31 + defIndex * 17) % 100) >= share) continue;
      const id = randomUUID(); const done = (unitIndex + defIndex) % 3 === 0;
      cellRows.push([id, tenantId, projectId, unit[0], definitionId, done ? "COMPLETE" : "IN_PROGRESS", owner.id, owner.id, now]);
      historyRows.push([randomUUID(), tenantId, projectId, id, "NOT_STARTED", done ? "COMPLETE" : "IN_PROGRESS", owner.id, now, "تحديث تجريبي"]);
    }
    await bulk("pmc_unit_activity_progress", ["id", "tenant_id", "project_id", "unit_id", "activity_definition_id", "status", "assigned_user_id", "last_changed_by_user_id", "last_changed_at"], cellRows);
    await bulk("pmc_unit_activity_history", ["id", "tenant_id", "project_id", "unit_activity_progress_id", "from_status", "to_status", "changed_by_user_id", "changed_at", "note"], historyRows);
    cells = cellRows.length;
  }
  console.log(JSON.stringify({ seeded: true, tenantId, projectId, villas: VILLAS, blocks: BLOCKS, models: MODELS.length, definitions: definitions.length, cells }));
} finally { client.release(); }
const token = await sdk.issueSession(openId, { name: "مالك المشروع (مختلق)" });
writeFileSync(sessionFile, token, { mode: 0o600 });
process.exit(0);

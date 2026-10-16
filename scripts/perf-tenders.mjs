// Volume check for the tenders module (work order 5, item 8): 61,500 bids over 1,951 packages (one of them with 3,000 bidders), 61,500 invitations
// and 31,000 levelling adjustments, written straight to the TEST database, then the calls a person makes are timed through the real service:
// the package list, the comparison of an ordinary package and of the 3,000-bid one, and an award. Invented names only.
//
//   . env (DATABASE_URL naming project_os_integration_test)
//   node scripts/migrate.mjs
//   node --import tsx scripts/perf-tenders.mjs
//
// Exit code 1 when a timing exceeds its limit. It never touches a database that is not project_os_integration_test.
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { users } from "../drizzle/schema.ts";
import { createProjectForTenant, createTenantForUser, getDb, upsertUser } from "../server/db.ts";
import { awardTender, getTenderComparison, listTenderPackages } from "../server/tenderService.ts";
import { emailOpenId } from "./lib/roleFixture.mjs";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (dbUrl.pathname !== "/project_os_integration_test") { console.error("Refusing to run: DATABASE_URL must name project_os_integration_test."); process.exit(2); }
const PACKAGES = Number(process.env.PERF_PACKAGES ?? 1950);
const BIDS_PER_PACKAGE = Number(process.env.PERF_BIDS ?? 30);
const BIG_BIDDERS = Number(process.env.PERF_BIG ?? 3000);
const run = randomBytes(3).toString("hex");
const db = await getDb();
const person = async name => {
  const email = `perf.${name}.${run}@perf.example.test`;
  await upsertUser({ openId: emailOpenId(email), name: `Perf ${name} ${run}`, email, loginMethod: "email" });
  const [row] = await db.select().from(users).where(eq(users.openId, emailOpenId(email))).limit(1);
  return row;
};
const owner = await person("owner"); const bidder = await person("bidder");
const { tenantId } = await createTenantForUser({ userId: owner.id, legalName: `Perf Tender Co. ${run}`, slug: `perf-tender-${run}`, packageCode: "ALL-IN-ONE" });
const { id: projectId } = await createProjectForTenant({ userId: owner.id, tenantId, code: `PT-${run.toUpperCase()}`, name: `Perf tender villas ${run}`, projectType: "residential", currency: "SAR" });
const connection = await mysql.createConnection({ uri: dbUrl.toString(), multipleStatements: false });
async function bulk(table, columns, rows) {
  for (let i = 0; i < rows.length; i += 1000) await connection.query(`INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(",")}) VALUES ?`, [rows.slice(i, i + 1000)]);
}

const started = Date.now();
const SUPPLIERS = Math.max(BIG_BIDDERS, BIDS_PER_PACKAGE);
const supplierIds = Array.from({ length: SUPPLIERS }, () => randomUUID());
await bulk("suppliers", ["id", "tenantId", "code", "legalName", "createdByUserId"], supplierIds.map((id, i) => [id, tenantId, `S${String(i + 1).padStart(5, "0")}`, `Perf Supplier ${i + 1}`, owner.id]));
const packages = [], invitees = [], bids = [], adjustments = [];
const day = 86400000; const now = Date.now();
const addPackage = (index, bidders, status) => {
  const id = randomUUID(); const code = `TP-${String(index).padStart(5, "0")}`;
  packages.push([id, tenantId, projectId, code, `Perf package ${index}`, 1_000_000, "SAR", status, new Date(now - index * day / 4), owner.id]);
  for (let b = 0; b < bidders; b++) {
    const supplierId = supplierIds[b];
    invitees.push([randomUUID(), tenantId, projectId, id, supplierId, "submitted", owner.id]);
    const bidId = randomUUID();
    bids.push([bidId, tenantId, projectId, id, supplierId, 800_000 + ((b * 7919 + index * 31) % 400_000), "SAR", 120 + (b % 90), "submitted", bidder.id]);
    if (b % 2 === 0) adjustments.push([randomUUID(), tenantId, projectId, id, bidId, b % 4 === 0 ? "scope_gap" : "correction", `Perf adjustment ${b}`, (b % 5) * 1000 + 500, owner.id]);
  }
  return id;
};
for (let i = 1; i <= PACKAGES; i++) addPackage(i, BIDS_PER_PACKAGE, i % 5 === 0 ? "closed" : i % 5 === 1 ? "open" : "awarded");
const bigId = addPackage(PACKAGES + 1, BIG_BIDDERS, "closed");
const awardId = addPackage(PACKAGES + 2, BIDS_PER_PACKAGE, "closed");
await bulk("tender_packages", ["id", "tenantId", "projectId", "packageCode", "title", "estimateAmount", "currency", "status", "createdAt", "createdByUserId"], packages);
await bulk("tender_invitees", ["id", "tenantId", "projectId", "packageId", "supplierId", "status", "invitedByUserId"], invitees);
await bulk("tender_bids", ["id", "tenantId", "projectId", "packageId", "supplierId", "amount", "currency", "durationDays", "status", "enteredByUserId"], bids);
await bulk("tender_bid_adjustments", ["id", "tenantId", "projectId", "packageId", "bidId", "kind", "description", "amount", "createdByUserId"], adjustments);
// the planner reads statistics: refresh them the way an import would (TiDB only; a harmless statement elsewhere is skipped)
const [[{ v }]] = await connection.query("SELECT VERSION() AS v");
if (/TiDB/i.test(String(v))) for (const table of ["tender_packages", "tender_invitees", "tender_bids", "tender_bid_adjustments", "suppliers"]) await connection.query(`ANALYZE TABLE \`${table}\``);
console.log(JSON.stringify({ seeded: { packages: packages.length, bids: bids.length, invitees: invitees.length, adjustments: adjustments.length, suppliers: SUPPLIERS }, seconds: Math.round((Date.now() - started) / 100) / 10 }));

const timed = async (name, limitMs, work) => {
  const times = [];
  let result;
  for (let i = 0; i < 3; i++) { const t = performance.now(); result = await work(i); times.push(performance.now() - t); }
  const best = Math.min(...times), worst = Math.max(...times);
  return { name, limitMs, bestMs: Math.round(best), worstMs: Math.round(worst), ok: worst <= limitMs, result };
};
const base = { userId: owner.id, tenantId, projectId };
const results = [];
results.push(await timed("package list (newest 100 of the register)", 1000, async () => (await listTenderPackages({ ...base, limit: 100 })).total));
results.push(await timed("package list, page 20 (offset 1900)", 1000, async () => (await listTenderPackages({ ...base, limit: 100, offset: 1900 })).packages.length));
const [[ordinary]] = await connection.query("SELECT id FROM tender_packages WHERE projectId = ? AND packageCode = 'TP-00010'", [projectId]);
results.push(await timed(`comparison of an ordinary package (${BIDS_PER_PACKAGE} bids)`, 500, async () => (await getTenderComparison({ ...base, packageId: ordinary.id })).bids.length));
results.push(await timed(`comparison of the big package (${BIG_BIDDERS} bids)`, 3000, async () => (await getTenderComparison({ ...base, packageId: bigId })).bids.length));
const [[lowest]] = await connection.query("SELECT id FROM tender_bids WHERE packageId = ? ORDER BY amount ASC LIMIT 1", [awardId]);
const award = await timed("award of a closed package (contract + commitment + status)", 1000, async i => i === 0 ? awardTender({ ...base, packageId: awardId, bidId: lowest.id, contractCode: `PERF-${run}` }) : awardTender({ ...base, packageId: awardId, bidId: lowest.id, contractCode: `PERF-${run}-${i}` }).catch(error => String(error.message)));
// only the first call can succeed; the other two are the refusals of an already-awarded package, which must also be fast
results.push({ ...award, result: undefined });
const [[row]] = await connection.query("SELECT (SELECT COUNT(*) FROM contracts WHERE projectId = ? AND code LIKE 'PERF-%') AS contracts, (SELECT COUNT(*) FROM commitments WHERE projectId = ? AND code LIKE 'PERF-%') AS commitments", [projectId, projectId]);
const exactlyOnce = Number(row.contracts) === 1 && Number(row.commitments) === 1;
console.log(JSON.stringify({ engine: String(v), results: results.map(({ result, ...rest }) => rest), awardedExactlyOnce: exactlyOnce }, null, 1));
await connection.end();
process.exit(results.every(item => item.ok) && exactlyOnce ? 0 : 1);

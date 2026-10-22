// Read-only. Lists the (project, material) pairs where cost may already be counted twice by data that predates stock valuation:
// a direct-to-site receipt booked cost at the door AND an issue to work charged the same material again.
// Run it against a database you own; it writes nothing. Usage: DATABASE_URL=... node scripts/report-receipt-double-count.mjs
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required."); process.exit(2); }
const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const client = new pg.Client({ connectionString: url, ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off" } });
await client.connect();
// row-level security applies to the application role; this report is meant to be run as the owner of the database, across companies
const { rows } = await client.query(`
  SELECT * FROM (
    SELECT g.tenant_id AS "tenantId", g.project_id AS "projectId", g.material_id AS "materialId",
           ROUND(SUM(g.received_quantity * g.unit_cost), 2) AS "directReceiptCost",
           (SELECT ROUND(SUM(mi.total_cost), 2) FROM material_issues mi WHERE mi.tenant_id = g.tenant_id AND mi.project_id = g.project_id AND mi.material_id = g.material_id) AS "issuedCost"
      FROM goods_receipt_notes g
     WHERE g.receipt_mode = 'direct_to_site' AND g.cost_entry_id IS NOT NULL
     GROUP BY g.tenant_id, g.project_id, g.material_id
  ) pairs WHERE "issuedCost" IS NOT NULL`);
await client.end();
if (!rows.length) { console.log("No (project, material) pair has both a direct receipt cost and an issue cost."); process.exit(0); }
console.log(`${rows.length} pair(s) have cost booked at receipt AND at issue. Review each before relying on its material cost:`);
for (const row of rows) console.log(JSON.stringify(row));
process.exit(1);

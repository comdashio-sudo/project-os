// Read-only. Lists the (project, material) pairs where cost may already be counted twice by data that predates stock valuation:
// a direct-to-site receipt booked cost at the door AND an issue to work charged the same material again.
// Run it against a database you own; it writes nothing. Usage: DATABASE_URL=... node scripts/report-receipt-double-count.mjs
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is required."); process.exit(2); }
const connection = await mysql.createConnection(url);
const [rows] = await connection.query(`
  SELECT g.tenantId, g.projectId, g.materialId,
         ROUND(SUM(g.receivedQuantity * g.unitCost), 2) AS directReceiptCost,
         (SELECT ROUND(SUM(mi.totalCost), 2) FROM material_issues mi WHERE mi.tenantId = g.tenantId AND mi.projectId = g.projectId AND mi.materialId = g.materialId) AS issuedCost
  FROM goods_receipt_notes g
  WHERE g.receiptMode = 'direct_to_site' AND g.costEntryId IS NOT NULL
  GROUP BY g.tenantId, g.projectId, g.materialId
  HAVING issuedCost IS NOT NULL`);
await connection.end();
if (!rows.length) { console.log("No (project, material) pair has both a direct receipt cost and an issue cost."); process.exit(0); }
console.log(`${rows.length} pair(s) have cost booked at receipt AND at issue. Review each before relying on its material cost:`);
for (const row of rows) console.log(JSON.stringify(row));
process.exit(1);

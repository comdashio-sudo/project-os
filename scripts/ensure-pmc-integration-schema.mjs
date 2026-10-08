import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required.");
const url = new URL(sourceUrl);
url.pathname = "/project_os_integration_test";
const connection = await mysql.createConnection({ uri: url.toString(), multipleStatements: true });
try {
  const [rows] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'pmc_%'");
  const existing = new Set(rows.map(row => row.tableName));
  const migration = "drizzle/0052_pmc_phase_a.sql";
  const expected = ["pmc_zones", "pmc_blocks", "pmc_units", "pmc_activity_groups", "pmc_activity_stages", "pmc_activity_definitions", "pmc_unit_activity_progress", "pmc_unit_activity_history", "pmc_verification_statuses", "pmc_inspection_requests", "pmc_inspection_steps", "pmc_baselines"];
  if (existing.size === 0) {
    const raw = await readFile(migration, "utf8");
    for (const statement of raw.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) await connection.query(statement);
  } else if (!expected.every(table => existing.has(table))) {
    throw new Error(`PMC schema is partial; found ${existing.size}/${expected.length} tables.`);
  }
  const [finalRows] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'pmc_%'");
  console.log(JSON.stringify({ database: "project_os_integration_test", pmcTableCount: finalRows.length, tables: finalRows.map(row => row.tableName).sort() }));
} finally {
  await connection.end();
}

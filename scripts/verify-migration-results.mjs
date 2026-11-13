// D-24: checks that a database really holds what migrations 0002, 0003, 0004 and 0007 declare (they are re-runnable, so they pass silently on a database where an
// object already existed in another shape). Read-only: it only reads the catalogue. Prints what is missing or different, by object name, and exits 1 if anything is.
//   DATABASE_URL=... node scripts/verify-migration-results.mjs
import pg from "pg";
import { join } from "node:path";
import { expectationsOfFiles, verifyExpectations } from "./lib/migrationExpectations.mjs";

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is required (any role that can read the catalogue)."); process.exit(2); }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const expectations = expectationsOfFiles(join(new URL("..", import.meta.url).pathname, "drizzle"));
  const problems = await verifyExpectations(async (sql, params) => (await client.query(sql, params)).rows, expectations);
  const counted = expectations.reduce((total, e) => total + e.tables.length + e.columns.length + e.enums.length + e.indexes.length + e.constraints.length + e.functions.length + e.triggers.length, 0);
  console.log(JSON.stringify({ migrations: expectations.map(e => e.migration), objectsChecked: counted, problems }, null, 2));
  if (problems.length) process.exitCode = 1;
} finally {
  await client.end();
}

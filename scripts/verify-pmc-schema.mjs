import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const expectedTables = [
  "pmc_zones",
  "pmc_blocks",
  "pmc_units",
  "pmc_activity_groups",
  "pmc_activity_stages",
  "pmc_activity_definitions",
  "pmc_unit_activity_progress",
  "pmc_unit_activity_history",
  "pmc_verification_statuses",
  "pmc_inspection_requests",
  "pmc_inspection_steps",
  "pmc_baselines",
];

const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(databaseUrl).hostname);
const client = new pg.Client({ connectionString: databaseUrl, ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off" } });
await client.connect();
try {
  const names = expectedTables;
  const { rows: columnRows } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1) AND column_name IN ('tenant_id', 'project_id')`,
    [names],
  );
  const columnsByTable = new Map();
  for (const row of columnRows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set();
    columns.add(row.column_name);
    columnsByTable.set(row.table_name, columns);
  }

  const { rows: foreignKeyRows } = await client.query(
    `SELECT table_name FROM information_schema.table_constraints
      WHERE constraint_schema = 'public' AND table_name = ANY($1) AND constraint_type = 'FOREIGN KEY'`,
    [names],
  );
  const foreignKeyTables = new Set(foreignKeyRows.map(row => row.table_name));

  // an index that leads with tenant_id and project_id, whatever it is named
  const { rows: indexRows } = await client.query(
    `SELECT DISTINCT c.relname AS table_name
       FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($1)
        AND (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum WHERE k.ord <= 2)
            = ARRAY['tenant_id', 'project_id']::name[]`,
    [names],
  );
  const indexedTables = new Set(indexRows.map(row => row.table_name));

  const { rows: rlsRows } = await client.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1) AND c.relrowsecurity", [names]);
  const rlsTables = new Set(rlsRows.map(row => row.relname));

  const checks = expectedTables.map(table => ({
    table,
    hasTenantAndProject: columnsByTable.get(table)?.has("tenant_id") === true && columnsByTable.get(table)?.has("project_id") === true,
    hasForeignKey: foreignKeyTables.has(table),
    hasTenantProjectIndex: indexedTables.has(table),
    hasRowLevelSecurity: rlsTables.has(table),
  }));
  const approved = checks.every(check => check.hasTenantAndProject && check.hasForeignKey && check.hasTenantProjectIndex && check.hasRowLevelSecurity);
  console.log(JSON.stringify({ approved, expectedTableCount: expectedTables.length, checks }, null, 2));
  if (!approved) process.exitCode = 1;
} finally {
  await client.end();
}

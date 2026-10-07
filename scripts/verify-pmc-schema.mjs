import mysql from "mysql2/promise";

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

const connection = await mysql.createConnection(databaseUrl);
try {
  const placeholders = expectedTables.map(() => "?").join(",");
  const [columnRows] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
        AND COLUMN_NAME IN ('tenantId', 'projectId')`,
    expectedTables,
  );
  const columnsByTable = new Map();
  for (const row of columnRows) {
    const columns = columnsByTable.get(row.TABLE_NAME) ?? new Set();
    columns.add(row.COLUMN_NAME);
    columnsByTable.set(row.TABLE_NAME, columns);
  }

  const [foreignKeyRows] = await connection.query(
    `SELECT TABLE_NAME, CONSTRAINT_NAME
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    expectedTables,
  );
  const foreignKeyTables = new Set(foreignKeyRows.map(row => row.TABLE_NAME));

  const [indexRows] = await connection.query(
    `SELECT DISTINCT TABLE_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (${placeholders})
        AND INDEX_NAME LIKE 'pmc_%tenant_project%'`,
    expectedTables,
  );
  const indexedTables = new Set(indexRows.map(row => row.TABLE_NAME));

  const checks = expectedTables.map(table => ({
    table,
    hasTenantAndProject: columnsByTable.get(table)?.has("tenantId") === true && columnsByTable.get(table)?.has("projectId") === true,
    hasForeignKey: foreignKeyTables.has(table),
    hasTenantProjectIndex: indexedTables.has(table),
  }));
  const approved = checks.every(check => check.hasTenantAndProject && check.hasForeignKey && check.hasTenantProjectIndex);
  console.log(JSON.stringify({ approved, expectedTableCount: expectedTables.length, checks }, null, 2));
  if (!approved) process.exitCode = 1;
} finally {
  await connection.end();
}

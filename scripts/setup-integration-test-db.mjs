import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required to derive the isolated test connection.");
const url = new URL(sourceUrl);
url.pathname = "/project_os_integration_test";
const connection = await mysql.createConnection({ uri: url.toString(), multipleStatements: true });
try {
  const migrationsDir = path.resolve("drizzle");
  const migrations = (await readdir(migrationsDir)).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort();
  await connection.query("CREATE TABLE IF NOT EXISTS integration_schema_migrations (migration_name varchar(255) PRIMARY KEY, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const [existing] = await connection.query("SELECT migration_name FROM integration_schema_migrations");
  const applied = new Set(existing.map(row => row.migration_name));
  const [tables] = await connection.query("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'");
  if (applied.size === 0 && Number(tables[0].count) > 0) {
    for (const migration of migrations.slice(0, -1)) await connection.query("INSERT IGNORE INTO integration_schema_migrations (migration_name) VALUES (?)", [migration]);
  }
  for (const migration of migrations) {
    const [seen] = await connection.query("SELECT 1 AS present FROM integration_schema_migrations WHERE migration_name = ? LIMIT 1", [migration]);
    if (seen.length) continue;
    const raw = await readFile(path.join(migrationsDir, migration), "utf8");
    const sql = raw.replaceAll("--> statement-breakpoint", ";");
    await connection.query(sql);
    await connection.query("INSERT INTO integration_schema_migrations (migration_name) VALUES (?)", [migration]);
  }
  const [rows] = await connection.query("SELECT DATABASE() AS database_name, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()");
  console.log(JSON.stringify(rows));
} finally {
  await connection.end();
}

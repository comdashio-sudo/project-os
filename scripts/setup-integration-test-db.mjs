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
  for (const migration of migrations) {
    const raw = await readFile(path.join(migrationsDir, migration), "utf8");
    const sql = raw.replaceAll("--> statement-breakpoint", ";");
    await connection.query(sql);
  }
  const [rows] = await connection.query("SELECT DATABASE() AS database_name, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE()");
  console.log(JSON.stringify(rows));
} finally {
  await connection.end();
}

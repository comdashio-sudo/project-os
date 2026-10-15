// Applies the Drizzle migrations in ./drizzle to the database in DATABASE_URL
// and records them in __drizzle_migrations. Used by the host's pre-deploy step
// (render.yaml) so the schema and the application ship together or not at all.
//
//   DATABASE_URL=mysql://... node scripts/migrate.mjs
//
// Prints the database name and the number of applied migrations, never the URL.
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(2);
}

const connection = await mysql.createConnection({ uri: url, multipleStatements: false });
try {
  const [[{ name }]] = await connection.query("SELECT DATABASE() AS name");
  await migrate(drizzle(connection), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  const [[{ applied }]] = await connection.query("SELECT COUNT(*) AS applied FROM __drizzle_migrations");
  console.log(JSON.stringify({ database: name, appliedMigrations: Number(applied) }));
} catch (error) {
  // Migrations are DDL, so the message names a statement, never a credential.
  console.error(`Migration failed: ${error?.code ?? error?.name ?? "UNKNOWN"} ${String(error?.cause?.sqlMessage ?? error?.cause?.message ?? error?.sqlMessage ?? error?.message ?? "").slice(0, 400)}`);
  process.exitCode = 1;
} finally {
  await connection.end();
}

import mysql from "mysql2/promise";

const rootUrl = process.env.DATABASE_URL;
const appPassword = process.env.PROJECT_OS_APP_DB_PASSWORD;
if (!rootUrl || !appPassword) {
  console.error("DATABASE_URL and PROJECT_OS_APP_DB_PASSWORD are required.");
  process.exit(2);
}

const database = decodeURIComponent(new URL(rootUrl).pathname.slice(1));
if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
  console.error("Database name is missing or contains unsupported identifier characters.");
  process.exit(2);
}

const quoteIdentifier = value => `\`${value.replaceAll("`", "``")}\``;
const rootUsername = decodeURIComponent(new URL(rootUrl).username);
const accountPrefix = rootUsername.split(".")[0];
if (!accountPrefix) {
  console.error("Database account does not contain a TiDB Cloud user prefix.");
  process.exit(2);
}
const appUsername = `${accountPrefix}.project_os_app`;
const account = `\`${appUsername}\`@\`%\``;
const connection = await mysql.createConnection(rootUrl);
let stage = "create user";
try {
  await connection.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${mysql.escape(appPassword)}`);
  stage = "alter user";
  await connection.query(`ALTER USER ${account} IDENTIFIED BY ${mysql.escape(appPassword)}`);
  stage = "list tables";
  const [tableRows] = await connection.query(
    "SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
    [database],
  );
  stage = "grant table privileges";
  for (const { tableName } of tableRows) {
    const privileges = tableName === "audit_logs" ? "SELECT, INSERT" : "SELECT, INSERT, UPDATE, DELETE";
    await connection.query(`GRANT ${privileges} ON ${quoteIdentifier(database)}.${quoteIdentifier(tableName)} TO ${account}`);
  }
  stage = "flush privileges";
  await connection.query("FLUSH PRIVILEGES");
  console.log(JSON.stringify({ account: `${appUsername}@%`, database, auditedTablePrivileges: ["SELECT", "INSERT"], tableCount: tableRows.length }, null, 2));
} catch (error) {
  console.error(`Audit account provisioning failed during ${stage} with ${error?.code ?? error?.name ?? "UNKNOWN"}.`);
  process.exitCode = 1;
} finally {
  connection.destroy();
}

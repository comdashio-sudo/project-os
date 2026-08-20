import mysql from "mysql2/promise";

const rootUrl = process.env.DATABASE_URL;
const adminPassword = process.env.PROJECT_OS_AUDIT_ADMIN_PASSWORD;
if (!rootUrl || !adminPassword) {
  console.error("DATABASE_URL and PROJECT_OS_AUDIT_ADMIN_PASSWORD are required.");
  process.exit(2);
}

const database = decodeURIComponent(new URL(rootUrl).pathname.slice(1));
const rootUsername = decodeURIComponent(new URL(rootUrl).username);
const accountPrefix = rootUsername.split(".")[0];
if (!database || !accountPrefix || !/^[A-Za-z0-9_]+$/.test(database)) {
  console.error("Database name or TiDB Cloud user prefix is unavailable.");
  process.exit(2);
}
const appUsername = `${accountPrefix}.audit_admin`;
const account = `\`${appUsername}\`@\`%\``;
const connection = await mysql.createConnection(rootUrl);
try {
  await connection.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${mysql.escape(adminPassword)}`);
  await connection.query(`ALTER USER ${account} IDENTIFIED BY ${mysql.escape(adminPassword)}`);
  await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.\`audit_logs\` TO ${account}`);
  console.log(JSON.stringify({ account: `${appUsername}@%`, database, table: "audit_logs", privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"] }, null, 2));
} catch (error) {
  console.error(`Audit administrator provisioning failed with ${error?.code ?? error?.name ?? "UNKNOWN"}.`);
  process.exitCode = 1;
} finally {
  connection.destroy();
}

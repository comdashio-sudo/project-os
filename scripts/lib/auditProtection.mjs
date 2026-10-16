// The restricted application account: SELECT, INSERT, UPDATE and DELETE on every table EXCEPT audit_logs, where it has SELECT and INSERT only,
// so the application can append to the audit trail and can never edit or erase it. A table created by a migration is invisible to the account
// until it is granted — so provisioning runs after every migration in the deploy path (scripts/predeploy.mjs), and the deploy FAILS when the
// account cannot see every table, instead of starting a site whose queries fail on the first page that touches the new table.
import mysql from "mysql2/promise";

const quote = value => `\`${String(value).replaceAll("`", "``")}\``;

export function appUsernameFor(rootUrl) {
  const prefix = decodeURIComponent(new URL(rootUrl).username).split(".")[0];
  if (!prefix) throw new Error("Database account does not contain a TiDB Cloud user prefix.");
  return `${prefix}.project_os_app`;
}

export function databaseNameOf(rootUrl) {
  const database = decodeURIComponent(new URL(rootUrl).pathname.slice(1));
  if (!database || !/^[A-Za-z0-9_]+$/.test(database)) throw new Error("Database name is missing or contains unsupported identifier characters.");
  return database;
}

const baseTables = async (connection, database) => {
  const [rows] = await connection.query("SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name", [database]);
  return rows.map(row => String(row.tableName));
};

export async function provisionAuditAppAccount({ rootUrl, appPassword }) {
  const database = databaseNameOf(rootUrl); const username = appUsernameFor(rootUrl);
  const account = `${quote(username)}@${quote("%")}`;
  const connection = await mysql.createConnection(rootUrl);
  let stage = "create user";
  try {
    await connection.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${mysql.escape(appPassword)}`);
    stage = "alter user";
    await connection.query(`ALTER USER ${account} IDENTIFIED BY ${mysql.escape(appPassword)}`);
    stage = "list tables";
    const tables = await baseTables(connection, database);
    stage = "grant table privileges";
    for (const table of tables) {
      const privileges = table === "audit_logs" ? "SELECT, INSERT" : "SELECT, INSERT, UPDATE, DELETE";
      await connection.query(`GRANT ${privileges} ON ${quote(database)}.${quote(table)} TO ${account}`);
    }
    stage = "flush privileges";
    await connection.query("FLUSH PRIVILEGES");
    return { account: `${username}@%`, database, tableCount: tables.length };
  } catch (error) {
    const failure = new Error(`Audit account provisioning failed during ${stage} with ${error?.code ?? error?.name ?? "UNKNOWN"}.`);
    failure.stage = stage;
    throw failure;
  } finally {
    connection.destroy();
  }
}

/** What the restricted account can see, against what exists. `missing` is every table it cannot see (a deploy must not go ahead while any). */
export async function restrictedAccountVisibility({ rootUrl, appPassword }) {
  const database = databaseNameOf(rootUrl);
  const admin = await mysql.createConnection(rootUrl);
  let expected;
  try { expected = await baseTables(admin, database); } finally { admin.destroy(); }
  const appUrl = new URL(rootUrl); appUrl.username = appUsernameFor(rootUrl); appUrl.password = appPassword;
  const restricted = await mysql.createConnection(appUrl.toString());
  try {
    const visible = await baseTables(restricted, database);
    // seeing a table in the catalogue is not the same as being allowed to read it: touch each one
    const unreadable = [];
    for (const table of visible) { try { await restricted.query(`SELECT 1 FROM ${quote(table)} LIMIT 0`); } catch { unreadable.push(table); } }
    const seen = new Set(visible.filter(table => !unreadable.includes(table)));
    return { expected: expected.length, visible: seen.size, missing: expected.filter(table => !seen.has(table)) };
  } finally {
    restricted.destroy();
  }
}

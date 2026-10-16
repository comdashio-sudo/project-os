// TiDB picks a query plan from table statistics. After a big change (a migration, a bulk load) the statistics are stale or missing until TiDB
// gets round to its own automatic ANALYZE — and until then a screen can take seconds instead of milliseconds (measured: 5.3 s before, 0.26 s
// after, at 100,000 stock movements). So the deploy path refreshes them itself. This is TiDB-only: MySQL keeps its own, and nothing here runs there.
export const isTiDBVersion = version => /tidb/i.test(String(version ?? ""));

export async function isTiDB(connection) {
  const [[row]] = await connection.query("SELECT VERSION() AS v");
  return isTiDBVersion(row.v);
}

/** ANALYZE every base table of the current database. Never throws: a table that cannot be analysed is reported, the deploy goes on. */
export async function analyzeAllTables(connection, { log = () => undefined } = {}) {
  if (!(await isTiDB(connection))) return { engine: "mysql", analyzed: 0, failed: [], skipped: true };
  const [tables] = await connection.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name");
  const failed = []; let analyzed = 0;
  for (const { t } of tables) {
    try { await connection.query(`ANALYZE TABLE \`${String(t).replaceAll("`", "``")}\``); analyzed++; }
    catch (error) { failed.push(`${t}: ${error?.code ?? error?.name ?? "UNKNOWN"}`); log(`analyze failed for ${t}`); }
  }
  return { engine: "tidb", analyzed, failed, skipped: false };
}

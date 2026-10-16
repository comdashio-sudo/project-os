import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "./db";
import { getScopedAuditAppUsername } from "./domain/auditAccountIdentity";
import { isTiDB, refreshStatisticsAfterBulkLoad } from "./tidbStats";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// On a real engine: MySQL is left alone, and on TiDB a bulk load whose statistics are missing (auto-ANALYZE switched off, as it is for the
// minutes after a big load) is fixed by the refresh. The probe table is created and dropped here.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("statistics refresh on the real engine", () => {
  let connection: mysql.Connection; let tidb = false; let autoAnalyzeWas: string | null = null;
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    tidb = await isTiDB((await getDb())!);
    await connection.query("DROP TABLE IF EXISTS zz_stats_probe");
    await connection.query("CREATE TABLE zz_stats_probe (id int PRIMARY KEY AUTO_INCREMENT, a int, b int, KEY(a))");
    if (tidb) {
      const [[row]] = await connection.query<mysql.RowDataPacket[]>("SELECT @@global.tidb_enable_auto_analyze AS v");
      autoAnalyzeWas = String(row.v);
      await connection.query("SET GLOBAL tidb_enable_auto_analyze = OFF");
    }
    // under the restricted application account a table made here is invisible until granted, as a migration's table is until predeploy runs
    if (process.env.PROJECT_OS_USE_ADMIN_DATABASE_URL !== "true" && process.env.PROJECT_OS_APP_DB_PASSWORD) {
      const database = decodeURIComponent(new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1));
      await connection.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.zz_stats_probe TO \`${getScopedAuditAppUsername(process.env.DATABASE_URL!)}\`@\`%\``);
    }
    const rows = Array.from({ length: 3000 }, (_, i) => [i % 50, i]);
    await connection.query("INSERT INTO zz_stats_probe (a, b) VALUES ?", [rows]);
  }, 60_000);
  afterAll(async () => {
    if (tidb && autoAnalyzeWas !== null) await connection.query(`SET GLOBAL tidb_enable_auto_analyze = ${autoAnalyzeWas === "1" || autoAnalyzeWas.toUpperCase() === "ON" ? "ON" : "OFF"}`);
    await connection.query("DROP TABLE IF EXISTS zz_stats_probe");
    await connection.end();
  });

  const healthy = async () => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SHOW STATS_HEALTHY WHERE Table_name = 'zz_stats_probe'");
    return Number(rows[0]?.Healthy ?? -1);
  };

  it("does nothing on MySQL", async () => {
    if (tidb) return;
    expect(await refreshStatisticsAfterBulkLoad((await getDb())!, ["zz_stats_probe"], 50_000)).toMatchObject({ ran: false, reason: "not-tidb" });
  });

  it("on TiDB, takes a table with no statistics to fully healthy statistics", async () => {
    if (!tidb) return;
    await new Promise(resolve => setTimeout(resolve, 3500)); // let TiDB's own bookkeeping settle, with auto-ANALYZE off
    expect(await healthy()).toBeLessThan(100);
    const result = await refreshStatisticsAfterBulkLoad((await getDb())!, ["zz_stats_probe"], 3000);
    expect(result).toMatchObject({ ran: true, reason: "refreshed", tables: ["zz_stats_probe"] });
    expect(await healthy()).toBe(100);
    const [rows] = await connection.query<mysql.RowDataPacket[]>("SHOW STATS_META WHERE Table_name = 'zz_stats_probe'");
    expect(Number(rows[0].Row_count)).toBe(3000);
  }, 30_000);

  it("on TiDB, works for the account the application really runs as, on the application's own tables", async () => {
    if (!tidb) return;
    expect(await refreshStatisticsAfterBulkLoad((await getDb())!, ["activities", "wbs_items"], 5000)).toMatchObject({ ran: true, reason: "refreshed" });
  });
});

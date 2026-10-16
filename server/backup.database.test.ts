import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mysql, { type Connection } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateBackupKey, parseBackupKey, readEncryptedBackupText } from "./backup/backupCrypto";
import { exportDatabase } from "./backup/exportDatabase";
import { EXCLUDED_TABLES, readDumpMarkers } from "./backup/sqlDump";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 4, item 5, on the test database: the backup is proven by RESTORING it, not by writing it. Two restores:
//  1. a probe table holding every awkward value (Arabic, emoji, quotes, backslashes, NUL, 64-bit numbers, JSON, bytes, NULL) is dumped, dropped, replayed
//     from the decrypted file and compared value by value;
//  2. the WHOLE database is dumped, decrypted, and replayed into copies of every table (prefix `bkchk_`, inside this same test database, foreign keys
//     left out only because their names are unique per database), then every copy is compared with its original by row count and by content (two EXCEPTs).
const url = process.env.TEST_DATABASE_URL;
const PREFIX = "bkchk_";
const PROBE = "backup_probe";

describe.skipIf(!isTestDatabaseUrl(url))("logical backup of a real database, and its restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "backup-live-"));
  const keyHex = generateBackupKey();
  let connection: Connection; let multi: Connection;

  const dropCopies = async () => {
    await multi.query("SET FOREIGN_KEY_CHECKS=0");
    const [rows] = await multi.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?", [`${PREFIX.replace("_", "\\_")}%`]);
    for (const { name } of rows as Array<{ name: string }>) await multi.query(`DROP TABLE IF EXISTS \`${name}\``);
    await multi.query("SET FOREIGN_KEY_CHECKS=1");
  };

  beforeAll(async () => {
    connection = await mysql.createConnection({ uri: url!, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, charset: "utf8mb4" });
    multi = await mysql.createConnection({ uri: url!, multipleStatements: true, charset: "utf8mb4" });
    await dropCopies();
    await connection.query(`DROP TABLE IF EXISTS ${PROBE}`);
  });
  afterAll(async () => {
    await connection.query(`DROP TABLE IF EXISTS ${PROBE}`).catch(() => undefined);
    await dropCopies().catch(() => undefined);
    await connection.end(); await multi.end();
    rmSync(dir, { recursive: true, force: true });
  });

  it("restores every awkward value exactly: text in two scripts, quotes, backslashes, NUL, 64-bit numbers, decimals, dates, JSON, bytes and NULL", async () => {
    await connection.query(`CREATE TABLE ${PROBE} (id BIGINT UNSIGNED NOT NULL PRIMARY KEY, txt TEXT, vc VARCHAR(100), dec_value DECIMAL(24,6), dt DATETIME(3), ts TIMESTAMP NULL, js JSON, bl BLOB, tiny TINYINT(1), maybe VARCHAR(20) NULL, vb VARBINARY(16), created TIMESTAMP NOT NULL DEFAULT (NOW()), updated TIMESTAMP NOT NULL DEFAULT (NOW()) ON UPDATE CURRENT_TIMESTAMP, doubled BIGINT GENERATED ALWAYS AS (tiny * 2) VIRTUAL)`);
    const rows: Array<unknown[]> = [
      ["18446744073709551615", "مرحبا بالعالم · Hello 🌍 emoji", "it's \"quoted\" and back\\slash", "123456789012345678.123456", "2026-10-16 08:15:30.123", "2026-10-16 08:15:30", JSON.stringify({ ar: "اسم", nested: [1, 2, { x: null }] }), Buffer.from([0, 1, 2, 255, 254]), 1, null, Buffer.from("raw bytes")],
      ["1", "line1\nline2\r\nline3\ttab\0after-nul\x1aZ", "'; DROP TABLE users; --", "-0.000001", "1970-01-02 00:00:00.000", null, JSON.stringify([]), Buffer.alloc(0), 0, "", Buffer.alloc(0)],
      ["2", "", "", "0.000000", "2099-12-31 23:59:59.999", "2030-01-01 00:00:01", JSON.stringify("just a string"), null, null, null, null],
    ];
    // `created`/`updated` get a date far from today: the restore must bring back THESE values, not the moment of the restore (a dump that skipped
    // columns with an expression default restored every createdAt as "now" — found by this very test on the real schema).
    const stamps = [["2020-02-29 10:00:00", "2021-03-01 11:00:00"], ["2001-01-01 00:00:01", "2001-01-01 00:00:02"], ["2038-01-19 03:14:07", "2038-01-19 03:14:07"]];
    for (const [index, row] of rows.entries()) await connection.query(`INSERT INTO ${PROBE} (id, txt, vc, dec_value, dt, ts, js, bl, tiny, maybe, vb, created, updated) VALUES (?)`, [[...row, ...stamps[index]]]);
    const before = (await connection.query(`SELECT *, HEX(bl) AS bl_hex, HEX(vb) AS vb_hex, CAST(js AS CHAR) AS js_text FROM ${PROBE} ORDER BY id`))[0];

    const result = await exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: dir, only: [PROBE] });
    expect(result).toMatchObject({ tables: 1, rows: 3 });
    const text = await readEncryptedBackupText(result.file, parseBackupKey(keyHex));

    await connection.query(`DROP TABLE ${PROBE}`);
    await multi.query(text);
    const after = (await connection.query(`SELECT *, HEX(bl) AS bl_hex, HEX(vb) AS vb_hex, CAST(js AS CHAR) AS js_text FROM ${PROBE} ORDER BY id`))[0];
    expect(after).toEqual(before);
    expect(Object.fromEntries((after as Array<Record<string, unknown>>).map(row => [String(row.id), row.created]))).toMatchObject({ "18446744073709551615": "2020-02-29 10:00:00", "1": "2001-01-01 00:00:01" });
    const byId = Object.fromEntries((after as Array<Record<string, unknown>>).map(row => [String(row.id), row]));
    expect(byId["18446744073709551615"].txt).toContain("🌍");
    expect(byId["1"].txt).toContain("\0after-nul");
  });

  it("dumps every table except the ones that must never be restored (sign-in codes and sessions), and each count matches the table's own", async () => {
    const result = await exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: dir });
    const text = await readEncryptedBackupText(result.file, parseBackupKey(keyHex));
    const markers = readDumpMarkers(text);
    expect(markers.complete).toEqual({ tables: markers.tables.length, rows: markers.tables.reduce((sum, table) => sum + table.rows, 0) });
    const [live] = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
    const expected = (live as Array<{ name: string }>).map(row => row.name).filter(name => !EXCLUDED_TABLES.has(name) && !name.startsWith(PREFIX)).sort();
    expect(markers.tables.map(table => table.name).sort()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(100);
    for (const excluded of EXCLUDED_TABLES) { expect(text).not.toContain(`-- TABLE ${excluded}\n`); expect(text).not.toContain(`INSERT INTO \`${excluded}\``); }
    for (const table of markers.tables) { const [[row]] = (await connection.query(`SELECT COUNT(*) AS n FROM \`${table.name}\``)) as unknown as [[{ n: number }]]; expect(table.rows, table.name).toBe(Number(row.n)); }
    expect(statSync(result.file).mode & 0o777).toBe(0o600);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);

  it("RESTORES the whole database: every table of the dump is replayed from the decrypted file into a copy that matches its original by row count and by content", async () => {
    const result = await exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: dir });
    let text = await readEncryptedBackupText(result.file, parseBackupKey(keyHex));
    const names = readDumpMarkers(text).tables.map(table => table.name);
    // Replay into prefixed copies. Foreign keys are dropped from the copies only because a constraint name is unique per database and the originals are still here.
    for (const name of names.sort((a, b) => b.length - a.length)) text = text.split(`\`${name}\``).join(`\`${PREFIX}${name}\``);
    text = text.replace(/,?\n\s+CONSTRAINT `[^`]+` FOREIGN KEY[^\n]*/g, "").replace(/,\n\) ENGINE/g, "\n) ENGINE");
    writeFileSync(join(dir, "replay.sql"), text);
    await multi.query(text);

    const mismatches: string[] = [];
    for (const name of names) {
      const [[original]] = (await connection.query(`SELECT COUNT(*) AS n FROM \`${name}\``)) as unknown as [[{ n: number }]];
      const [[copy]] = (await connection.query(`SELECT COUNT(*) AS n FROM \`${PREFIX}${name}\``)) as unknown as [[{ n: number }]];
      if (Number(original.n) !== Number(copy.n)) { mismatches.push(`${name}: rows ${original.n} != ${copy.n}`); continue; }
      // Compared by content, not by CHECKSUM TABLE: that statement is MySQL's; TiDB spells it ADMIN CHECKSUM TABLE. Two EXCEPTs run on both.
      const onlyIn = async (left: string, right: string) => Number(((await connection.query(`SELECT COUNT(*) AS n FROM (SELECT * FROM \`${left}\` EXCEPT SELECT * FROM \`${right}\`) AS difference`))[0] as Array<{ n: number }>)[0].n);
      const missingFromCopy = await onlyIn(name, `${PREFIX}${name}`); const addedInCopy = await onlyIn(`${PREFIX}${name}`, name);
      if (missingFromCopy || addedInCopy) mismatches.push(`${name}: ${missingFromCopy} original row(s) not in the copy, ${addedInCopy} copy row(s) not in the original`);
    }
    expect(mismatches.slice(0, 8)).toEqual([]);
    const [restored] = await connection.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?", [`${PREFIX.replace("_", "\\_")}%`]);
    expect(Number((restored as Array<{ n: number }>)[0].n)).toBe(names.length);
  }, 300_000);

  it("fails loudly, with no file left behind, when a table cannot be dumped (an unknown table name)", async () => {
    const before = readFileSync(join(dir, "replay.sql")).length;
    await expect(exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: join(dir, "failed"), only: ["no_such_table"] })).rejects.toThrow(/Unknown table/);
    expect(() => statSync(join(dir, "failed"))).not.toThrow(); // the folder exists, but no backup file does
    expect(readFileSync(join(dir, "replay.sql")).length).toBe(before);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(join(dir, "failed")).filter(file => file.endsWith(".enc"))).toEqual([]);
  });
});

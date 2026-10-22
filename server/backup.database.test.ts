import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateBackupKey, parseBackupKey, readEncryptedBackupText } from "./backup/backupCrypto";
import { exportDatabase } from "./backup/exportDatabase";
import { EXCLUDED_TABLES, readDumpMarkers } from "./backup/sqlDump";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 4, item 5, on the test database (rewritten for PostgreSQL in work order 6): the backup is proven by RESTORING it, not by writing it. Two restores:
//  1. a probe table holding every awkward value (Arabic, emoji, quotes, backslashes, 64-bit and 24-digit numbers, jsonb, bytes, NULL, extreme dates) is dumped,
//     dropped, replayed from the decrypted file and compared value by value;
//  2. the WHOLE database is dumped, decrypted, and replayed into copies of every table (schema `bkchk`, inside this same test database, built as
//     `CREATE TABLE … (LIKE original INCLUDING DEFAULTS)` so no constraint or policy is copied), then every copy is compared with its original by row count
//     and by content (two EXCEPTs).
const url = process.env.TEST_DATABASE_URL;
const COPY_SCHEMA = "bkchk";
const PROBE = "backup_probe";

describe.skipIf(!isTestDatabaseUrl(url))("logical backup of a real database, and its restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "backup-live-"));
  const keyHex = generateBackupKey();
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url });
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS ${COPY_SCHEMA} CASCADE`);
    await client.query(`DROP TABLE IF EXISTS ${PROBE}`);
  });
  afterAll(async () => {
    await client.query(`DROP TABLE IF EXISTS ${PROBE}`).catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS ${COPY_SCHEMA} CASCADE`).catch(() => undefined);
    await client.end();
    rmSync(dir, { recursive: true, force: true });
  });

  it("restores every awkward value exactly: text in two scripts, quotes, backslashes, control characters, 64-bit and 24-digit numbers, dates, jsonb, bytes and NULL", async () => {
    await client.query(`CREATE TABLE ${PROBE} (id numeric(20,0) NOT NULL PRIMARY KEY, txt text, vc varchar(100), dec_value numeric(24,6), dt timestamp(3), ts timestamptz, js jsonb, bl bytea, flag boolean, maybe varchar(20), big bigint, created timestamptz NOT NULL DEFAULT now(), updated timestamptz NOT NULL DEFAULT now())`);
    const rows: Array<unknown[]> = [
      ["18446744073709551615", "مرحبا بالعالم · Hello 🌍 emoji", "it's \"quoted\" and back\\slash", "123456789012345678.123456", "2026-10-16 08:15:30.123", "2026-10-16 08:15:30+03", JSON.stringify({ ar: "اسم", nested: [1, 2, { x: null }] }), Buffer.from([0, 1, 2, 255, 254]), true, null, "9223372036854775807"],
      ["1", "line1\nline2\r\nline3\ttab\x01ctrl\x1aZ", "'; DROP TABLE users; --", "-0.000001", "1970-01-02 00:00:00.000", null, JSON.stringify([]), Buffer.alloc(0), false, "", "-9223372036854775808"],
      ["2", "", "", "0.000000", "2099-12-31 23:59:59.999", "2030-01-01 00:00:01+00", JSON.stringify("just a string"), null, null, null, null],
    ];
    // `created`/`updated` get a date far from today: the restore must bring back THESE values, not the moment of the restore (the previous engine's dump once
    // restored every createdAt as "now" — found by this very test on the real schema).
    const stamps = [["2020-02-29 10:00:00+00", "2021-03-01 11:00:00+00"], ["2001-01-01 00:00:01+00", "2001-01-01 00:00:02+00"], ["2038-01-19 03:14:07+00", "2038-01-19 03:14:07+00"]];
    for (const [index, row] of rows.entries()) {
      await client.query(`INSERT INTO ${PROBE} (id, txt, vc, dec_value, dt, ts, js, bl, flag, maybe, big, created, updated) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [...row, ...stamps[index]]);
    }
    const snapshot = async () => (await client.query(`SELECT id::text, txt, vc, dec_value::text, dt::text, ts::text, js::text, encode(bl, 'hex') AS bl_hex, flag, maybe, big::text, created::text, updated::text FROM ${PROBE} ORDER BY id`)).rows;
    const before = await snapshot();

    const result = await exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: dir, only: [PROBE] });
    expect(result).toMatchObject({ tables: 1, rows: 3 });
    const text = await readEncryptedBackupText(result.file, parseBackupKey(keyHex));

    await client.query(`DROP TABLE ${PROBE}`);
    await client.query(`CREATE TABLE ${PROBE} (id numeric(20,0) NOT NULL PRIMARY KEY, txt text, vc varchar(100), dec_value numeric(24,6), dt timestamp(3), ts timestamptz, js jsonb, bl bytea, flag boolean, maybe varchar(20), big bigint, created timestamptz NOT NULL DEFAULT now(), updated timestamptz NOT NULL DEFAULT now())`);
    await client.query(text);
    const after = await snapshot();
    expect(after).toEqual(before);
    const byId = Object.fromEntries(after.map(row => [String(row.id), row]));
    expect(byId["18446744073709551615"].created).toContain("2020-02-29 10:00:00");
    expect(byId["1"].created).toContain("2001-01-01 00:00:01");
    expect(byId["18446744073709551615"].txt).toContain("🌍");
    expect(byId["1"].txt).toContain("\x01ctrl");
    expect(byId["1"].big).toBe("-9223372036854775808");
  });

  it("dumps every table except the ones that must never be restored (sessions), and each count matches the table's own", async () => {
    const result = await exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: dir });
    const text = await readEncryptedBackupText(result.file, parseBackupKey(keyHex));
    const markers = readDumpMarkers(text);
    expect(markers.complete).toEqual({ tables: markers.tables.length, rows: markers.tables.reduce((sum, table) => sum + table.rows, 0) });
    const live = (await client.query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'")).rows;
    const expected = live.map(row => row.name).filter(name => !EXCLUDED_TABLES.has(name)).sort();
    expect(markers.tables.map(table => table.name).sort()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(100);
    for (const excluded of EXCLUDED_TABLES) { expect(text).not.toContain(`-- TABLE ${excluded}\n`); expect(text).not.toContain(`INSERT INTO "${excluded}"`); }
    for (const table of markers.tables) {
      const { rows: [row] } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM public."${table.name}"`);
      expect(table.rows, table.name).toBe(Number(row.n));
    }
    // parents come before the tables that point at them, so a plain replay never meets a missing parent
    const position = new Map(markers.tables.map((table, index) => [table.name, index]));
    const edges = (await client.query<{ child: string; parent: string }>("SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid WHERE k.contype = 'f' AND c.oid <> p.oid")).rows;
    for (const edge of edges) if (position.has(edge.child) && position.has(edge.parent)) expect(position.get(edge.parent)!, `${edge.parent} before ${edge.child}`).toBeLessThan(position.get(edge.child)!);
    expect(statSync(result.file).mode & 0o777).toBe(0o600);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);

  it("RESTORES the whole database: every table of the dump is replayed from the decrypted file into a copy that matches its original by row count and by content", async () => {
    const result = await exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: dir });
    let text = await readEncryptedBackupText(result.file, parseBackupKey(keyHex));
    const names = readDumpMarkers(text).tables.map(table => table.name);
    await client.query(`CREATE SCHEMA ${COPY_SCHEMA}`);
    for (const name of names) await client.query(`CREATE TABLE ${COPY_SCHEMA}."${name}" (LIKE public."${name}" INCLUDING DEFAULTS)`);
    // Replay into the copies: the INSERTs are redirected; the sequence resets (which name the real sequences) are left out of a copy.
    for (const name of names.slice().sort((a, b) => b.length - a.length)) text = text.split(`INSERT INTO "${name}" (`).join(`INSERT INTO ${COPY_SCHEMA}."${name}" (`);
    text = text.replace(/^SELECT setval\(.*-- SEQUENCE .*$/gm, "");
    writeFileSync(join(dir, "replay.sql"), text);
    await client.query(text);

    const mismatches: string[] = [];
    for (const name of names) {
      const original = Number((await client.query(`SELECT COUNT(*)::int AS n FROM public."${name}"`)).rows[0].n);
      const copy = Number((await client.query(`SELECT COUNT(*)::int AS n FROM ${COPY_SCHEMA}."${name}"`)).rows[0].n);
      if (original !== copy) { mismatches.push(`${name}: rows ${original} != ${copy}`); continue; }
      // Compared by content: two EXCEPTs, one each way.
      const onlyIn = async (left: string, right: string) => Number((await client.query(`SELECT COUNT(*)::int AS n FROM (SELECT * FROM ${left} EXCEPT SELECT * FROM ${right}) AS difference`)).rows[0].n);
      const missingFromCopy = await onlyIn(`public."${name}"`, `${COPY_SCHEMA}."${name}"`); const addedInCopy = await onlyIn(`${COPY_SCHEMA}."${name}"`, `public."${name}"`);
      if (missingFromCopy || addedInCopy) mismatches.push(`${name}: ${missingFromCopy} original row(s) not in the copy, ${addedInCopy} copy row(s) not in the original`);
    }
    expect(mismatches.slice(0, 8)).toEqual([]);
    const restored = Number((await client.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = $1", [COPY_SCHEMA])).rows[0].n);
    expect(restored).toBe(names.length);
  }, 300_000);

  it("fails loudly, with no file left behind, when a table cannot be dumped (an unknown table name)", async () => {
    const before = readFileSync(join(dir, "replay.sql")).length;
    await expect(exportDatabase({ databaseUrl: url!, encryptionKeyHex: keyHex, outDir: join(dir, "failed"), only: ["no_such_table"] })).rejects.toThrow(/Unknown table/);
    expect(() => statSync(join(dir, "failed"))).not.toThrow(); // the folder exists, but no backup file does
    expect(readFileSync(join(dir, "replay.sql")).length).toBe(before);
    expect(readdirSync(join(dir, "failed")).filter(file => file.endsWith(".enc"))).toEqual([]);
  });
});

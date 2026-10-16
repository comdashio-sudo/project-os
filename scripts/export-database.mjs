// Daily logical backup of the database, encrypted, optionally uploaded to R2. Read-only: it needs SELECT and SHOW on the database and nothing more.
//
//   node --import tsx scripts/export-database.mjs --generate-key          # prints a new key; keep it in your password manager, NOT only in Render
//   node --import tsx scripts/export-database.mjs --out-dir ./backups     # local file
//   node --import tsx scripts/export-database.mjs --to-r2                 # what the daily cron runs
//   node --import tsx scripts/export-database.mjs --decrypt FILE.enc [--out FILE.sql]   # back to plain SQL, to restore from
//
// Environment: BACKUP_DATABASE_URL (preferred: a SELECT-only account) or DATABASE_URL, BACKUP_ENCRYPTION_KEY (64 hex), and for --to-r2:
// R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, BACKUP_R2_BUCKET (or R2_BUCKET). Values are never printed.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { decryptBackupToFile, generateBackupKey, parseBackupKey } from "../server/backup/backupCrypto.ts";
import { exportDatabase, r2TargetFromEnvironment, uploadBackup } from "../server/backup/exportDatabase.ts";

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const fail = (message, code = 2) => { console.error(JSON.stringify({ ok: false, error: message })); process.exit(code); };

if (flag("--generate-key")) { console.log(generateBackupKey()); process.exit(0); }

if (flag("--decrypt")) {
  const file = value("--decrypt");
  if (!file) fail("--decrypt needs the backup file");
  const out = value("--out") ?? file.replace(/\.enc$/, "");
  try { await decryptBackupToFile(file, out, parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY)); } catch (error) { fail(`Could not decrypt: ${error instanceof Error ? error.message : "unknown error"}`, 3); }
  console.log(JSON.stringify({ ok: true, wrote: out }));
  process.exit(0);
}

const databaseUrl = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) fail("BACKUP_DATABASE_URL or DATABASE_URL is required", 3);
const toR2 = flag("--to-r2");
let target;
if (toR2) { try { target = r2TargetFromEnvironment(); } catch (error) { fail(error.message, 3); } } // a backup that cannot be stored must FAIL the run, not pass quietly
const outDir = value("--out-dir") ?? (toR2 ? join(tmpdir(), "project-os-backups") : "./backups");

try {
  const now = new Date();
  const result = await exportDatabase({ databaseUrl, encryptionKeyHex: process.env.BACKUP_ENCRYPTION_KEY, outDir, now });
  const uploaded = toR2 ? await uploadBackup(result.file, target, now) : null;
  if (toR2) await rm(result.file, { force: true });
  console.log(JSON.stringify({ ok: true, database: result.databaseName, tables: result.tables, rows: result.rows, bytes: result.bytes, sha256: result.sha256, file: toR2 ? null : result.file, uploadedTo: uploaded ? `${uploaded.bucket}/${uploaded.key}` : null }));
} catch (error) {
  fail(`Backup failed: ${error instanceof Error ? `${error.name}${error.code ? ` (${error.code})` : ""}` : "unknown error"}`, 1); // never the message: a driver message can carry data
}

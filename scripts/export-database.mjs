// Daily logical backup of the database, encrypted, optionally uploaded to a private Supabase Storage bucket. Read-only: it needs SELECT on every table (use the table owner or a role with BYPASSRLS; the application role sees no rows without a request context).
//
//   node --import tsx scripts/export-database.mjs --generate-key          # prints a new key; keep it in your password manager, NOT only in the host's environment
//   node --import tsx scripts/export-database.mjs --out-dir ./backups     # local file
//   node --import tsx scripts/export-database.mjs --to-storage            # upload to the private backup bucket (run from CI or an operator machine, not from Vercel: a full dump can exceed a function's time limit)
//   node --import tsx scripts/export-database.mjs --decrypt FILE.enc [--out FILE.sql]   # back to plain SQL, to restore from
//
// Environment: BACKUP_DATABASE_URL (the DIRECT connection, port 5432, as the table owner) or DATABASE_URL, BACKUP_ENCRYPTION_KEY (64 hex), and for --to-storage:
// STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY, BACKUP_BUCKET. Values are never printed.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { decryptBackupToFile, generateBackupKey, parseBackupKey } from "../server/backup/backupCrypto.ts";
import { exportDatabase, backupTargetFromEnvironment, uploadBackup } from "../server/backup/exportDatabase.ts";

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
const toStorage = flag("--to-storage");
let target;
if (toStorage) { try { target = backupTargetFromEnvironment(); } catch (error) { fail(error.message, 3); } } // a backup that cannot be stored must FAIL the run, not pass quietly
const outDir = value("--out-dir") ?? (toStorage ? join(tmpdir(), "project-os-backups") : "./backups");

try {
  const now = new Date();
  const result = await exportDatabase({ databaseUrl, encryptionKeyHex: process.env.BACKUP_ENCRYPTION_KEY, outDir, now });
  const uploaded = toStorage ? await uploadBackup(result.file, target, now) : null;
  if (toStorage) await rm(result.file, { force: true });
  console.log(JSON.stringify({ ok: true, database: result.databaseName, tables: result.tables, rows: result.rows, bytes: result.bytes, sha256: result.sha256, file: toStorage ? null : result.file, uploadedTo: uploaded ? `${uploaded.bucket}/${uploaded.key}` : null }));
} catch (error) {
  fail(`Backup failed: ${error instanceof Error ? `${error.name}${error.code ? ` (${error.code})` : ""}` : "unknown error"}`, 1); // never the message: a driver message can carry data
}

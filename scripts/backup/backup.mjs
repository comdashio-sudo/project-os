// Daily backup of the platform's data, off Supabase, encrypted, with the restore PROVEN in the same run (work order 18, section 0 item 6; docs/TASLEEM_LESSONS.md section 4).
//
//   node scripts/backup/backup.mjs        (run by .github/workflows/daily-backup.yml; the database URL comes from `scripts/bootstrap/run.ts database`)
//
// What it does, in this order, and stops at the first thing that is wrong:
//   1. refuses to start without the secrets it needs, naming each one that is missing (never a value);
//   2. reads the server's version and refuses a pg_dump older than the server;
//   3. opens ONE repeatable-read, read-only snapshot, counts every row of every table in the schemas, and takes pg_dump (custom format) in that same snapshot,
//      so the counts and the dump describe the same instant even while people are working;
//   4. refuses a dump that is smaller than a floor or that lacks a TABLE DATA entry for any table;
//   5. packs the storage buckets' files (the S3 endpoint) with a manifest of sizes and SHA-256, and checks the count against storage.objects;
//   6. encrypts both with gpg (AES-256, passphrase from BACKUP_ENCRYPTION_PASSPHRASE) and deletes the plain files;
//   7. DECRYPTS the dump again and RESTORES it into a scratch database on a different server, then compares the exact row count of every table with step 3.
// The encrypted files and manifest.json are left in BACKUP_OUT for the workflow to upload (an artifact outside Supabase). A restore that does not reproduce the data
// exits 1 AFTER the files are written, so the run is red and the evidence is still kept. Prints names, counts and sizes; never a URL, a password or a key.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";
import { compareCounts, dumpIsSuspicious, majorOf, missingSecrets, tableDataEntries } from "./lib.mjs";

const env = process.env;
const out = path.resolve(env.BACKUP_OUT ?? "backup-out");
const wantedSchemas = (env.BACKUP_SCHEMAS ?? "public,drizzle,auth,storage").split(",").map(item => item.trim()).filter(Boolean);
let schemas = wantedSchemas;
const floor = Number(env.BACKUP_MIN_DUMP_BYTES ?? 150_000);
const withStorage = (env.BACKUP_STORAGE ?? "on") !== "off";
const say = (step, detail = {}) => console.log(JSON.stringify({ step, ...detail }));
const fail = (message, detail = {}) => { say("FAILED", { message, ...detail }); process.exitCode = 1; };

const required = ["DATABASE_URL", "BACKUP_ENCRYPTION_PASSPHRASE", "BACKUP_RESTORE_ADMIN_URL", ...(withStorage ? ["STORAGE_S3_ACCESS_KEY_ID", "STORAGE_S3_SECRET_ACCESS_KEY", "STORAGE_S3_ENDPOINT"] : [])];
const absent = missingSecrets(env, required);
if (absent.length) { fail(`these settings are missing: ${absent.join(", ")}`); process.exit(1); }

const isLocal = url => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const sslFor = url => (isLocal(url) || env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, "\n").trim() } : {}) });
const quote = name => `"${name.replace(/"/g, '""')}"`;
const run = (command, args, { input, envExtra, quiet } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { env: { ...env, ...envExtra }, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  if (input !== undefined) child.stdin.end(input);
  child.on("error", reject);
  child.on("close", code => (code === 0 || quiet ? resolve({ code, stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.trim().slice(0, 400)}`))));
});
const sha256 = file => new Promise((resolve, reject) => { const hash = createHash("sha256"); createReadStream(file).on("data", chunk => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex"))); });

// Connection settings for the child processes: the certificate goes to a file for libpq. The URL itself is passed as an argument, which `ps` could show on a shared
// machine, so it is passed in the environment (PGHOST etc. are not enough with a pooler user name), via the `--dbname` of a service-less connection string in PGSERVICE-free form.
mkdirSync(out, { recursive: true });
const sslEnv = (url) => {
  if (isLocal(url) || env.DATABASE_SSL === "off") return { PGSSLMODE: "disable" };
  if (!env.DATABASE_SSL_CA) return { PGSSLMODE: "require" };
  const caFile = path.join(out, `.ca-${randomBytes(4).toString("hex")}.pem`);
  writeFileSync(caFile, env.DATABASE_SSL_CA.replace(/\\n/g, "\n").trim() + "\n", { mode: 0o600 });
  return { PGSSLMODE: "verify-ca", PGSSLROOTCERT: caFile };
};
const libpq = url => { const u = new URL(url); return { PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || "postgres", ...sslEnv(url) }; };

const source = new pg.Client({ connectionString: env.DATABASE_URL, ssl: sslFor(env.DATABASE_URL) });
await source.connect();
const manifest = { startedAt: new Date().toISOString(), schemas, files: {} };
let counts = {};
try {
  // ---- 2. versions
  const serverNum = (await source.query("SHOW server_version_num")).rows[0].server_version_num;
  const dumpVersion = (await run("pg_dump", ["--version"])).stdout.match(/(\d+)(?:\.\d+)?/)?.[1];
  manifest.serverMajor = majorOf(serverNum); manifest.pgDumpMajor = Number(dumpVersion);
  say("versions", { serverMajor: manifest.serverMajor, pgDumpMajor: manifest.pgDumpMajor });
  if (!Number.isFinite(manifest.pgDumpMajor) || manifest.pgDumpMajor < manifest.serverMajor) throw new Error(`pg_dump ${dumpVersion} is older than the server (${manifest.serverMajor}): install the matching client`);

  // a schema that does not exist here (drizzle on a database the migrations never touched) is left out; `public` missing is an error
  const present = new Set((await source.query("SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])", [wantedSchemas])).rows.map(row => row.nspname));
  schemas = wantedSchemas.filter(schema => present.has(schema));
  if (!schemas.includes("public")) throw new Error("the schema public was not found: this is not the platform's database");
  manifest.schemas = schemas;

  // ---- 3. one snapshot for the counts and the dump
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (await source.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
  const tables = (await source.query(`SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p') AND n.nspname = ANY($1::text[]) AND NOT c.relispartition ORDER BY 1, 2`, [schemas])).rows;
  if (!tables.length) throw new Error(`no table found in the schemas ${schemas.join(", ")}`);
  for (const table of tables) counts[`${table.schema}.${table.name}`] = Number((await source.query(`SELECT count(*)::bigint AS n FROM ${quote(table.schema)}.${quote(table.name)}`)).rows[0].n);
  const databaseFile = path.join(out, "database.dump");
  await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--snapshot=${snapshot}`, ...schemas.map(schema => `--schema=${schema}`), `--file=${databaseFile}`], { envExtra: libpq(env.DATABASE_URL) });
  await source.query("ROLLBACK");
  const bytes = statSync(databaseFile).size;
  say("dump", { tables: tables.length, rows: Object.values(counts).reduce((a, b) => a + b, 0), bytes });

  // ---- 4. believable?
  if (dumpIsSuspicious({ bytes, floor })) throw new Error(`the dump is ${bytes} bytes, under the floor of ${floor}: refusing it`);
  const listing = (await run("pg_restore", ["--list", databaseFile])).stdout;
  const dataEntries = new Set(tableDataEntries(listing));
  const notInDump = Object.keys(counts).filter(table => !dataEntries.has(table));
  if (notInDump.length) throw new Error(`the dump has no data entry for ${notInDump.length} table(s), e.g. ${notInDump.slice(0, 5).join(", ")}`);
  manifest.tables = tables.length; manifest.rows = Object.values(counts).reduce((a, b) => a + b, 0);

  // ---- 5. the files of the storage buckets
  let storageFile = null;
  if (withStorage) {
    const { S3Client, ListBucketsCommand, ListObjectsV2Command, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: env.STORAGE_S3_REGION || "us-east-1", endpoint: env.STORAGE_S3_ENDPOINT, forcePathStyle: true, credentials: { accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID, secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY } });
    const root = path.join(out, "storage");
    const files = [];
    for (const bucket of (await s3.send(new ListBucketsCommand({}))).Buckets ?? []) {
      let token;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket.Name, ContinuationToken: token }));
        for (const object of page.Contents ?? []) {
          if (object.Key.endsWith("/")) continue;
          const target = path.join(root, bucket.Name, object.Key);
          if (!path.resolve(target).startsWith(path.resolve(root) + path.sep)) throw new Error("an object key leaves the backup folder: refusing it");
          mkdirSync(path.dirname(target), { recursive: true });
          const body = (await s3.send(new GetObjectCommand({ Bucket: bucket.Name, Key: object.Key }))).Body;
          await pipeline(body, createWriteStream(target));
          files.push({ bucket: bucket.Name, key: object.Key, bytes: statSync(target).size, sha256: await sha256(target) });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    }
    mkdirSync(root, { recursive: true });
    await writeFile(path.join(root, "MANIFEST.json"), JSON.stringify(files, null, 1));
    storageFile = path.join(out, "storage.tar.gz");
    await run("tar", ["-czf", storageFile, "-C", out, "storage"]);
    rmSync(root, { recursive: true, force: true });
    manifest.storageObjects = files.length; manifest.storageBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    say("storage", { objects: files.length, bytes: manifest.storageBytes });
    if ("storage.objects" in counts && counts["storage.objects"] !== files.length) manifest.storageMismatch = { database: counts["storage.objects"], files: files.length };
  }

  // ---- 6. encrypt, then remove the plain files
  const encrypt = async file => {
    const target = `${file}.gpg`;
    await run("gpg", ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--symmetric", "--cipher-algo", "AES256", "--s2k-mode", "3", "--s2k-digest-algo", "SHA512", "--s2k-count", "65011712", "--output", target, file], { input: env.BACKUP_ENCRYPTION_PASSPHRASE });
    return target;
  };
  const encryptedDatabase = await encrypt(databaseFile);
  const encryptedStorage = storageFile ? await encrypt(storageFile) : null;
  for (const file of [encryptedDatabase, encryptedStorage].filter(Boolean)) manifest.files[path.basename(file)] = { bytes: statSync(file).size, sha256: await sha256(file) };
  rmSync(databaseFile, { force: true });
  if (storageFile) rmSync(storageFile, { force: true });
  say("encrypted", manifest.files);
  manifest.finishedAt = new Date().toISOString();
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1));

  // ---- 7. restore proof: decrypt again, restore into a scratch database on ANOTHER server, compare every table's exact count
  const plainAgain = path.join(out, `.restore-${randomBytes(4).toString("hex")}.dump`);
  await run("gpg", ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--decrypt", "--output", plainAgain, encryptedDatabase], { input: env.BACKUP_ENCRYPTION_PASSPHRASE });
  const adminUrl = env.BACKUP_RESTORE_ADMIN_URL;
  const scratchName = `restore_check_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl, ssl: sslFor(adminUrl) });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${quote(scratchName)}`);
    const scratchUrl = new URL(adminUrl); scratchUrl.pathname = `/${scratchName}`;
    // a plain PostgreSQL has none of Supabase's roles and extensions; the dump needs the names to exist (it is restored without owners and privileges)
    const scratch = new pg.Client({ connectionString: scratchUrl.toString(), ssl: sslFor(adminUrl) });
    await scratch.connect();
    try {
      if (schemas.some(schema => ["auth", "storage"].includes(schema))) {
        for (const role of ["anon", "authenticated", "service_role", "authenticator", "supabase_auth_admin", "supabase_storage_admin", "supabase_admin", "dashboard_user", "pgbouncer"]) await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE ${role} NOLOGIN; END IF; END $$`);
        await scratch.query('CREATE SCHEMA IF NOT EXISTS extensions');
        for (const extension of ["pgcrypto", "uuid-ossp"]) await scratch.query(`CREATE EXTENSION IF NOT EXISTS "${extension}" SCHEMA extensions`).catch(() => undefined);
      }
      const restored = await run("pg_restore", ["--no-owner", "--no-privileges", `--dbname=${scratchName}`, plainAgain], { envExtra: libpq(scratchUrl.toString()), quiet: true });
      const errors = restored.stderr.split("\n").filter(line => /error/i.test(line) && !/schema "public" already exists/.test(line) && !/errors ignored on restore/.test(line)); // `public` exists in every database; that one is not a fault
      const after = {};
      for (const name of Object.keys(counts)) {
        const [schema, ...rest] = name.split("."); const table = rest.join(".");
        const exists = (await scratch.query("SELECT to_regclass($1) IS NOT NULL AS present", [`${quote(schema)}.${quote(table)}`])).rows[0].present;
        if (exists) after[name] = Number((await scratch.query(`SELECT count(*)::bigint AS n FROM ${quote(schema)}.${quote(table)}`)).rows[0].n);
      }
      const verdict = compareCounts(counts, after);
      manifest.restoreProof = { ok: verdict.ok, tables: verdict.tables, rows: verdict.rows, missing: verdict.missing, different: verdict.different, restoreErrors: errors.length };
      say("restore-proof", { ok: verdict.ok, tables: verdict.tables, rows: verdict.rows, missing: verdict.missing.slice(0, 10), different: verdict.different.slice(0, 10), restoreErrors: errors.length, firstErrors: errors.slice(0, 5).map(line => line.slice(0, 200)) });
      if (!verdict.ok) process.exitCode = 1;
    } finally { await scratch.end().catch(() => undefined); }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${quote(scratchName)} WITH (FORCE)`).catch(() => undefined);
    await admin.end().catch(() => undefined);
    rmSync(plainAgain, { force: true });
  }
  writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
  if (manifest.storageMismatch) { say("storage-mismatch", manifest.storageMismatch); process.exitCode = 1; }
} catch (error) {
  await source.query("ROLLBACK").catch(() => undefined);
  fail(String(error?.message ?? error).slice(0, 500));
} finally {
  await source.end().catch(() => undefined);
  // whatever happened, no unencrypted copy of the data stays in the folder the workflow uploads
  for (const file of readdirSync(out)) if (file.startsWith(".ca-") || file === "database.dump" || file === "storage.tar.gz" || file.startsWith(".restore-") || file === "storage") rmSync(path.join(out, file), { force: true, recursive: true });
}

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import pg from "pg";
import { parseBackupKey, readEncryptedBackupText, writeEncryptedBackup } from "./backupCrypto";
import { storageEndpoint } from "../storage";
import { dumpDatabase, readDumpMarkers, type DumpSummary } from "./sqlDump";

export type ExportOptions = {
  databaseUrl: string;
  encryptionKeyHex: string | undefined;
  outDir: string;
  only?: string[];
  now?: Date;
};

export type ExportResult = { file: string; bytes: number; sha256: string; tables: number; rows: number; databaseName: string };

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/**
 * Opens a connection for the dump. It only reads, but it must see every row, so it is the table owner (BACKUP_DATABASE_URL), not the
 * application role, whose row-level security would hand back nothing without a request context.
 */
export async function connectForBackup(databaseUrl: string): Promise<pg.Client> {
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(databaseUrl).hostname);
  const client = new pg.Client({ connectionString: databaseUrl, ssl: local || process.env.DATABASE_SSL === "off" ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_VERIFY !== "off" } });
  await client.connect();
  return client;
}

/**
 * Dump -> gzip -> AES-256-GCM -> file, then read the file back with the key and check it against what was written. A backup nobody has
 * read back is a hope, so the file counts as done only after it decrypts, ends with its completion line, and its per-table counts add up.
 */
export async function exportDatabase(options: ExportOptions): Promise<ExportResult> {
  const key = parseBackupKey(options.encryptionKeyHex);
  const connection = await connectForBackup(options.databaseUrl);
  try {
    const { rows: [{ name }] } = await connection.query<{ name: string }>("SELECT current_database() AS name");
    const file = join(options.outDir, `project_os-${stamp(options.now ?? new Date())}.sql.gz.enc`);
    await mkdir(dirname(file), { recursive: true });
    const summary: DumpSummary = { tables: [], totalRows: 0 };
    await writeEncryptedBackup(dumpDatabase(connection, { only: options.only }, summary), file, key);

    const markers = readDumpMarkers(await readEncryptedBackupText(file, key));
    if (!markers.complete) throw new Error("Backup verification failed: the file has no completion line");
    if (markers.complete.tables !== summary.tables.length || markers.complete.rows !== summary.totalRows) throw new Error("Backup verification failed: the completion line does not match what was written");
    if (markers.tables.length !== summary.tables.length || markers.tables.some((table, index) => table.name !== summary.tables[index].name || table.rows !== summary.tables[index].rows)) throw new Error("Backup verification failed: per-table counts differ from what was written");

    const sha256 = await new Promise<string>((resolve, reject) => { const hash = createHash("sha256"); createReadStream(file).on("data", chunk => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))).on("error", reject); });
    return { file, bytes: (await stat(file)).size, sha256, tables: summary.tables.length, rows: summary.totalRows, databaseName: name };
  } finally {
    await connection.end();
  }
}

export type BackupTarget = { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; bucket: string };

/** The Supabase Storage S3 connection plus a private bucket for backups (BACKUP_BUCKET), kept apart from the bucket that holds company files. */
export function backupTargetFromEnvironment(env: NodeJS.ProcessEnv = process.env): BackupTarget {
  const target = { endpoint: env.STORAGE_S3_ENDPOINT ?? "", region: env.STORAGE_S3_REGION ?? "", accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY ?? "", bucket: env.BACKUP_BUCKET ?? "" };
  const missing = ([["STORAGE_S3_ENDPOINT", target.endpoint], ["STORAGE_S3_REGION", target.region], ["STORAGE_S3_ACCESS_KEY_ID", target.accessKeyId], ["STORAGE_S3_SECRET_ACCESS_KEY", target.secretAccessKey], ["BACKUP_BUCKET", target.bucket]] as const).filter(([, value]) => !value).map(([label]) => label);
  if (missing.length) throw new Error(`Backup upload is not configured: set ${missing.join(", ")}`);
  return { ...target, endpoint: storageEndpoint(target.endpoint) };
}

/** The object key keeps backups in dated folders under `backups/`; a retention job (or the bucket's own lifecycle) on that prefix is what expires old ones. */
export const backupObjectKey = (file: string, now: Date) => `backups/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${file.split("/").pop()}`;

export async function uploadBackup(file: string, target: BackupTarget, now: Date = new Date(), client?: Pick<S3Client, "send">): Promise<{ key: string; bucket: string }> {
  const s3 = client ?? new S3Client({ region: target.region, endpoint: target.endpoint, forcePathStyle: true, credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey } });
  const key = backupObjectKey(file, now);
  await s3.send(new PutObjectCommand({ Bucket: target.bucket, Key: key, Body: createReadStream(file), ContentLength: (await stat(file)).size, ContentType: "application/octet-stream" }));
  return { key, bucket: target.bucket };
}

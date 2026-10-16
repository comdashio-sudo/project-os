import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import mysql, { type Connection } from "mysql2/promise";
import { parseBackupKey, readEncryptedBackupText, writeEncryptedBackup } from "./backupCrypto";
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

/** Opens a read-only-purpose connection: the dump needs SELECT and SHOW only, so a backup account should hold nothing more. */
export async function connectForBackup(databaseUrl: string): Promise<Connection> {
  return mysql.createConnection({ uri: databaseUrl, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, charset: "utf8mb4" });
}

/**
 * Dump -> gzip -> AES-256-GCM -> file, then read the file back with the key and check it against what was written. A backup nobody has
 * read back is a hope, so the file counts as done only after it decrypts, ends with its completion line, and its per-table counts add up.
 */
export async function exportDatabase(options: ExportOptions): Promise<ExportResult> {
  const key = parseBackupKey(options.encryptionKeyHex);
  const connection = await connectForBackup(options.databaseUrl);
  try {
    const [[{ name }]] = (await connection.query("SELECT DATABASE() AS name")) as unknown as [[{ name: string }]];
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

export type R2Target = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

export function r2TargetFromEnvironment(env: NodeJS.ProcessEnv = process.env): R2Target {
  const target = { accountId: env.R2_ACCOUNT_ID ?? "", accessKeyId: env.R2_ACCESS_KEY_ID ?? "", secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? "", bucket: env.BACKUP_R2_BUCKET || env.R2_BUCKET || "" };
  const missing = ([["R2_ACCOUNT_ID", target.accountId], ["R2_ACCESS_KEY_ID", target.accessKeyId], ["R2_SECRET_ACCESS_KEY", target.secretAccessKey], ["BACKUP_R2_BUCKET (or R2_BUCKET)", target.bucket]] as const).filter(([, value]) => !value).map(([label]) => label);
  if (missing.length) throw new Error(`Backup upload is not configured: set ${missing.join(", ")}`);
  return target;
}

/** The object key keeps backups in dated folders under `backups/`; a bucket lifecycle rule on that prefix is what expires old ones. */
export const backupObjectKey = (file: string, now: Date) => `backups/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${file.split("/").pop()}`;

export async function uploadBackup(file: string, target: R2Target, now: Date = new Date(), client?: Pick<S3Client, "send">): Promise<{ key: string; bucket: string }> {
  const s3 = client ?? new S3Client({ region: "auto", endpoint: `https://${target.accountId}.r2.cloudflarestorage.com`, forcePathStyle: true, credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey } });
  const key = backupObjectKey(file, now);
  await s3.send(new PutObjectCommand({ Bucket: target.bucket, Key: key, Body: createReadStream(file), ContentLength: (await stat(file)).size, ContentType: "application/octet-stream" }));
  return { key, bucket: target.bucket };
}

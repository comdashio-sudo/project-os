import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, rename, rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";

// File layout: MAGIC (7) + IV (12) + AES-256-GCM ciphertext of the gzipped dump + auth tag (16). The magic and IV are authenticated too, so a
// file that was altered anywhere, cut short, or opened with the wrong key fails to decrypt: it never yields a partial, plausible dump.
export const MAGIC = Buffer.from("POSBK1\n");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
export const HEADER_LENGTH = MAGIC.length + IV_LENGTH;

export class BackupKeyError extends Error {
  constructor() { super("BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes). Make one with: node --import tsx scripts/export-database.mjs --generate-key"); this.name = "BackupKeyError"; }
}

export function parseBackupKey(hex: string | undefined): Buffer {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex.trim())) throw new BackupKeyError();
  return Buffer.from(hex.trim(), "hex");
}

export const generateBackupKey = () => randomBytes(32).toString("hex");

class EncryptTransform extends Transform {
  private readonly cipher;
  constructor(key: Buffer) {
    super();
    const iv = randomBytes(IV_LENGTH);
    const header = Buffer.concat([MAGIC, iv]);
    this.cipher = createCipheriv("aes-256-gcm", key, iv);
    this.cipher.setAAD(header);
    this.push(header);
  }
  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void) { callback(null, this.cipher.update(chunk)); }
  _flush(callback: (error?: Error | null, data?: Buffer) => void) { const last = this.cipher.final(); callback(null, Buffer.concat([last, this.cipher.getAuthTag()])); }
}

/** gzip + encrypt a stream of SQL text into `path`. The file appears under its name only once it is complete. */
export async function writeEncryptedBackup(source: AsyncIterable<string | Buffer>, path: string, key: Buffer): Promise<void> {
  const partial = `${path}.partial`;
  try {
    await pipeline(Readable.from(source), createGzip(), new EncryptTransform(key), createWriteStream(partial, { mode: 0o600 }));
    await rename(partial, path);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

/** Decrypts and gunzips `path` into a stream of SQL text; rejects (after the last byte) if anything about the file is not authentic. */
export async function openEncryptedBackup(path: string, key: Buffer): Promise<Readable> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    if (size < HEADER_LENGTH + TAG_LENGTH) throw new Error("Backup file is too short to be valid");
    const header = Buffer.alloc(HEADER_LENGTH); const tag = Buffer.alloc(TAG_LENGTH);
    await handle.read(header, 0, HEADER_LENGTH, 0);
    await handle.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a PROJECT OS backup file");
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length));
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const output = new Transform({ transform(chunk, _e, cb) { cb(null, chunk); } });
    pipeline(createReadStream(path, { start: HEADER_LENGTH, end: size - TAG_LENGTH - 1 }), decipher, createGunzip(), output).catch(error => output.destroy(error));
    return output;
  } finally {
    await handle.close();
  }
}

/** Decrypts into a plain .sql file (written beside it first, renamed on success, so a failed decryption leaves nothing that looks like a backup). */
export async function decryptBackupToFile(path: string, outPath: string, key: Buffer): Promise<void> {
  const partial = `${outPath}.partial`;
  try {
    await pipeline(await openEncryptedBackup(path, key), createWriteStream(partial, { mode: 0o600 }));
    await rename(partial, outPath);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

export async function readEncryptedBackupText(path: string, key: Buffer): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await openEncryptedBackup(path, key)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

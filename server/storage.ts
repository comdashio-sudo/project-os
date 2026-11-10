// Object storage on Supabase Storage through its S3-compatible API — or, while the S3 variables are absent, inside the database (D-79, see storageMode).
//
// Files are stored by key; the database keeps the key, never a URL. A download
// is a short-lived signed URL minted for a caller that already passed the
// authorization checks in db.ts. There is no unauthenticated download route.
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";
import { logWarn } from "./_core/logger";
import { createDatabaseStorage } from "./dbStorage";

export const SIGNED_URL_TTL_SECONDS = 900;
/** The largest file a user may upload for import. It travels straight from the browser to Storage (not through a function, whose request body stops at 4.5 MB). */
export const MAX_DIRECT_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_KEY_LENGTH = 1024;

export type StorageBody = Buffer | Uint8Array | string;

export type StorageDependencies = {
  bucket: string;
  send: (command: PutObjectCommand | DeleteObjectCommand | HeadObjectCommand | GetObjectCommand | ListObjectsV2Command) => Promise<unknown>;
  presign: (command: GetObjectCommand | PutObjectCommand, options: { expiresIn: number }) => Promise<string>;
};

export function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (!key || key.length > MAX_KEY_LENGTH) throw new Error("Storage key is empty or too long");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(key)) throw new Error("Storage key contains control characters");
  if (key.split("/").some(segment => segment === ".." || segment === ".")) throw new Error("Storage key contains a relative path segment");
  return key;
}

export function appendHashSuffix(relKey: string, hash = randomUUID().replace(/-/g, "").slice(0, 8)): string {
  const lastSlash = relKey.lastIndexOf("/");
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot <= lastSlash + 1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export function createStorage(dependencies: StorageDependencies) {
  const signedGetUrl = (key: string) =>
    dependencies.presign(new GetObjectCommand({ Bucket: dependencies.bucket, Key: key }), { expiresIn: SIGNED_URL_TTL_SECONDS });

  return {
    async storagePut(relKey: string, data: StorageBody, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
      const key = appendHashSuffix(normalizeKey(relKey));
      await dependencies.send(
        new PutObjectCommand({
          Bucket: dependencies.bucket,
          Key: key,
          Body: typeof data === "string" ? data : Buffer.from(data),
          ContentType: contentType,
        }),
      );
      return { key, url: await signedGetUrl(key) };
    },

    async storageGet(relKey: string): Promise<{ key: string; url: string }> {
      const key = normalizeKey(relKey);
      return { key, url: await signedGetUrl(key) };
    },

    async storageGetSignedUrl(relKey: string): Promise<string> {
      return signedGetUrl(normalizeKey(relKey));
    },

    /** A short-lived URL the browser PUTs the file to. The key is chosen by the server; the caller only holds the URL for this one object. */
    async storageCreateUploadUrl(relKey: string, contentType = "application/octet-stream"): Promise<{ key: string; url: string; headers: Record<string, string>; expiresInSeconds: number }> {
      const key = normalizeKey(relKey);
      const url = await dependencies.presign(new PutObjectCommand({ Bucket: dependencies.bucket, Key: key, ContentType: contentType }), { expiresIn: SIGNED_URL_TTL_SECONDS });
      return { key, url, headers: { "Content-Type": contentType }, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
    },

    /** Size of an object that was uploaded directly, or null when nothing is there (the upload never happened or was removed). */
    async storageHead(relKey: string): Promise<{ size: number; contentType: string | null } | null> {
      try {
        const head = await dependencies.send(new HeadObjectCommand({ Bucket: dependencies.bucket, Key: normalizeKey(relKey) })) as { ContentLength?: number; ContentType?: string };
        return { size: Number(head.ContentLength ?? 0), contentType: head.ContentType ?? null };
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number }; name?: string }).$metadata?.httpStatusCode;
        if (status === 404 || (error as { name?: string }).name === "NotFound" || (error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },

    /** The whole object, read by the server for processing. Bounded by the caller's size check; never exposed to a user. */
    async storageRead(relKey: string): Promise<Buffer> {
      const response = await dependencies.send(new GetObjectCommand({ Bucket: dependencies.bucket, Key: normalizeKey(relKey) })) as { Body?: { transformToByteArray: () => Promise<Uint8Array> } };
      if (!response.Body) throw new Error("Storage object has no body");
      return Buffer.from(await response.Body.transformToByteArray());
    },

    /** Every object under a prefix with its last-modified time (paged). Used by the sweep that removes uploads nobody registered. */
    async storageList(prefix: string): Promise<Array<{ key: string; lastModified: Date | null }>> {
      const found: Array<{ key: string; lastModified: Date | null }> = [];
      let token: string | undefined;
      do {
        const page = await dependencies.send(new ListObjectsV2Command({ Bucket: dependencies.bucket, Prefix: normalizeKey(prefix), ContinuationToken: token })) as { Contents?: Array<{ Key?: string; LastModified?: Date }>; IsTruncated?: boolean; NextContinuationToken?: string };
        for (const item of page.Contents ?? []) if (item.Key) found.push({ key: item.Key, lastModified: item.LastModified ?? null });
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return found;
    },

    async storageDelete(relKey: string): Promise<void> {
      await dependencies.send(new DeleteObjectCommand({ Bucket: dependencies.bucket, Key: normalizeKey(relKey) }));
    },
  };
}

export type StorageConfiguration = { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string; bucket: string };

/** The S3 connection values of the Supabase project (Project Settings > Storage > S3 Connection). Names what is missing, never a value. */
export function storageConfiguration(env: Pick<typeof ENV, "storageS3Endpoint" | "storageS3Region" | "storageS3AccessKeyId" | "storageS3SecretAccessKey" | "storageBucket"> = ENV): StorageConfiguration {
  const missing = (
    [
      ["STORAGE_S3_ENDPOINT", env.storageS3Endpoint],
      ["STORAGE_S3_REGION", env.storageS3Region],
      ["STORAGE_S3_ACCESS_KEY_ID", env.storageS3AccessKeyId],
      ["STORAGE_S3_SECRET_ACCESS_KEY", env.storageS3SecretAccessKey],
      ["STORAGE_BUCKET", env.storageBucket],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) throw new Error(`Storage config missing: set ${missing.join(", ")}`);
  return { endpoint: storageEndpoint(env.storageS3Endpoint), region: env.storageS3Region, accessKeyId: env.storageS3AccessKeyId, secretAccessKey: env.storageS3SecretAccessKey, bucket: env.storageBucket };
}

/**
 * The endpoint is https, or http on this machine (a local rehearsal against a fake S3). Any other plain-http address is refused at the
 * first storage call rather than quietly sending company files across the network unencrypted.
 */
export function storageEndpoint(endpoint: string): string {
  let parsed: URL;
  try { parsed = new URL(endpoint); } catch { throw new Error("STORAGE_S3_ENDPOINT is not a valid URL"); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) throw new Error("STORAGE_S3_ENDPOINT must be an https address (http only for 127.0.0.1 or localhost)");
  return parsed.toString().replace(/\/+$/, "");
}

export function createS3Storage(configuration: StorageConfiguration = storageConfiguration()) {
  const client = new S3Client({
    region: configuration.region,
    endpoint: configuration.endpoint,
    forcePathStyle: true,
    // Since SDK 3.729 the client adds a CRC32 checksum to every request and, on a presigned PUT, bakes the checksum of an EMPTY body (AAAAAA==) into the URL:
    // the browser's real upload then fails the digest check. Checksums are computed only where the operation requires them.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey },
  });
  return createStorage({
    bucket: configuration.bucket,
    send: command => client.send(command as never),
    presign: (command, options) => getSignedUrl(client, command, options),
  });
}

/**
 * D-79: S3 when all five S3 variables are set; otherwise the files live in the database (server/dbStorage.ts), with the same functions below — so the product
 * works with no new variable, and setting the S3 ones later moves new files there. Which one, and what is missing, is said once in the log (names, never values).
 */
export type StorageMode = "s3" | "database";
export function storageMode(env: Parameters<typeof storageConfiguration>[0] = ENV): StorageMode {
  try { storageConfiguration(env); return "s3"; } catch { return "database"; }
}
let defaultStorage: ReturnType<typeof createS3Storage> | null = null;
const storage = () => {
  if (defaultStorage) return defaultStorage;
  if (storageMode() === "s3") return (defaultStorage = createS3Storage());
  try { storageConfiguration(); } catch (error) { logWarn("storage.database_mode", { reason: (error as Error).message }); }
  return (defaultStorage = createDatabaseStorage());
};

export const storagePut = (relKey: string, data: StorageBody, contentType?: string) => storage().storagePut(relKey, data, contentType);
export const storageGet = (relKey: string) => storage().storageGet(relKey);
export const storageGetSignedUrl = (relKey: string) => storage().storageGetSignedUrl(relKey);
export const storageDelete = (relKey: string) => storage().storageDelete(relKey);
export const storageCreateUploadUrl = (relKey: string, contentType?: string) => storage().storageCreateUploadUrl(relKey, contentType);
export const storageList = (prefix: string) => storage().storageList(prefix);
export const storageHead = (relKey: string) => storage().storageHead(relKey);
export const storageRead = (relKey: string) => storage().storageRead(relKey);

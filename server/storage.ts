// Object storage on Supabase Storage through its S3-compatible API.
//
// Files are stored by key; the database keeps the key, never a URL. A download
// is a short-lived signed URL minted for a caller that already passed the
// authorization checks in db.ts. There is no unauthenticated download route.
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

export const SIGNED_URL_TTL_SECONDS = 900;
const MAX_KEY_LENGTH = 1024;

export type StorageBody = Buffer | Uint8Array | string;

export type StorageDependencies = {
  bucket: string;
  send: (command: PutObjectCommand | DeleteObjectCommand) => Promise<unknown>;
  presign: (command: GetObjectCommand, options: { expiresIn: number }) => Promise<string>;
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
    credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey },
  });
  return createStorage({
    bucket: configuration.bucket,
    send: command => client.send(command as never),
    presign: (command, options) => getSignedUrl(client, command, options),
  });
}

let defaultStorage: ReturnType<typeof createS3Storage> | null = null;
const storage = () => (defaultStorage ??= createS3Storage());

export const storagePut = (relKey: string, data: StorageBody, contentType?: string) => storage().storagePut(relKey, data, contentType);
export const storageGet = (relKey: string) => storage().storageGet(relKey);
export const storageGetSignedUrl = (relKey: string) => storage().storageGetSignedUrl(relKey);
export const storageDelete = (relKey: string) => storage().storageDelete(relKey);

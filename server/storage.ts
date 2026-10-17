// Object storage on Cloudflare R2 through its S3-compatible API.
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

export function r2Configuration(env: Pick<typeof ENV, "r2AccountId" | "r2AccessKeyId" | "r2SecretAccessKey" | "r2Bucket"> = ENV) {
  const missing = (
    [
      ["R2_ACCOUNT_ID", env.r2AccountId],
      ["R2_ACCESS_KEY_ID", env.r2AccessKeyId],
      ["R2_SECRET_ACCESS_KEY", env.r2SecretAccessKey],
      ["R2_BUCKET", env.r2Bucket],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) throw new Error(`Storage config missing: set ${missing.join(", ")}`);
  return { accountId: env.r2AccountId, accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey, bucket: env.r2Bucket };
}

/**
 * R2_TEST_ENDPOINT lets a rehearsal point storage at a fake S3 on this machine (like RESEND_API_URL does for mail). It is accepted ONLY for a loopback
 * address over http: any other value is refused at the first storage call rather than quietly sending company files somewhere else.
 */
export function storageEndpoint(accountId: string, testEndpoint: string | undefined = process.env.R2_TEST_ENDPOINT): string {
  if (!testEndpoint) return `https://${accountId}.r2.cloudflarestorage.com`;
  let parsed: URL;
  try { parsed = new URL(testEndpoint); } catch { throw new Error("R2_TEST_ENDPOINT is not a valid URL"); }
  if (parsed.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) throw new Error("R2_TEST_ENDPOINT must be an http://127.0.0.1 or http://localhost address");
  return parsed.origin;
}

export function createR2Storage(configuration = r2Configuration()) {
  const client = new S3Client({
    region: "auto",
    endpoint: storageEndpoint(configuration.accountId),
    forcePathStyle: true,
    credentials: { accessKeyId: configuration.accessKeyId, secretAccessKey: configuration.secretAccessKey },
  });
  return createStorage({
    bucket: configuration.bucket,
    send: command => client.send(command as never),
    presign: (command, options) => getSignedUrl(client, command, options),
  });
}

let defaultStorage: ReturnType<typeof createR2Storage> | null = null;
const storage = () => (defaultStorage ??= createR2Storage());

export const storagePut = (relKey: string, data: StorageBody, contentType?: string) => storage().storagePut(relKey, data, contentType);
export const storageGet = (relKey: string) => storage().storageGet(relKey);
export const storageGetSignedUrl = (relKey: string) => storage().storageGetSignedUrl(relKey);
export const storageDelete = (relKey: string) => storage().storageDelete(relKey);

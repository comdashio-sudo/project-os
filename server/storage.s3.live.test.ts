import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createS3Storage } from "./storage";

// Live proof against a real Supabase Storage bucket through its S3 connection. It needs a bucket meant for tests
// (STORAGE_TEST_BUCKET, never the operational STORAGE_BUCKET); without it the test skips. See docs/GO_LIVE.md.
const env = process.env;
const live = Boolean(env.STORAGE_S3_ENDPOINT && env.STORAGE_S3_REGION && env.STORAGE_S3_ACCESS_KEY_ID && env.STORAGE_S3_SECRET_ACCESS_KEY && env.STORAGE_TEST_BUCKET);

describe.skipIf(!live)("Supabase Storage (S3), live", () => {
  it("uploads, downloads through the signed URL, and deletes", async () => {
    const storage = createS3Storage({
      endpoint: env.STORAGE_S3_ENDPOINT!,
      region: env.STORAGE_S3_REGION!,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
      bucket: env.STORAGE_TEST_BUCKET!,
    });
    const body = `synthetic-${randomUUID()}`;
    const { key, url } = await storage.storagePut(`live-tests/${randomUUID()}/note.txt`, body, "text/plain");
    try {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(body);
    } finally {
      await storage.storageDelete(key);
    }
    const afterDelete = await fetch(await storage.storageGetSignedUrl(key));
    expect(afterDelete.status).toBeGreaterThanOrEqual(400);
  });
});

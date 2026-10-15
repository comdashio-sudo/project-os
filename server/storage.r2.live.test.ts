import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createR2Storage } from "./storage";

// Live proof against a real R2 bucket. It needs the owner's keys and a bucket
// meant for tests (R2_TEST_BUCKET, never the operational R2_BUCKET); without
// them it skips. See docs/OWNER_ACTIONS.md section 4.
const env = process.env;
const live = Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_TEST_BUCKET);

describe.skipIf(!live)("R2 storage, live", () => {
  it("uploads, downloads through the signed URL, and deletes", async () => {
    const storage = createR2Storage({
      accountId: env.R2_ACCOUNT_ID!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      bucket: env.R2_TEST_BUCKET!,
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
    expect(afterDelete.status).toBe(404);
  });
});

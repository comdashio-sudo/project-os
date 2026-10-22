import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { appendHashSuffix, createS3Storage, createStorage, normalizeKey, SIGNED_URL_TTL_SECONDS, storageConfiguration, storageEndpoint } from "./storage";

function harness() {
  const send = vi.fn(async () => ({}));
  const presign = vi.fn(async (command: GetObjectCommand, options: { expiresIn: number }) => `https://files.example.test/${command.input.Bucket}/${command.input.Key}?ttl=${options.expiresIn}`);
  return { send, presign, storage: createStorage({ bucket: "test-bucket", send, presign }) };
}

describe("storage keys", () => {
  it("strips leading slashes and keeps the path", () => {
    expect(normalizeKey("///tenants/t1/doc.pdf")).toBe("tenants/t1/doc.pdf");
  });

  it("refuses empty, relative, control-character and oversize keys", () => {
    for (const bad of ["", "///", "a/../b", "../a", "a/./b", "a\u0000b", "a\nb", "x".repeat(1025)]) expect(() => normalizeKey(bad), JSON.stringify(bad)).toThrow();
  });

  it("puts the hash before the extension of the file name only", () => {
    expect(appendHashSuffix("tenants/t1/plan.xlsx", "abcd1234")).toBe("tenants/t1/plan_abcd1234.xlsx");
    expect(appendHashSuffix("tenants/t.1/plan", "abcd1234")).toBe("tenants/t.1/plan_abcd1234");
    expect(appendHashSuffix("noext", "abcd1234")).toBe("noext_abcd1234");
  });
});

describe("storage operations", () => {
  it("uploads bytes with the content type and returns the key and a signed download URL", async () => {
    const { send, presign, storage } = harness();
    const result = await storage.storagePut("/tenants/t1/doc.pdf", Buffer.from("pdf-bytes"), "application/pdf");
    expect(result.key).toMatch(/^tenants\/t1\/doc_[0-9a-f]{8}\.pdf$/);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: "test-bucket", Key: result.key, ContentType: "application/pdf" });
    expect(Buffer.from(command.input.Body as Buffer).toString()).toBe("pdf-bytes");
    expect(presign.mock.calls[0][1]).toEqual({ expiresIn: SIGNED_URL_TTL_SECONDS });
    expect(result.url).toBe(`https://files.example.test/test-bucket/${result.key}?ttl=${SIGNED_URL_TTL_SECONDS}`);
  });

  it("uploads text and defaults the content type", async () => {
    const { send, storage } = harness();
    await storage.storagePut("notes/a.txt", "hello");
    expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({ Body: "hello", ContentType: "application/octet-stream" });
  });

  it("never writes a key that fails validation", async () => {
    const { send, storage } = harness();
    await expect(storage.storagePut("tenants/../other/doc.pdf", "x")).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not add a hash when only reading or signing", async () => {
    const { presign, storage } = harness();
    expect(await storage.storageGetSignedUrl("/tenants/t1/doc_ab12cd34.pdf")).toContain("/test-bucket/tenants/t1/doc_ab12cd34.pdf?ttl=900");
    expect((await storage.storageGet("tenants/t1/x.pdf")).key).toBe("tenants/t1/x.pdf");
    expect(presign).toHaveBeenCalledTimes(2);
  });

  it("propagates a storage failure instead of reporting success", async () => {
    const { send, storage } = harness();
    send.mockRejectedValueOnce(new Error("AccessDenied"));
    await expect(storage.storagePut("tenants/t1/doc.pdf", "x")).rejects.toThrow("AccessDenied");
  });

  it("deletes by validated key", async () => {
    const { send, storage } = harness();
    await storage.storageDelete("/tenants/t1/doc.pdf");
    const command = send.mock.calls[0][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: "test-bucket", Key: "tenants/t1/doc.pdf" });
  });
});

const empty = { storageS3Endpoint: "", storageS3Region: "", storageS3AccessKeyId: "", storageS3SecretAccessKey: "", storageBucket: "" };

describe("storage configuration", () => {
  it("names every missing variable and never a value", () => {
    expect(() => storageConfiguration(empty)).toThrow("STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY, STORAGE_BUCKET");
    expect(() => storageConfiguration({ ...empty, storageS3Endpoint: "https://ref0123.storage.supabase.co/storage/v1/s3", storageS3Region: "eu-west-1", storageS3AccessKeyId: "key-id", storageBucket: "b" })).toThrow(/^Storage config missing: set STORAGE_S3_SECRET_ACCESS_KEY$/);
  });

  it("builds an S3 client against the project's Supabase Storage endpoint without any network call", async () => {
    const storage = createS3Storage(storageConfiguration({ storageS3Endpoint: "https://ref0123.storage.supabase.co/storage/v1/s3", storageS3Region: "eu-west-1", storageS3AccessKeyId: "AKEXAMPLE", storageS3SecretAccessKey: "example-secret-value", storageBucket: "b1" }));
    const url = new URL(await storage.storageGetSignedUrl("tenants/t1/doc.pdf"));
    expect(url.host).toBe("ref0123.storage.supabase.co");
    expect(url.pathname).toBe("/storage/v1/s3/b1/tenants/t1/doc.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe(String(SIGNED_URL_TTL_SECONDS));
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/eu-west-1/s3/");
    expect(url.toString()).not.toContain("example-secret-value");
  });
});

describe("storageEndpoint", () => {
  it("keeps the Supabase endpoint, path included, without a trailing slash", () => {
    expect(storageEndpoint("https://ref0123.storage.supabase.co/storage/v1/s3/")).toBe("https://ref0123.storage.supabase.co/storage/v1/s3");
  });
  it("accepts plain http only on this machine (a local rehearsal against a fake S3)", () => {
    expect(storageEndpoint("http://127.0.0.1:9123")).toBe("http://127.0.0.1:9123");
    expect(storageEndpoint("http://localhost:9123")).toBe("http://localhost:9123");
  });
  it("refuses anything that would send files unencrypted across a network, or that is not a URL", () => {
    for (const bad of ["http://evil.example.test:9000", "http://127.0.0.1.evil.example.test", "ftp://127.0.0.1", "not a url"]) expect(() => storageEndpoint(bad), bad).toThrow(/STORAGE_S3_ENDPOINT/);
  });
});

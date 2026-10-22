import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { appendHashSuffix, createS3Storage, createStorage, MAX_DIRECT_UPLOAD_BYTES, normalizeKey, SIGNED_URL_TTL_SECONDS, storageConfiguration, storageEndpoint } from "./storage";

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

describe("direct upload operations", () => {
  it("fixes the direct-upload ceiling at 50 MB", () => {
    expect(MAX_DIRECT_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
  });

  it("mints a PUT URL for exactly one key, with the content type the browser must send", async () => {
    const { presign, storage } = harness();
    const upload = await storage.storageCreateUploadUrl("/imports/t1/p1/pending/abc/schedule.xer", "text/plain");
    expect(upload).toMatchObject({ key: "imports/t1/p1/pending/abc/schedule.xer", headers: { "Content-Type": "text/plain" }, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
    const command = presign.mock.calls[0][0] as unknown as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({ Bucket: "test-bucket", Key: "imports/t1/p1/pending/abc/schedule.xer", ContentType: "text/plain" });
    await expect(storage.storageCreateUploadUrl("../other-tenant/file.xer")).rejects.toThrow(/relative path/);
  });

  it("reports an object's size, and null (not an error) when nothing was uploaded", async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand && command.input.Key === "there") return { ContentLength: 31_468_176, ContentType: "text/plain" };
      throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } });
    });
    const storage = createStorage({ bucket: "b", send, presign: vi.fn() });
    expect(await storage.storageHead("there")).toEqual({ size: 31_468_176, contentType: "text/plain" });
    expect(await storage.storageHead("missing")).toBeNull();
    const broken = createStorage({ bucket: "b", send: async () => { throw Object.assign(new Error("denied"), { $metadata: { httpStatusCode: 403 } }); }, presign: vi.fn() });
    await expect(broken.storageHead("x")).rejects.toThrow("denied");
  });

  it("reads an object whole, and pages through a listing", async () => {
    const pages = [{ Contents: [{ Key: "imports/a", LastModified: new Date(1) }], IsTruncated: true, NextContinuationToken: "t1" }, { Contents: [{ Key: "imports/b", LastModified: new Date(2) }], IsTruncated: false }];
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } };
      if (command instanceof ListObjectsV2Command) return pages[command.input.ContinuationToken ? 1 : 0];
      return {};
    });
    const storage = createStorage({ bucket: "b", send, presign: vi.fn() });
    expect([...await storage.storageRead("k")]).toEqual([1, 2, 3]);
    expect((await storage.storageList("imports/")).map(item => item.key)).toEqual(["imports/a", "imports/b"]);
  });

  it("does not bake a checksum of an empty body into a presigned PUT (it made every real browser upload fail the digest check)", async () => {
    const storage = createS3Storage({ endpoint: "http://127.0.0.1:9", region: "eu-west-1", accessKeyId: "AKIAEXAMPLE", secretAccessKey: "example-secret", bucket: "b" });
    const { url } = await storage.storageCreateUploadUrl("imports/t/p/pending/x/file.xer", "text/plain");
    const query = new URL(url).searchParams;
    expect(query.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(query.get("X-Amz-SignedHeaders")).toBe("host");
    expect([...query.keys()].filter(name => name.toLowerCase().includes("checksum"))).toEqual([]);
  });
});

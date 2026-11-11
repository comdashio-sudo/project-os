import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { readStorageToken, signStorageToken, tenantOfKey } from "./dbStorage";
import { partialS3Setup, SIGNED_URL_TTL_SECONDS, storageMode } from "./storage";

// D-79: what decides which storage is used, who owns a key, and what a signed link may open (the database half is dbStorage.database.test.ts).
const TENANT = "a2000000-0000-4000-8000-000000000001";
const S3 = { storageS3Endpoint: "https://s3.example.test", storageS3Region: "r", storageS3AccessKeyId: "id", storageS3SecretAccessKey: "s", storageBucket: "b" };

describe("database storage (D-79)", () => {
  beforeAll(() => { if (ENV.cookieSecret.length < 16) (ENV as { cookieSecret: string }).cookieSecret = "storage-test-secret-0123456789"; });
  const NONE = { storageS3Endpoint: "", storageS3Region: "", storageS3AccessKeyId: "", storageS3SecretAccessKey: "", storageBucket: "" };
  it("S3 when all five S3 variables are set; the database when none is, or when STORAGE_MODE=database says so", () => {
    expect(storageMode(S3)).toBe("s3");
    expect(storageMode(NONE)).toBe("database");
    expect(storageMode({ ...S3, storageMode: "database" })).toBe("database");
  });

  it("NEGATIVE (review of #242): a PARTIAL setup — one to four of the five — is refused, naming what is missing and never a value", () => {
    for (const name of Object.keys(S3)) {
      const env = { ...S3, [name]: "" };
      expect(() => storageMode(env), name).toThrow(/partly configured/);
      expect(partialS3Setup(env)).toHaveLength(1);
    }
    const one = { ...NONE, storageBucket: "only-the-bucket" };
    expect(() => storageMode(one)).toThrow("STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_ACCESS_KEY_ID, STORAGE_S3_SECRET_ACCESS_KEY");
    try { storageMode({ ...S3, storageS3Region: "" }); } catch (error) { expect(String(error)).not.toContain("s3.example.test"); expect(String(error)).not.toMatch(/\bid\b|\bs\b/); }
    expect(partialS3Setup(S3)).toEqual([]); expect(partialS3Setup(NONE)).toEqual([]);
  });

  it("a key belongs to the company in its second segment, for every shape the server builds; anything else has no owner and is refused", () => {
    for (const root of ["uploads", "tenants", "imports", "pmc"]) expect(tenantOfKey(`${root}/${TENANT}/x/y.png`)).toBe(TENANT);
    for (const bad of ["other/" + TENANT + "/x", "uploads/not-a-company/x", "uploads", `uploads//${TENANT}`]) expect(() => tenantOfKey(bad), bad).toThrow(/company/);
  });

  it("a signed link opens one key for one operation for 15 minutes; a forged, expired or other-operation token opens nothing", async () => {
    const token = await signStorageToken({ key: `uploads/${TENANT}/a.png`, op: "get" });
    expect(await readStorageToken(token, "get")).toMatchObject({ key: `uploads/${TENANT}/a.png`, op: "get" });
    expect(await readStorageToken(token, "put")).toBeNull();
    expect(await readStorageToken(`${token.slice(0, -2)}xx`, "get")).toBeNull();
    const old = await signStorageToken({ key: `uploads/${TENANT}/a.png`, op: "get" }, Date.now() - (SIGNED_URL_TTL_SECONDS + 5) * 1000);
    expect(await readStorageToken(old, "get")).toBeNull();
  });

  describe("the signing key (review of #242)", () => {
    const saved = ENV.cookieSecret;
    afterEach(() => { (ENV as { cookieSecret: string }).cookieSecret = saved; });
    it("NEGATIVE: with no secret, or one shorter than 16 characters, no link is signed and none is accepted — not even one signed before", async () => {
      (ENV as { cookieSecret: string }).cookieSecret = "storage-test-secret-0123456789";
      const token = await signStorageToken({ key: `uploads/${TENANT}/a.png`, op: "get" });
      for (const weak of ["", "short-secret-15"]) {
        (ENV as { cookieSecret: string }).cookieSecret = weak;
        await expect(signStorageToken({ key: `uploads/${TENANT}/a.png`, op: "get" })).rejects.toThrow(/16 characters/);
        expect(await readStorageToken(token, "get")).toBeNull();
      }
    });
  });
});

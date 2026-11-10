import { describe, expect, it } from "vitest";
import { readStorageToken, signStorageToken, tenantOfKey } from "./dbStorage";
import { SIGNED_URL_TTL_SECONDS, storageMode } from "./storage";

// D-79: what decides which storage is used, who owns a key, and what a signed link may open (the database half is dbStorage.database.test.ts).
const TENANT = "a2000000-0000-4000-8000-000000000001";
const S3 = { storageS3Endpoint: "https://s3.example.test", storageS3Region: "r", storageS3AccessKeyId: "id", storageS3SecretAccessKey: "s", storageBucket: "b" };

describe("database storage (D-79)", () => {
  it("is chosen when ANY of the five S3 variables is missing, S3 only when all are set", () => {
    expect(storageMode(S3)).toBe("s3");
    for (const name of Object.keys(S3)) expect(storageMode({ ...S3, [name]: "" }), name).toBe("database");
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
});

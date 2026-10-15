import { COOKIE_NAME } from "@shared/const";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "sdk-test-secret-0123456789abcdef";
const user = { id: 7, openId: "email:abc", name: null, email: "engineer@example.test", loginMethod: "email", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

const database = vi.hoisted(() => ({ getUserByOpenId: vi.fn(), upsertUser: vi.fn() }));

async function load(secret = SECRET) {
  vi.resetModules();
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("APP_ID", "");
  vi.doMock("../db", () => database);
  return (await import("./sdk")).sdk;
}
const request = (headers: Record<string, string>) => ({ headers }) as never;
const forged = (secret: string, claims: Record<string, unknown> = { openId: "email:abc", appId: "project-os", name: "Eng" }, expires = "1h") =>
  new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expires).sign(new TextEncoder().encode(secret));

beforeEach(() => { database.getUserByOpenId.mockReset().mockResolvedValue(user); database.upsertUser.mockReset().mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("../db"); });

describe("session tokens", () => {
  it("round-trips a session with the documented shape and a 30-day lifetime", async () => {
    const sdk = await load();
    const token = await sdk.createSessionToken("email:abc", { name: "Eng" });
    expect(await sdk.verifySession(token)).toEqual({ openId: "email:abc", appId: "project-os", name: "Eng" });
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const days = (payload.exp * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("refuses a token signed with another secret, an expired one, a malformed one and one with missing fields", async () => {
    const sdk = await load();
    expect(await sdk.verifySession(await forged("some-other-secret-0123456789"))).toBeNull();
    expect(await sdk.verifySession(await forged(SECRET, undefined, "-1h"))).toBeNull();
    expect(await sdk.verifySession("not.a.jwt")).toBeNull();
    expect(await sdk.verifySession(await forged(SECRET, { openId: "email:abc", appId: "project-os" }))).toBeNull();
    expect(await sdk.verifySession(await forged(SECRET, { openId: "", appId: "project-os", name: "x" }))).toBeNull();
    expect(await sdk.verifySession("")).toBeNull();
    expect(await sdk.verifySession(undefined)).toBeNull();
  });

  it("refuses an unsigned (alg none) token", async () => {
    const sdk = await load();
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    expect(await sdk.verifySession(`${part({ alg: "none", typ: "JWT" })}.${part({ openId: "email:abc", appId: "project-os", name: "Eng", exp: 9999999999 })}.`)).toBeNull();
  });

  it("neither signs nor accepts anything while the secret is too short", async () => {
    const sdk = await load("short");
    await expect(sdk.createSessionToken("email:abc", { name: "Eng" })).rejects.toThrow(/JWT_SECRET/);
    expect(await sdk.verifySession(await forged("short"))).toBeNull();
  });
});

describe("authenticateRequest", () => {
  it("returns the user for a valid session cookie and records the sign-in", async () => {
    const sdk = await load();
    const token = await sdk.createSessionToken("email:abc", { name: "Eng" });
    await expect(sdk.authenticateRequest(request({ cookie: `other=1; ${COOKIE_NAME}=${token}` }))).resolves.toBe(user);
    expect(database.getUserByOpenId).toHaveBeenCalledWith("email:abc");
    expect(database.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "email:abc" }));
  });

  it("refuses a request with no cookie, and ignores an Authorization bearer token", async () => {
    const sdk = await load();
    const token = await sdk.createSessionToken("email:abc", { name: "Eng" });
    await expect(sdk.authenticateRequest(request({}))).rejects.toThrow();
    await expect(sdk.authenticateRequest(request({ authorization: `Bearer ${token}` }))).rejects.toThrow();
    expect(database.getUserByOpenId).not.toHaveBeenCalled();
  });

  it("refuses a valid session whose user no longer exists, and never creates one", async () => {
    const sdk = await load();
    database.getUserByOpenId.mockResolvedValue(undefined);
    const token = await sdk.createSessionToken("email:gone", { name: "Eng" });
    await expect(sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }))).rejects.toThrow(/User not found/);
    expect(database.upsertUser).not.toHaveBeenCalled();
  });

  it("treats a cron_ identity like any other: no user, no access", async () => {
    const sdk = await load();
    database.getUserByOpenId.mockResolvedValue(undefined);
    const token = await sdk.createSessionToken("cron_job-1", { name: "scheduled" });
    await expect(sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }))).rejects.toThrow();
  });
});

import { COOKIE_NAME } from "@shared/const";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "sdk-test-secret-0123456789abcdef";
const user = { id: 7, openId: "email:abc", name: null, email: "engineer@example.test", loginMethod: "email", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

const database = vi.hoisted(() => ({ getUserByOpenId: vi.fn(), upsertUser: vi.fn() }));
// An in-memory stand-in for the auth_sessions table, with the same rules (live = not revoked and not expired).
const sessions = vi.hoisted(() => {
  const rows = new Map<string, { userId: number; expiresAt: Date; revokedAt: Date | null }>();
  let counter = 0;
  return {
    rows,
    create: vi.fn(async ({ userId, expiresAt }: { userId: number; expiresAt: Date }) => { const id = `sid-${++counter}`; rows.set(id, { userId, expiresAt, revokedAt: null }); return id; }),
    findLive: vi.fn(async (id: string, now = new Date()) => { const row = rows.get(id); return row && !row.revokedAt && row.expiresAt > now ? row.userId : null; }),
    revoke: vi.fn(async (id: string) => { const row = rows.get(id); if (!row || row.revokedAt) return false; row.revokedAt = new Date(); return true; }),
    revokeAllForUser: vi.fn(),
  };
});

async function load(secret = SECRET) {
  vi.resetModules();
  vi.stubEnv("JWT_SECRET", secret);
  vi.stubEnv("APP_ID", "");
  vi.doMock("../db", () => database);
  vi.doMock("./sessionStore", () => ({ sessionStore: sessions }));
  return (await import("./sdk")).sdk;
}
const request = (headers: Record<string, string>) => ({ headers }) as never;
const forged = (secret: string, claims: Record<string, unknown> = { openId: "email:abc", appId: "project-os", name: "Eng", sid: "sid-x" }, expires = "1h") =>
  new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expires).sign(new TextEncoder().encode(secret));

beforeEach(() => { sessions.rows.clear(); sessions.create.mockClear(); database.getUserByOpenId.mockReset().mockResolvedValue(user); database.upsertUser.mockReset().mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("../db"); vi.doUnmock("./sessionStore"); });

describe("session tokens", () => {
  it("round-trips a session with the documented shape, a 30-day lifetime, and a live row behind it", async () => {
    const sdk = await load();
    const token = await sdk.issueSession("email:abc", { name: "Eng" });
    const verified = await sdk.verifySession(token);
    expect(verified).toEqual({ openId: "email:abc", appId: "project-os", name: "Eng", sid: expect.any(String) });
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const days = (payload.exp * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    const row = sessions.rows.get(verified!.sid)!;
    expect(row.userId).toBe(user.id);
    expect((row.expiresAt.getTime() - Date.now()) / 86_400_000).toBeGreaterThan(29.9);
  });

  it("refuses a token signed with another secret, an expired one, a malformed one and one with missing fields", async () => {
    const sdk = await load();
    expect(await sdk.verifySession(await forged("some-other-secret-0123456789"))).toBeNull();
    expect(await sdk.verifySession(await forged(SECRET, undefined, "-1h"))).toBeNull();
    expect(await sdk.verifySession("not.a.jwt")).toBeNull();
    expect(await sdk.verifySession(await forged(SECRET, { openId: "email:abc", appId: "project-os", sid: "sid-x" }))).toBeNull();
    expect(await sdk.verifySession(await forged(SECRET, { openId: "", appId: "project-os", name: "x", sid: "sid-x" }))).toBeNull();
    expect(await sdk.verifySession("")).toBeNull();
    expect(await sdk.verifySession(undefined)).toBeNull();
  });

  it("refuses a token that names no session (the old stateless shape), even with a good signature", async () => {
    const sdk = await load();
    expect(await sdk.verifySession(await forged(SECRET, { openId: "email:abc", appId: "project-os", name: "Eng" }))).toBeNull();
    expect(await sdk.verifySession(await forged(SECRET, { openId: "email:abc", appId: "project-os", name: "Eng", sid: "" }))).toBeNull();
  });

  it("refuses an unsigned (alg none) token", async () => {
    const sdk = await load();
    const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    expect(await sdk.verifySession(`${part({ alg: "none", typ: "JWT" })}.${part({ openId: "email:abc", appId: "project-os", name: "Eng", sid: "sid-x", exp: 9999999999 })}.`)).toBeNull();
  });

  it("neither starts nor accepts a session while the secret is too short, and leaves no row behind", async () => {
    const sdk = await load("short");
    await expect(sdk.issueSession("email:abc", { name: "Eng" })).rejects.toThrow(/JWT_SECRET/);
    expect(sessions.create).not.toHaveBeenCalled();
    expect(await sdk.verifySession(await forged("short"))).toBeNull();
  });

  it("starts no session for a user that does not exist (a cron_ identity has none)", async () => {
    const sdk = await load();
    database.getUserByOpenId.mockResolvedValue(undefined);
    await expect(sdk.issueSession("cron_job-1", { name: "scheduled" })).rejects.toThrow(/unknown user/);
    expect(sessions.create).not.toHaveBeenCalled();
  });
});

describe("authenticateRequest", () => {
  it("returns the user for a valid session cookie and records the sign-in", async () => {
    const sdk = await load();
    const token = await sdk.issueSession("email:abc", { name: "Eng" });
    await expect(sdk.authenticateRequest(request({ cookie: `other=1; ${COOKIE_NAME}=${token}` }))).resolves.toBe(user);
    expect(database.getUserByOpenId).toHaveBeenCalledWith("email:abc");
    expect(database.upsertUser).toHaveBeenCalledWith(expect.objectContaining({ openId: "email:abc" }));
  });

  it("refuses a request with no cookie, and ignores an Authorization bearer token", async () => {
    const sdk = await load();
    const token = await sdk.issueSession("email:abc", { name: "Eng" });
    database.getUserByOpenId.mockClear();
    await expect(sdk.authenticateRequest(request({}))).rejects.toThrow();
    await expect(sdk.authenticateRequest(request({ authorization: `Bearer ${token}` }))).rejects.toThrow();
    expect(database.getUserByOpenId).not.toHaveBeenCalled();
  });

  it("refuses a token with a perfect signature once its session was logged out (the copy of the cookie is dead)", async () => {
    const sdk = await load();
    const token = await sdk.issueSession("email:abc", { name: "Eng" });
    const cookie = `${COOKIE_NAME}=${token}`;
    await expect(sdk.authenticateRequest(request({ cookie }))).resolves.toBe(user);
    const sid = (await sdk.verifySession(token))!.sid;
    expect(await sdk.sessionIdOf(request({ cookie }))).toBe(sid);
    expect(await sessions.revoke(sid)).toBe(true);
    await expect(sdk.authenticateRequest(request({ cookie }))).rejects.toThrow(/Session ended/);
    database.upsertUser.mockClear();
    await expect(sdk.authenticateRequest(request({ cookie }))).rejects.toThrow();
    expect(database.upsertUser).not.toHaveBeenCalled();
  });

  it("refuses a session whose row has expired, even though the token's own expiry is still ahead", async () => {
    const sdk = await load();
    const token = await sdk.issueSession("email:abc", { name: "Eng" });
    sessions.rows.get((await sdk.verifySession(token))!.sid)!.expiresAt = new Date(Date.now() - 1000);
    await expect(sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }))).rejects.toThrow(/Session ended/);
  });

  it("refuses a session id that no row knows, and one that belongs to another user", async () => {
    const sdk = await load();
    await expect(sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${await forged(SECRET)}` }))).rejects.toThrow(/Session ended/);
    sessions.rows.set("sid-other", { userId: user.id + 1, expiresAt: new Date(Date.now() + 60_000), revokedAt: null });
    const token = await forged(SECRET, { openId: "email:abc", appId: "project-os", name: "Eng", sid: "sid-other" });
    await expect(sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }))).rejects.toThrow(/does not belong/);
    expect(database.upsertUser).not.toHaveBeenCalled();
  });

  it("refuses a valid session whose user no longer exists, and never creates one", async () => {
    const sdk = await load();
    const token = await sdk.issueSession("email:abc", { name: "Eng" });
    database.getUserByOpenId.mockResolvedValue(undefined);
    await expect(sdk.authenticateRequest(request({ cookie: `${COOKIE_NAME}=${token}` }))).rejects.toThrow(/User not found/);
    expect(database.upsertUser).not.toHaveBeenCalled();
  });
});

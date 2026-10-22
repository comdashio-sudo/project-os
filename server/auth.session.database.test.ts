import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { eq, inArray, like } from "drizzle-orm";
import express from "express";
import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SignJWT } from "jose";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authCodeAttempts, authSessions, users } from "../drizzle/schema";
import { createContext } from "./_core/context";
import { createEmailCodeService, hashEmail, openIdForEmail } from "./_core/auth/emailCode";
import { createDbAttemptLimiter } from "./_core/auth/attemptRepository";
import { createFakeCodeProvider } from "./testing/fakeCodeProvider";
import { registerAuthRoutes } from "./_core/auth/routes";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getDb, upsertUser } from "./db";
import { appRouter } from "./routers";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// Work order 4, items 1 and 2 (re-based on Supabase Auth in work order 6), end to end on the test database: the real routes, the real guess-limit table,
// the real session table and the real tRPC procedures over HTTP, with the e-mail code itself played by an in-memory stand-in for GoTrue
// (the real GoTrue is driven by server/auth.gotrue.live.test.ts). A signed cookie must stop working the moment its session is ended in the server, and every refusal of a
// code must look the same. Synthetic addresses only (*.example.test).
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("e-mail sign-in and server-side sessions on a real database", () => {
  const stamp = randomUUID().slice(0, 8);
  const address = (name: string) => `${name}-${stamp}@example.test`;
  const clock = { value: Date.now() };
  const fake = createFakeCodeProvider({ now: () => new Date(clock.value), minIntervalMs: 60_000 });
  const sent = new Proxy({} as Record<string, string>, { get: (_target, email: string) => fake.sent.filter(mail => mail.to === email).at(-1)?.code });
  const emails = new Set<string>();
  const spacing = () => { clock.value += 61_000; }; // past the provider's minimum interval between two codes for one address
  let server: Server; let base = "";
  const previousSecret = ENV.cookieSecret;

  beforeAll(async () => {
    expect(await getDb()).toBeTruthy();
    if (ENV.cookieSecret.length < 16) (ENV as { cookieSecret: string }).cookieSecret = "live-session-secret-0123456789abcdef";
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, {
      emailCodes: createEmailCodeService({ provider: fake.provider, attempts: createDbAttemptLimiter(), now: () => new Date(clock.value) }),
      google: null,
      secret: ENV.cookieSecret,
      upsertUser: user => upsertUser(user),
      createSessionToken: (openId, options) => sdk.issueSession(openId, options),
    });
    app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    const db = await getDb();
    for (const email of emails) await db?.delete(authCodeAttempts).where(eq(authCodeAttempts.emailHash, hashEmail(email)));
    await db?.delete(users).where(like(users.email, `%-${stamp}@example.test`)); // the sessions go with their user (ON DELETE CASCADE)
    (ENV as { cookieSecret: string }).cookieSecret = previousSecret;
  });

  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-proto": "https", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];
  async function signIn(name: string) {
    const email = address(name); emails.add(email);
    expect((await post("/api/auth/email/request", { email })).status).toBe(200);
    const response = await post("/api/auth/email/verify", { email, code: sent[email] });
    expect(response.status).toBe(200);
    return { email, response, cookie: cookieOf(response) };
  }
  const me = async (cookie: string) => {
    const response = await fetch(`${base}/api/trpc/auth.me`, { headers: cookie ? { cookie } : {} });
    expect(response.status).toBe(200);
    return superjson.deserialize((await response.json()).result.data) as { email: string } | null;
  };
  const sessionRows = async (email: string) => {
    const db = (await getDb())!;
    const [user] = await db.select().from(users).where(eq(users.openId, openIdForEmail(email)));
    return user ? db.select().from(authSessions).where(eq(authSessions.userId, user.id)) : [];
  };

  it("signs in with the mailed code: a Secure, HttpOnly, SameSite=Lax, 30-day cookie, and a live row in the sessions table", async () => {
    const { email, response, cookie } = await signIn("one");
    const header = response.headers.get("set-cookie")!;
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(header).toMatch(/;\s*Secure/i);
    expect(header).toContain(`Max-Age=${SESSION_MAX_AGE_MS / 1000}`);
    expect(header).toContain("Path=/");
    expect(header).not.toMatch(/Domain=/i);
    expect(cookie.startsWith(`${COOKIE_NAME}=`)).toBe(true);
    expect((await me(cookie))?.email).toBe(email);
    const [row] = await sessionRows(email);
    expect(row.revokedAt).toBeNull();
    expect(Math.abs(row.expiresAt.getTime() - (Date.now() + SESSION_MAX_AGE_MS))).toBeLessThan(60_000);
  });

  it("logging out ends the session in the server: the very same cookie, still validly signed and unexpired, no longer works", async () => {
    const { email, cookie } = await signIn("two");
    expect((await me(cookie))?.email).toBe(email);
    const out = await post("/api/trpc/auth.logout", undefined, { cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/Expires=Thu, 01 Jan 1970/i); // the browser is told to drop it as well
    expect((await sessionRows(email))[0].revokedAt).not.toBeNull();
    expect(await me(cookie)).toBeNull(); // a copy of the cookie kept by anyone is dead
    // and it is dead for protected procedures, not just for the "who am I" question
    expect((await fetch(`${base}/api/trpc/auth.logoutEverywhere`, { method: "POST", headers: { cookie, "content-type": "application/json" } })).status).toBe(401);
  });

  it("logging out one browser leaves the same person's other browser signed in; 'sign out everywhere' ends both", async () => {
    const first = await signIn("three");
    // a second sign-in needs a second code: the provider spaces two codes for one address, so let that interval pass
    spacing();
    expect((await post("/api/auth/email/request", { email: first.email })).status).toBe(200);
    const second = cookieOf(await post("/api/auth/email/verify", { email: first.email, code: sent[first.email] }));
    expect(await sessionRows(first.email)).toHaveLength(2);
    await post("/api/trpc/auth.logout", undefined, { cookie: first.cookie });
    expect(await me(first.cookie)).toBeNull();
    expect((await me(second))?.email).toBe(first.email);
    const third = await signInAgain(first.email);
    const everywhere = await post("/api/trpc/auth.logoutEverywhere", undefined, { cookie: third });
    expect(everywhere.status).toBe(200);
    expect(superjson.deserialize((await everywhere.json()).result.data)).toEqual({ success: true, ended: 2 });
    expect(await me(second)).toBeNull();
    expect(await me(third)).toBeNull();
    expect((await sessionRows(first.email)).every(row => row.revokedAt !== null)).toBe(true);
  });

  async function signInAgain(email: string) {
    spacing();
    await post("/api/auth/email/request", { email });
    return cookieOf(await post("/api/auth/email/verify", { email, code: sent[email] }));
  }

  it("refuses a session whose row has expired, whatever the token's own expiry says", async () => {
    const { email, cookie } = await signIn("four");
    expect((await me(cookie))?.email).toBe(email);
    const db = (await getDb())!;
    await db.update(authSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(inArray(authSessions.id, (await sessionRows(email)).map(row => row.id)));
    expect(await me(cookie)).toBeNull();
  });

  it("refuses a correctly signed token naming a session that does not exist, and one signed with another secret", async () => {
    const { email } = await signIn("five");
    const claims = { openId: openIdForEmail(email), appId: ENV.appId || "project-os", name: "x", sid: randomUUID() };
    const sign = (secret: string) => new SignJWT(claims).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    expect(await me(`${COOKIE_NAME}=${await sign(ENV.cookieSecret)}`)).toBeNull();
    expect(await me(`${COOKIE_NAME}=${await sign("another-secret-0123456789abcdef")}`)).toBeNull();
  });

  it("locks a code after five wrong guesses even when the sixth is the right one, and gives every refusal the same answer", async () => {
    const email = address("six"); emails.add(email);
    await post("/api/auth/email/request", { email });
    const real = sent[email];
    const wrong = real === "000000" ? "111111" : "000000";
    const answers: unknown[] = [];
    for (let i = 0; i < 5; i++) { const r = await post("/api/auth/email/verify", { email, code: wrong }); expect(r.status).toBe(401); expect(r.headers.get("set-cookie")).toBeNull(); answers.push(await r.json()); }
    const sixth = await post("/api/auth/email/verify", { email, code: real });
    expect(sixth.status).toBe(401);
    expect(sixth.headers.get("set-cookie")).toBeNull();
    answers.push(await sixth.json());
    const stranger = await (await post("/api/auth/email/verify", { email: address("never-asked"), code: real })).json();
    expect(new Set([...answers, stranger].map(a => JSON.stringify(a))).size).toBe(1);
    expect(await sessionRows(email)).toHaveLength(0); // no session was ever created
  });

  it("keeps the lock after five wrong guesses for fifteen minutes even when a fresh code is mailed, and lifts it afterwards", async () => {
    const email = address("lock"); emails.add(email);
    await post("/api/auth/email/request", { email });
    for (let i = 0; i < 5; i++) expect((await post("/api/auth/email/verify", { email, code: "000000" })).status).toBe(401);
    const [row] = await (await getDb())!.select().from(authCodeAttempts).where(eq(authCodeAttempts.emailHash, hashEmail(email)));
    expect(row.failures).toBe(5);
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(clock.value);
    spacing();
    expect((await post("/api/auth/email/request", { email })).status).toBe(200); // a code can be asked for ...
    expect((await post("/api/auth/email/verify", { email, code: sent[email] })).status).toBe(401); // ... but the address is still locked
    clock.value += 15 * 60_000;
    expect((await post("/api/auth/email/verify", { email, code: sent[email] })).status).toBe(200);
    expect(await (await getDb())!.select().from(authCodeAttempts).where(eq(authCodeAttempts.emailHash, hashEmail(email)))).toHaveLength(0); // a good sign-in clears the count
  });

  it("allows one code request per minute per address, and a code lives one hour", async () => {
    const email = address("seven"); emails.add(email);
    expect((await post("/api/auth/email/request", { email })).status).toBe(200);
    expect((await post("/api/auth/email/request", { email })).status).toBe(429);
    clock.value += 61 * 60_000;
    expect((await post("/api/auth/email/verify", { email, code: sent[email] })).status).toBe(401); // expired
  });

  it("reports an unreachable Supabase Auth as 503, for a request and for a verification, and creates no session", async () => {
    const email = address("down"); emails.add(email);
    await post("/api/auth/email/request", { email });
    fake.setUnavailable(true);
    try {
      expect((await post("/api/auth/email/request", { email: address("down2") })).status).toBe(503);
      const response = await post("/api/auth/email/verify", { email, code: sent[email] });
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
    } finally { fake.setUnavailable(false); }
    expect(await sessionRows(email)).toHaveLength(0);
  });

  it("never reveals whether an address has an account: requesting a code answers the same for a member and a stranger", async () => {
    const member = await signIn("member");
    spacing();
    const known = await post("/api/auth/email/request", { email: member.email });
    const stranger = await post("/api/auth/email/request", { email: address("stranger") }); emails.add(address("stranger"));
    expect(known.status).toBe(stranger.status);
    expect(await known.json()).toEqual(await stranger.json());
    // a stranger who only asked for a code has no account yet
    const db = (await getDb())!;
    expect(await db.select().from(users).where(eq(users.openId, openIdForEmail(address("stranger"))))).toHaveLength(0);
    expect(createHash("sha256").update("x").digest("hex")).toHaveLength(64);
  });
});

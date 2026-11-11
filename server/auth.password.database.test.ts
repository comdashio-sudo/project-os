import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { eq, like } from "drizzle-orm";
import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authCodeAttempts, users } from "../drizzle/schema";
import { createContext } from "./_core/context";
import { createDbAttemptLimiter } from "./_core/auth/attemptRepository";
import { createEmailCodeService, openIdForEmail, passwordAttemptKey } from "./_core/auth/emailCode";
import { registerAuthRoutes } from "./_core/auth/routes";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { stepAt, totpCode } from "./_core/totp";
import { getDb, upsertUser } from "./db";
import { beginEnrolment, clearMfaRequiredCache, confirmEnrolment } from "./mfa";
import { appRouter } from "./routers";
import { createFakeCodeProvider } from "./testing/fakeCodeProvider";
import { isTestDatabaseUrl } from "./testing/testDatabase";

// D-82 (a) on the test database: the real routes, the real guess-limit table (auth_code_attempts), the real session table and the real tRPC gate over HTTP, with
// GoTrue's password check played by the in-memory stand-in (no Docker here; server/auth.gotrue.live.test.ts is the real one). Synthetic addresses only.
describe.skipIf(!isTestDatabaseUrl(process.env.TEST_DATABASE_URL))("password sign-in on a real database (D-82)", () => {
  const stamp = randomUUID().slice(0, 8);
  const address = (name: string) => `${name}-${stamp}@pw.example.test`;
  const PASSWORD = "a long enough password";
  const fake = createFakeCodeProvider();
  let server: Server; let base = "";
  const previous = { secret: ENV.cookieSecret, mfa: ENV.mfaEnforced };

  beforeAll(async () => {
    if (ENV.cookieSecret.length < 16) (ENV as { cookieSecret: string }).cookieSecret = "password-session-secret-0123456789";
    (ENV as { mfaEnforced: boolean }).mfaEnforced = true;
    const app = express(); app.use(express.json());
    registerAuthRoutes(app, {
      emailCodes: createEmailCodeService({ provider: fake.provider, attempts: createDbAttemptLimiter() }),
      google: null, secret: ENV.cookieSecret,
      isEligible: async email => !email.startsWith("stranger-"),
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
    for (const name of ["locked", "invited", "stranger", "mfa"]) await db?.delete(authCodeAttempts).where(eq(authCodeAttempts.emailHash, passwordAttemptKey(address(name))));
    await db?.delete(users).where(like(users.email, `%-${stamp}@pw.example.test`));
    (ENV as { cookieSecret: string; mfaEnforced: boolean }).cookieSecret = previous.secret; (ENV as { mfaEnforced: boolean }).mfaEnforced = previous.mfa;
  });

  const signIn = (email: string, password: string) => fetch(`${base}/api/auth/password/sign-in`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-proto": "https" }, body: JSON.stringify({ email, password }) });
  const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];
  const tenantsWith = (cookie: string) => fetch(`${base}/api/trpc/tenant.mine`, { headers: { cookie } });

  it("an invited address with the right password gets a live server-side session; the protected API answers", async () => {
    const email = address("invited"); fake.passwords.set(email, PASSWORD);
    const response = await signIn(email, PASSWORD);
    expect(response.status).toBe(200);
    expect((await tenantsWith(cookieOf(response))).status).toBe(200);
    const [row] = await (await getDb())!.select({ loginMethod: users.loginMethod }).from(users).where(eq(users.openId, openIdForEmail(email)));
    expect(row.loginMethod).toBe("password");
  });

  it("NEGATIVE: five wrong passwords lock the address in the shared table; the sixth, correct, is refused with no cookie", async () => {
    const email = address("locked"); fake.passwords.set(email, PASSWORD);
    for (let i = 0; i < 5; i++) expect((await signIn(email, `wrong ${i}`)).status).toBe(401);
    const sixth = await signIn(email, PASSWORD);
    expect(sixth.status).toBe(429); expect((await sixth.json()).code).toBe("PROJECT_OS_AUTH_RATE_LIMITED"); expect(sixth.headers.get("set-cookie")).toBeNull();
    const [row] = await (await getDb())!.select().from(authCodeAttempts).where(eq(authCodeAttempts.emailHash, passwordAttemptKey(email)));
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
  });

  it("NEGATIVE: an uninvited address whose password is right at the identity provider gets the wrong-password answer, no cookie and no account", async () => {
    const email = address("stranger"); fake.passwords.set(email, PASSWORD);
    const response = await signIn(email, PASSWORD);
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "PROJECT_OS_AUTH_CREDENTIALS_INVALID" }); expect(response.headers.get("set-cookie")).toBeNull();
    expect(await (await getDb())!.select().from(users).where(eq(users.openId, openIdForEmail(email)))).toEqual([]);
  });

  it("two-step verification applies after a password exactly as after a code: someone who switched it on is held at MFA_REQUIRED", async () => {
    const email = address("mfa"); fake.passwords.set(email, PASSWORD);
    expect((await signIn(email, PASSWORD)).status).toBe(200);
    const [user] = await (await getDb())!.select({ id: users.id }).from(users).where(eq(users.openId, openIdForEmail(email)));
    const begun = await beginEnrolment({ id: user.id, email, openId: openIdForEmail(email) });
    await confirmEnrolment({ id: user.id }, "no-session", totpCode(begun.secret, stepAt(Date.now())), undefined, undefined, true);
    clearMfaRequiredCache();
    const again = await signIn(email, PASSWORD);
    expect(again.status).toBe(200);
    const refused = await tenantsWith(cookieOf(again));
    expect(refused.status).toBe(403); expect(JSON.stringify(await refused.json())).toContain("PROJECT_OS_MFA_REQUIRED");
  });
});

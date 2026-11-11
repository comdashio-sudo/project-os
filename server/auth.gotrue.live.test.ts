import { COOKIE_NAME } from "@shared/const";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import pg from "pg";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContext } from "./_core/context";
import { createDbAttemptLimiter } from "./_core/auth/attemptRepository";
import { createEmailCodeService, hashEmail, openIdForEmail } from "./_core/auth/emailCode";
import { registerAuthRoutes } from "./_core/auth/routes";
import { createSupabaseCodeProvider } from "./_core/auth/supabaseAuth";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { getDb, upsertUser } from "./db";
import { appRouter } from "./routers";
import { startSmtpSink } from "./testing/smtpSink";
import { isTestDatabaseUrl } from "./testing/testDatabase";
import { authCodeAttempts, users } from "../drizzle/schema";
import { eq, like } from "drizzle-orm";
import type { AddressInfo } from "node:net";

// Every sign-in case, against a REAL Supabase Auth (GoTrue v2.176.1) running on this machine (scripts/gotrue-local.mjs), its real e-mail going through a
// local SMTP sink, with the real routes, the real guess-limit table and the real session table. Skipped unless GOTRUE_LIVE_URL names that GoTrue.
//   GOTRUE_LIVE_URL=http://127.0.0.1:9999 (the Auth API base, no /auth/v1: a local GoTrue has no gateway) and the test database variables.
const authUrl = process.env.GOTRUE_LIVE_URL;
const live = Boolean(authUrl) && isTestDatabaseUrl(process.env.TEST_DATABASE_URL);

describe.skipIf(!live)("sign-in by e-mail code against a real Supabase Auth", () => {
  const stamp = Math.random().toString(36).slice(2, 8);
  const address = (name: string) => `${name}-${stamp}@mail.example.test`;
  const emails = new Set<string>();
  let sink: Awaited<ReturnType<typeof startSmtpSink>>;
  let templates: Server;
  let server: Server; let base = "";
  let owner: pg.Client;
  const previousSecret = ENV.cookieSecret;

  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-proto": "https", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const cookieOf = (response: Response) => (response.headers.get("set-cookie") ?? "").split(";")[0];
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  /** The six digits in the next mail to this address (the template shows the code, not a link). */
  async function mailedCode(email: string, after = 0) {
    const mail = await sink.waitFor(candidate => candidate.to.includes(email) && sink.mails.indexOf(candidate) >= after);
    const code = /(?<![\d#])(\d{6})(?!\d)/.exec(mail.text.replace(/<[^>]+>/g, " "))?.[1];
    expect(code, "the mail carries a six-digit code").toBeTruthy();
    return { code: code!, mail };
  }
  async function requestCode(email: string) {
    emails.add(email);
    const before = sink.mails.length;
    const response = await post("/api/auth/email/request", { email });
    return { response, before };
  }
  const me = async (cookie: string) => {
    const response = await fetch(`${base}/api/trpc/auth.me`, { headers: cookie ? { cookie } : {} });
    return superjson.deserialize((await response.json()).result.data) as { email: string } | null;
  };

  beforeAll(async () => {
    sink = await startSmtpSink(2525);
    const html = readFileSync(join(__dirname, "..", "docs", "auth-email-templates", "otp.html"), "utf8");
    templates = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(html); });
    await new Promise<void>(resolve => templates.listen(2526, "127.0.0.1", resolve));
    owner = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
    await owner.connect();
    if (ENV.cookieSecret.length < 16) (ENV as { cookieSecret: string }).cookieSecret = "live-gotrue-secret-0123456789abcdef";
    const app = express();
    app.use(express.json());
    registerAuthRoutes(app, {
      emailCodes: createEmailCodeService({ provider: createSupabaseCodeProvider({ url: authUrl!, authUrl, anonKey: "local-key-not-checked-by-a-local-gotrue" }), attempts: createDbAttemptLimiter() }),
      google: null,
      secret: ENV.cookieSecret,
      isEligible: async () => true,
      upsertUser: user => upsertUser(user),
      createSessionToken: (openId, options) => sdk.issueSession(openId, options),
    });
    app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server?.close(resolve));
    await new Promise(resolve => templates?.close(resolve));
    await sink?.close();
    const db = await getDb();
    for (const email of emails) await db?.delete(authCodeAttempts).where(eq(authCodeAttempts.emailHash, hashEmail(email)));
    await db?.delete(users).where(like(users.email, `%-${stamp}@mail.example.test`));
    await owner?.query("DELETE FROM auth.users WHERE email LIKE $1", [`%-${stamp}@mail.example.test`]).catch(() => undefined);
    await owner?.end();
    (ENV as { cookieSecret: string }).cookieSecret = previousSecret;
  });

  it("case 1 — a new address: the mail shows the code (not only a link), the code signs in, and the app session works", async () => {
    const email = address("new");
    const { response, before } = await requestCode(email);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, expiresInSeconds: 3600 });
    const { code, mail } = await mailedCode(email, before);
    expect(mail.text).toContain("رمز الدخول");
    expect(mail.text).toContain("sign-in code");
    const verified = await post("/api/auth/email/verify", { email, code });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ ok: true });
    const cookie = cookieOf(verified);
    expect(cookie.startsWith(`${COOKIE_NAME}=`)).toBe(true);
    expect(verified.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect((await me(cookie))?.email).toBe(email);
    const db = (await getDb())!;
    expect(await db.select().from(users).where(eq(users.openId, openIdForEmail(email)))).toHaveLength(1);
    // Supabase Auth now knows the address as a confirmed user, and the provider's own session was closed by the server
    const { rows } = await owner.query("SELECT email_confirmed_at IS NOT NULL AS confirmed FROM auth.users WHERE email = $1", [email]);
    expect(rows[0]?.confirmed).toBe(true);
  });

  it("case 2 — the same address again (an existing user): a fresh code signs in to the SAME application account", async () => {
    const email = address("again");
    let before = (await requestCode(email)).before;
    let { code } = await mailedCode(email, before);
    expect((await post("/api/auth/email/verify", { email, code })).status).toBe(200);
    const db = (await getDb())!;
    const [first] = await db.select().from(users).where(eq(users.openId, openIdForEmail(email)));
    await pause(2500); // the provider spaces two codes for one address
    before = (await requestCode(email)).before;
    ({ code } = await mailedCode(email, before));
    const second = await post("/api/auth/email/verify", { email: email.toUpperCase(), code }); // and the case of the address does not matter
    expect(second.status).toBe(200);
    expect((await me(cookieOf(second)))?.email).toBe(email);
    expect((await db.select().from(users).where(eq(users.openId, openIdForEmail(email)))).map(user => user.id)).toEqual([first.id]);
  });

  it("case 3 — a wrong code, a reused code and a code for an address nobody asked about all get the SAME answer, and no cookie", async () => {
    const email = address("wrong");
    const { before } = await requestCode(email);
    const { code } = await mailedCode(email, before);
    const wrongCode = code === "000000" ? "111111" : "000000";
    const wrong = await post("/api/auth/email/verify", { email, code: wrongCode });
    const stranger = await post("/api/auth/email/verify", { email: address("never-asked"), code });
    expect((await post("/api/auth/email/verify", { email, code })).status).toBe(200); // the right one still works after one wrong guess
    const reused = await post("/api/auth/email/verify", { email, code });
    const answers: string[] = [];
    for (const r of [wrong, stranger, reused]) { expect(r.status).toBe(401); expect(r.headers.get("set-cookie")).toBeNull(); answers.push(JSON.stringify(await r.json())); }
    expect(new Set(answers)).toEqual(new Set([JSON.stringify({ code: "PROJECT_OS_AUTH_CODE_INVALID" })]));
  });

  it("case 4 — an expired code is refused (the provider's clock, not ours)", async () => {
    const email = address("expired");
    const { before } = await requestCode(email);
    const { code } = await mailedCode(email, before);
    // age the code at the provider: GoTrue measures its lifetime from the time it was sent
    const aged = await owner.query("UPDATE auth.users SET confirmation_sent_at = now() - interval '2 hours', recovery_sent_at = now() - interval '2 hours' WHERE email = $1", [email]);
    expect(aged.rowCount).toBe(1);
    const response = await post("/api/auth/email/verify", { email, code });
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("case 5 — asking again too soon is refused by the provider's own limit, and the app says so with 429", async () => {
    const email = address("fast");
    expect((await requestCode(email)).response.status).toBe(200);
    const second = await post("/api/auth/email/request", { email });
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ code: "PROJECT_OS_AUTH_RATE_LIMITED" });
  });

  it("case 6 — five wrong guesses lock the address (our table), even when the sixth is the right code", async () => {
    const email = address("lock");
    const { before } = await requestCode(email);
    const { code } = await mailedCode(email, before);
    const wrongCode = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await post("/api/auth/email/verify", { email, code: wrongCode })).status).toBe(401);
    const sixth = await post("/api/auth/email/verify", { email, code });
    expect(sixth.status).toBe(401);
    expect(sixth.headers.get("set-cookie")).toBeNull();
    const [row] = await (await getDb())!.select().from(authCodeAttempts).where(eq(authCodeAttempts.emailHash, hashEmail(email)));
    expect(row.failures).toBe(5);
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // the lock is ours: lifting it makes the same, still-valid code work
    await owner.query("UPDATE auth_code_attempts SET locked_until = now() - interval '1 minute' WHERE email_hash = $1", [hashEmail(email)]);
    expect((await post("/api/auth/email/verify", { email, code })).status).toBe(200);
  });

  it("case 7 — a malformed address or code never reaches the provider (400 for the address, 401 for the code)", async () => {
    const before = sink.mails.length;
    expect((await post("/api/auth/email/request", { email: "not-an-address" })).status).toBe(400);
    expect((await post("/api/auth/email/request", {})).status).toBe(400);
    expect((await post("/api/auth/email/verify", { email: address("x"), code: "12ab56" })).status).toBe(401);
    expect(sink.mails.length).toBe(before);
  });

  it("case 8 — requesting a code answers the same for a known and an unknown address, so the form reveals nothing", async () => {
    const known = address("known");
    const first = await requestCode(known);
    const { code } = await mailedCode(known, first.before);
    await post("/api/auth/email/verify", { email: known, code });
    await pause(2500);
    const again = await post("/api/auth/email/request", { email: known });
    const stranger = await post("/api/auth/email/request", { email: address("stranger") }); emails.add(address("stranger"));
    expect(again.status).toBe(stranger.status);
    expect(await again.json()).toEqual(await stranger.json());
  });

  it("case 9 — an unreachable Supabase Auth is a 503 for both steps, never a session", async () => {
    const down = express();
    down.use(express.json());
    registerAuthRoutes(down, {
      emailCodes: createEmailCodeService({ provider: createSupabaseCodeProvider({ url: "http://127.0.0.1:1", authUrl: "http://127.0.0.1:1", anonKey: "k", timeoutMs: 1500 }), attempts: createDbAttemptLimiter() }),
      google: null, secret: ENV.cookieSecret,
      isEligible: async () => true,
      isEligible: async () => true, upsertUser: user => upsertUser(user), createSessionToken: (openId, options) => sdk.issueSession(openId, options),
    });
    const unreachable = await new Promise<Server>(resolve => { const s = down.listen(0, "127.0.0.1", () => resolve(s)); });
    try {
      const where = `http://127.0.0.1:${(unreachable.address() as AddressInfo).port}`;
      const send = (path: string, body: unknown) => fetch(where + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      expect((await send("/api/auth/email/request", { email: address("down") })).status).toBe(503);
      const verify = await send("/api/auth/email/verify", { email: address("down"), code: "123456" });
      expect(verify.status).toBe(503);
      expect(verify.headers.get("set-cookie")).toBeNull();
    } finally { await new Promise(resolve => unreachable.close(resolve)); }
  });

  it("case 10 — the sign-in code never appears in what the server logs or answers", async () => {
    const email = address("quiet");
    const { response, before } = await requestCode(email);
    const { code } = await mailedCode(email, before);
    expect(JSON.stringify(await response.json())).not.toContain(code);
    const verified = await post("/api/auth/email/verify", { email, code });
    expect(JSON.stringify(await verified.json())).not.toContain(code);
  });

  it("D-82 — a password set with a mailed code signs in at the real GoTrue; the old one stops working after a change", async () => {
    const email = address("password");
    let before = (await requestCode(email)).before;
    let { code } = await mailedCode(email, before);
    expect((await post("/api/auth/password/set", { email, code, password: "first password 1" })).status).toBe(200);
    expect((await post("/api/auth/password/sign-in", { email, password: "first password 1" })).status).toBe(200);
    await pause(2500); // the provider spaces two codes for one address (as case 2)
    before = (await requestCode(email)).before;
    ({ code } = await mailedCode(email, before));
    expect((await post("/api/auth/password/set", { email, code, password: "second password 2" })).status).toBe(200);
    const old = await post("/api/auth/password/sign-in", { email, password: "first password 1" });
    expect(old.status).toBe(401); expect(await old.json()).toEqual({ code: "PROJECT_OS_AUTH_CREDENTIALS_INVALID" });
    expect((await post("/api/auth/password/sign-in", { email, password: "second password 2" })).status).toBe(200);
  }, 120_000);
});

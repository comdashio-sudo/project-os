import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailCodeService, openIdForEmail } from "./emailCode";
import { createFakeCodeProvider, createMemoryAttemptLimiter } from "../../testing/fakeCodeProvider";
import { buildAuthorizationUrl } from "./google";
import { GOOGLE_STATE_COOKIE, registerAuthRoutes, safeNextPath, type AuthRoutesDependencies } from "./routes";

const SECRET = "routes-test-secret-0123456789";
const GOOGLE = { clientId: "client-id.example.test", clientSecret: "client-secret-for-tests", redirectUri: "https://app.example.test/api/auth/google/callback" };

const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(resolve => s.close(resolve)))); });

async function harness(options: { withGoogle?: boolean; fetchImpl?: typeof fetch; clock?: { value: number }; eligible?: (email: string) => boolean } = {}) {
  const clock = options.clock ?? { value: Date.now() };
  const upserts: Array<Parameters<AuthRoutesDependencies["upsertUser"]>[0]> = [];
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const sign = (claims: Record<string, unknown>, overrides: { aud?: string; iss?: string; expiresInSeconds?: number } = {}) =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "test-key" }).setIssuer(overrides.iss ?? "https://accounts.google.com").setAudience(overrides.aud ?? GOOGLE.clientId).setIssuedAt().setExpirationTime(Math.floor(clock.value / 1000) + (overrides.expiresInSeconds ?? 300)).sign(privateKey);

  const fake = createFakeCodeProvider({ now: () => new Date(clock.value), randomCode: () => "424242", minIntervalMs: 30_000 });
  const sent = fake.sent;
  const emailCodes = createEmailCodeService({ provider: fake.provider, attempts: createMemoryAttemptLimiter(), now: () => new Date(clock.value) });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, {
    emailCodes,
    secret: SECRET,
    google: options.withGoogle ? { config: GOOGLE, keys: createLocalJWKSet({ keys: [jwk] }), fetchImpl: options.fetchImpl } : null,
    isEligible: async email => (options.eligible ? options.eligible(email) : true),
    upsertUser: async user => { upserts.push(user); },
    createSessionToken: async (openId, o) => `session:${openId}:${o.name}`,
    now: () => clock.value,
  });
  const server: Server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  servers.push(server);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { base, post, sent, upserts, sign, clock, fake };
}

const decoded = (header: string | null) => decodeURIComponent(header ?? "");

describe("safeNextPath", () => {
  it("keeps a path on this site and refuses anything that leaves it", () => {
    expect(safeNextPath("/pmo/tenant-a?view=attention#top")).toBe("/pmo/tenant-a?view=attention#top");
    for (const bad of ["https://evil.example/steal", "//evil.example", "/\\evil.example", "javascript:alert(1)", "not a path", "", undefined, 7]) expect(safeNextPath(bad), String(bad)).toBe("/");
  });
});

describe("e-mail code routes", () => {
  it("signs in with the mailed code and sets a hardened session cookie", async () => {
    const h = await harness();
    expect((await h.post("/api/auth/email/request", { email: "Engineer@Example.test" })).status).toBe(200);
    expect(h.sent[0].code).toBe("424242");
    const response = await h.post("/api/auth/email/verify", { email: "engineer@example.test", code: "424242" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookie = response.headers.get("set-cookie")!;
    expect(decoded(cookie)).toContain(`${COOKIE_NAME}=session:${openIdForEmail("engineer@example.test")}:engineer`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toContain(`Max-Age=${SESSION_MAX_AGE_MS / 1000}`);
    expect(cookie).toContain("Path=/");
    expect(h.upserts).toEqual([expect.objectContaining({ openId: openIdForEmail("engineer@example.test"), email: "engineer@example.test", loginMethod: "email" })]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("gives one answer for a wrong code, a reused code and an unknown address, and sets no cookie", async () => {
    const h = await harness();
    await h.post("/api/auth/email/request", { email: "engineer@example.test" });
    const wrong = await h.post("/api/auth/email/verify", { email: "engineer@example.test", code: "000000" });
    const unknown = await h.post("/api/auth/email/verify", { email: "nobody@example.test", code: "424242" });
    await h.post("/api/auth/email/verify", { email: "engineer@example.test", code: "424242" });
    const reused = await h.post("/api/auth/email/verify", { email: "engineer@example.test", code: "424242" });
    for (const r of [wrong, unknown, reused]) {
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ code: "PROJECT_OS_AUTH_CODE_INVALID" });
      expect(r.headers.get("set-cookie")).toBeNull();
    }
  });

  it("answers a code request identically for an address that already has an account and one that never signed in", async () => {
    const h = await harness();
    await h.post("/api/auth/email/request", { email: "member@example.test" });
    expect((await h.post("/api/auth/email/verify", { email: "member@example.test", code: "424242" })).status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    h.clock.value += 60_000;
    const known = await h.post("/api/auth/email/request", { email: "member@example.test" });
    const stranger = await h.post("/api/auth/email/request", { email: "stranger@example.test" });
    expect(known.status).toBe(stranger.status);
    expect(await known.json()).toEqual(await stranger.json());
    expect(known.headers.get("set-cookie")).toBeNull();
    expect(stranger.headers.get("set-cookie")).toBeNull();
    expect(h.upserts).toHaveLength(1); // asking for a code never creates or touches an account
  });

  it("a provider send limit tells the screen how many seconds remain; the app's own source-address limit does not", async () => {
    const h = await harness();
    expect((await h.post("/api/auth/email/request", { email: "a@example.test" })).status).toBe(200);
    h.clock.value += 11_000;
    const limited = await h.post("/api/auth/email/request", { email: "a@example.test" });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ code: "PROJECT_OS_AUTH_RATE_LIMITED", retryAfterSeconds: 19 });
    for (let i = 0; i < 20; i++) await h.post("/api/auth/email/request", { email: `user${i}@example.test` });
    const own = await h.post("/api/auth/email/request", { email: "late@example.test" });
    expect(own.status).toBe(429);
    expect(await own.json()).toEqual({ code: "PROJECT_OS_AUTH_RATE_LIMITED" });
  });

  it("limits one source address on verification too, whatever the e-mail addresses", async () => {
    const h = await harness();
    const statuses: number[] = [];
    for (let i = 0; i < 32; i++) statuses.push((await h.post("/api/auth/email/verify", { email: `user${i}@example.test`, code: "000000" })).status);
    expect(statuses.slice(0, 30).every(s => s === 401)).toBe(true);
    expect(statuses.slice(30)).toEqual([429, 429]);
  });

  it("starts counting again once the ten minutes of the source-address window have passed", async () => {
    const h = await harness();
    for (let i = 0; i < 20; i++) await h.post("/api/auth/email/request", { email: `user${i}@example.test` });
    expect((await h.post("/api/auth/email/request", { email: "late@example.test" })).status).toBe(429);
    h.clock.value += 10 * 60 * 1000 + 1;
    expect((await h.post("/api/auth/email/request", { email: "late@example.test" })).status).toBe(200);
  });

  it("refuses an expired code", async () => {
    const h = await harness();
    await h.post("/api/auth/email/request", { email: "engineer@example.test" });
    h.clock.value += 60 * 60 * 1000 + 1;
    expect((await h.post("/api/auth/email/verify", { email: "engineer@example.test", code: "424242" })).status).toBe(401);
  });

  it("validates the address and answers a missing body without crashing", async () => {
    const h = await harness();
    expect((await h.post("/api/auth/email/request", { email: "nope" })).status).toBe(400);
    expect((await fetch(h.base + "/api/auth/email/request", { method: "POST" })).status).toBe(400);
    expect((await fetch(h.base + "/api/auth/email/verify", { method: "POST" })).status).toBe(401);
  });

  it("limits one source address, whatever the e-mail addresses", async () => {
    const h = await harness();
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await h.post("/api/auth/email/request", { email: `user${i}@example.test` })).status);
    expect(statuses.slice(0, 20).every(s => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });

  it("reports whether Google is offered", async () => {
    expect(await (await fetch((await harness()).base + "/api/auth/config")).json()).toEqual({ emailCode: true, google: false });
    expect(await (await fetch((await harness({ withGoogle: true })).base + "/api/auth/config")).json()).toEqual({ emailCode: true, google: true });
  });
});

describe("sign-in by invitation only (owner's decision 2026-10-25)", () => {
  const invited = (email: string) => email === "invited@example.test";
  it("an uninvited address is answered like an invited one -- same status, same body -- and no code is sent", async () => {
    const h = await harness({ eligible: invited });
    const stranger = await h.post("/api/auth/email/request", { email: "stranger@example.test" });
    const guest = await h.post("/api/auth/email/request", { email: "invited@example.test" });
    expect(stranger.status).toBe(200); expect(guest.status).toBe(200);
    expect(await stranger.json()).toEqual(await guest.json());
    expect(h.sent.map(mail => mail.to)).toEqual(["invited@example.test"]);
  });
  it("NEGATIVE: a code obtained from the identity provider for an uninvited address opens no session (the same answer as a wrong code, and no cookie)", async () => {
    const h = await harness({ eligible: invited });
    await h.fake.provider.sendCode("stranger@example.test"); // straight to the provider, around this app
    const response = await h.post("/api/auth/email/verify", { email: "stranger@example.test", code: "424242" });
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "PROJECT_OS_AUTH_CODE_INVALID" });
    expect(response.headers.get("set-cookie")).toBeNull(); expect(h.upserts).toEqual([]);
  });
  it("an invited address signs in as before", async () => {
    const h = await harness({ eligible: invited });
    await h.post("/api/auth/email/request", { email: "invited@example.test" });
    const response = await h.post("/api/auth/email/verify", { email: "invited@example.test", code: "424242" });
    expect(response.status).toBe(200); expect(decodeURIComponent(response.headers.get("set-cookie") ?? "")).toMatch(/session:/); expect(h.upserts).toHaveLength(1);
  });
});

describe("Google sign-in routes", () => {
  async function start(h: Awaited<ReturnType<typeof harness>>, next = "/pmo/tenant-a") {
    const response = await fetch(`${h.base}/api/auth/google/start?next=${encodeURIComponent(next)}`, { redirect: "manual" });
    const location = new URL(response.headers.get("location")!);
    const cookie = response.headers.get("set-cookie")!;
    return { response, location, cookie: cookie.split(";")[0] };
  }
  const tokenResponse = (idToken: string) => vi.fn(async () => new Response(JSON.stringify({ id_token: idToken }), { status: 200 }));

  it("is absent when Google is not configured", async () => {
    const h = await harness();
    expect((await fetch(`${h.base}/api/auth/google/start`, { redirect: "manual" })).status).toBe(404);
  });

  it("starts with PKCE, a state and a nonce, in a host-only httpOnly cookie", async () => {
    const h = await harness({ withGoogle: true });
    const { response, location, cookie } = await start(h);
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("client_id")).toBe(GOOGLE.clientId);
    expect(location.searchParams.get("redirect_uri")).toBe(GOOGLE.redirectUri);
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("nonce")).toBeTruthy();
    expect(cookie.startsWith(`${GOOGLE_STATE_COOKIE}=`)).toBe(true);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/i);
  });

  async function complete(options: { claims?: Record<string, unknown>; overrides?: Parameters<Awaited<ReturnType<typeof harness>>["sign"]>[1]; mutateState?: boolean; dropCookie?: boolean; next?: string; exchangeFails?: boolean }) {
    const clock = { value: Date.now() };
    let nonce = "";
    const holder: { h?: Awaited<ReturnType<typeof harness>> } = {};
    const fetchImpl = vi.fn(async () => {
      if (options.exchangeFails) return new Response("{}", { status: 400 });
      return new Response(JSON.stringify({ id_token: await holder.h!.sign({ sub: "1", email: "engineer@example.test", email_verified: true, name: "Eng Ineer", nonce, ...options.claims }, options.overrides) }), { status: 200 });
    });
    const h = await harness({ withGoogle: true, fetchImpl: fetchImpl as never, clock });
    holder.h = h;
    const { location, cookie } = await start(h, options.next);
    nonce = location.searchParams.get("nonce")!;
    const state = options.mutateState ? "forged-state" : location.searchParams.get("state")!;
    const response = await fetch(`${h.base}/api/auth/google/callback?code=auth-code&state=${state}`, { redirect: "manual", headers: options.dropCookie ? {} : { cookie } });
    return { h, response, fetchImpl };
  }

  it("signs the user in, links the identity to the verified address and returns to the page asked for", async () => {
    const { h, response, fetchImpl } = await complete({});
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/pmo/tenant-a");
    expect(decoded(response.headers.get("set-cookie"))).toContain(`${COOKIE_NAME}=session:${openIdForEmail("engineer@example.test")}:Eng Ineer`);
    expect(h.upserts).toEqual([expect.objectContaining({ email: "engineer@example.test", loginMethod: "google", name: "Eng Ineer" })]);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("code_verifier")).toBeTruthy();
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("never redirects off the site", async () => {
    const { response } = await complete({ next: "//evil.example/steal" });
    expect(response.headers.get("location")).toBe("/");
  });

  it("refuses every broken variation without creating a session", async () => {
    const cases: Array<[string, Parameters<typeof complete>[0], string]> = [
      ["state mismatch", { mutateState: true }, "google_failed"],
      ["missing state cookie", { dropCookie: true }, "google_failed"],
      ["wrong nonce", { claims: { nonce: "not-the-nonce" } }, "google_failed"],
      ["wrong audience", { overrides: { aud: "another-client" } }, "google_failed"],
      ["wrong issuer", { overrides: { iss: "https://evil.example" } }, "google_failed"],
      ["expired token", { overrides: { expiresInSeconds: -3600 } }, "google_failed"],
      ["token exchange fails", { exchangeFails: true }, "google_failed"],
      ["unverified address", { claims: { email_verified: false } }, "google_unverified"],
      ["missing address", { claims: { email: undefined } }, "google_failed"],
    ];
    for (const [label, options, reason] of cases) {
      const { h, response } = await complete(options);
      expect(response.status, label).toBe(302);
      expect(response.headers.get("location"), label).toBe(`/login?error=${reason}`);
      expect(response.headers.get("set-cookie") ?? "", label).not.toContain(`${COOKIE_NAME}=`);
      expect(h.upserts, label).toHaveLength(0);
    }
  });

  it("builds an authorization URL that carries only the challenge, never the verifier", () => {
    const url = buildAuthorizationUrl(GOOGLE, { state: "s", nonce: "n", verifier: "the-verifier-value" });
    expect(url).not.toContain("the-verifier-value");
    expect(new URL(url).searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

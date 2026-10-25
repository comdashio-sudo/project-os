import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import { timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";
import { getSessionCookieOptions } from "../cookies";
import { ENV } from "../env";
import { DEFAULT_CODE_TTL_SECONDS, EmailCodeError, normalizeEmail, openIdForEmail, type EmailCodeService } from "./emailCode";
import { buildAuthorizationUrl, completeGoogleSignIn, GoogleSignInError, newRandom, type GoogleConfig } from "./google";
import { createRateLimiter } from "./rateLimiter";
import { logError } from "../logger";

export const GOOGLE_STATE_COOKIE = "__Host-google_oauth";

/** Only a path on this site: anything that could leave it falls back to "/". */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  try {
    const url = new URL(next, "http://site.invalid");
    if (url.origin !== "http://site.invalid") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export type AuthRoutesDependencies = {
  emailCodes: EmailCodeService;
  google: { config: GoogleConfig; keys: JWTVerifyGetKey; fetchImpl?: typeof fetch } | null;
  secret: string;
  /** Sign-in is by invitation only: an address that is not the owner's, has no account and no pending invitation gets no code and no session (db.ts isEligibleToSignIn). */
  isEligible: (email: string) => Promise<boolean>;
  upsertUser: (user: { openId: string; email: string; name?: string | null; loginMethod: string; lastSignedIn: Date }) => Promise<void>;
  createSessionToken: (openId: string, options: { name: string; expiresInMs: number }) => Promise<string>;
  now?: () => number;
};

const statusFor: Record<string, number> = { EMAIL_INVALID: 400, RATE_LIMITED: 429, MAIL_UNAVAILABLE: 503, CODE_INVALID: 401 };

const displayName = (email: string, name?: string | null) => (name && name.trim()) || email.split("@")[0] || "user";

export function registerAuthRoutes(app: Express, dependencies: AuthRoutesDependencies) {
  const now = dependencies.now ?? Date.now;
  const secretKey = new TextEncoder().encode(dependencies.secret);
  const requestLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20, now });
  const verifyLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, now });

  async function startSession(req: Request, res: Response, email: string, loginMethod: string, name?: string | null) {
    const openId = openIdForEmail(email);
    await dependencies.upsertUser({ openId, email, name: name ?? undefined, loginMethod, lastSignedIn: new Date(now()) });
    const token = await dependencies.createSessionToken(openId, { name: displayName(email, name), expiresInMs: SESSION_MAX_AGE_MS });
    res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_MAX_AGE_MS });
  }

  app.get("/api/auth/config", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ emailCode: true, google: dependencies.google !== null });
  });

  app.post("/api/auth/email/request", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!requestLimiter.hit(req.ip ?? "unknown")) return res.status(429).json({ code: "PROJECT_OS_AUTH_RATE_LIMITED" });
    try {
      // An address nobody invited is answered exactly like one that was (same status, same body, no mail): the answer must not tell a stranger which addresses have accounts.
      if (!(await dependencies.isEligible(normalizeEmail(req.body?.email)))) return res.status(200).json({ ok: true, expiresInSeconds: DEFAULT_CODE_TTL_SECONDS });
      const { expiresInSeconds } = await dependencies.emailCodes.requestCode(req.body?.email);
      return res.status(200).json({ ok: true, expiresInSeconds });
    } catch (error) {
      if (error instanceof EmailCodeError) return res.status(statusFor[error.code] ?? 400).json({ code: `PROJECT_OS_AUTH_${error.code}`, ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
      logError("auth.code_request_failed", error);
      return res.status(500).json({ code: "PROJECT_OS_AUTH_FAILED" });
    }
  });

  app.post("/api/auth/email/verify", async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!verifyLimiter.hit(req.ip ?? "unknown")) return res.status(429).json({ code: "PROJECT_OS_AUTH_RATE_LIMITED" });
    try {
      const { email } = await dependencies.emailCodes.verifyCode(req.body?.email, req.body?.code);
      if (!(await dependencies.isEligible(email))) throw new EmailCodeError("CODE_INVALID"); // a code obtained straight from the identity provider opens nothing here
      await startSession(req, res, email, "email");
      return res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof EmailCodeError) return res.status(statusFor[error.code] ?? 401).json({ code: `PROJECT_OS_AUTH_${error.code}` });
      logError("auth.code_verification_failed", error);
      return res.status(500).json({ code: "PROJECT_OS_AUTH_FAILED" });
    }
  });

  const google = dependencies.google;
  if (!google) return;

  app.get("/api/auth/google/start", async (req, res) => {
    const state = newRandom(), nonce = newRandom(), verifier = newRandom(48);
    const cookie = await new SignJWT({ state, nonce, verifier, next: safeNextPath(req.query.next) })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(now() / 1000) + 600)
      .sign(secretKey);
    res.cookie(GOOGLE_STATE_COOKIE, cookie, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600_000 });
    res.redirect(302, buildAuthorizationUrl(google.config, { state, nonce, verifier }));
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const fail = (reason: string) => res.redirect(302, `/login?error=${reason}`);
    res.clearCookie(GOOGLE_STATE_COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (typeof req.query.error === "string") return fail("google_denied");
    if (!code || !state) return fail("google_failed");

    let saved: { state: string; nonce: string; verifier: string; next: string };
    try {
      const raw = parseCookieHeader(req.headers.cookie ?? "")[GOOGLE_STATE_COOKIE];
      if (!raw) return fail("google_failed");
      const { payload } = await jwtVerify(raw, secretKey, { algorithms: ["HS256"] });
      saved = payload as unknown as typeof saved;
    } catch {
      return fail("google_failed");
    }
    const a = Buffer.from(String(saved.state)), b = Buffer.from(state);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return fail("google_failed");

    try {
      const identity = await completeGoogleSignIn(google.config, { code, verifier: saved.verifier, nonce: saved.nonce }, { keys: google.keys, fetchImpl: google.fetchImpl });
      const email = normalizeEmail(identity.email);
      if (!(await dependencies.isEligible(email))) return fail("not_invited");
      await startSession(req, res, email, "google", identity.name);
      return res.redirect(302, safeNextPath(saved.next));
    } catch (error) {
      if (error instanceof GoogleSignInError && error.reason === "EMAIL_NOT_VERIFIED") return fail("google_unverified");
      logError("auth.google_sign_in_failed", error);
      return fail("google_failed");
    }
  });
}

export function googleConfigFromEnvironment(): GoogleConfig | null {
  if (!ENV.googleClientId || !ENV.googleClientSecret || !ENV.appBaseUrl) return null;
  return { clientId: ENV.googleClientId, clientSecret: ENV.googleClientSecret, redirectUri: `${ENV.appBaseUrl}/api/auth/google/callback` };
}

export const googleKeys = () => createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

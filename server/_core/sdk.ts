import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { sessionStore } from "./sessionStore";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  /** names the row in auth_sessions that decides whether this token still counts */
  sid: string;
};

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) return new Map<string, string>();
    return new Map(Object.entries(parseCookieHeader(cookieHeader)));
  }

  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  /**
   * Starts a session for a user identity (users.openId): registers it in the database and signs a token that names it.
   * A token with no live row behind it is refused, which is what makes logging out work in the server.
   */
  async issueSession(openId: string, options: { expiresInMs?: number; name?: string } = {}): Promise<string> {
    if (ENV.cookieSecret.length < 16) throw new Error("JWT_SECRET must be at least 16 characters");
    const user = await db.getUserByOpenId(openId);
    if (!user) throw new Error("Cannot start a session for an unknown user");
    const expiresInMs = options.expiresInMs ?? SESSION_MAX_AGE_MS;
    const sid = await sessionStore.create({ userId: user.id, expiresAt: new Date(Date.now() + expiresInMs) });
    return this.signSession({ openId, appId: ENV.appId, name: options.name || "", sid }, { expiresInMs });
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}): Promise<string> {
    if (ENV.cookieSecret.length < 16) throw new Error("JWT_SECRET must be at least 16 characters");
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? SESSION_MAX_AGE_MS;
    return new SignJWT({ openId: payload.openId, appId: payload.appId, name: payload.name, sid: payload.sid })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor((issuedAt + expiresInMs) / 1000))
      .sign(this.getSessionSecret());
  }

  async verifySession(cookieValue: string | undefined | null): Promise<SessionPayload | null> {
    if (!cookieValue || ENV.cookieSecret.length < 16) return null;
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), { algorithms: ["HS256"] });
      const { openId, appId, name, sid } = payload as Record<string, unknown>;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name) || !isNonEmptyString(sid)) return null;
      return { openId, appId, name, sid };
    } catch {
      return null;
    }
  }

  /**
   * The session cookie is the only credential. There is no Authorization header
   * fallback; scheduled jobs call their own endpoint with a shared secret.
   */
  async authenticateSession(req: Request): Promise<{ user: AuthenticatedUser; sessionId: string }> {
    const sessionToken = this.parseCookies(req.headers.cookie).get(COOKIE_NAME);
    const session = await this.verifySession(sessionToken);
    if (!session) throw ForbiddenError("Invalid session cookie");

    // A valid signature is not enough: the session must still be live in the database (not logged out, not expired).
    const sessionUserId = await sessionStore.findLive(session.sid);
    if (sessionUserId === null) throw ForbiddenError("Session ended");

    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");
    if (user.id !== sessionUserId) throw ForbiddenError("Session does not belong to this user");

    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return { user, sessionId: session.sid };
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    return (await this.authenticateSession(req)).user;
  }

  /** The session named by the request's cookie, if its signature holds (used by logout, which must work even when the user lookup would not). */
  async sessionIdOf(req: Request): Promise<string | null> {
    return (await this.verifySession(this.parseCookies(req.headers.cookie).get(COOKIE_NAME)))?.sid ?? null;
  }
}

/** Result of `sdk.authenticateRequest`. */
export type AuthenticatedUser = User;

export const sdk = new SDKServer();

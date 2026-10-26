import { jwtVerify, SignJWT } from "jose";
import { ENV } from "./env";

// A temporary way past the second step for the PLATFORM OWNER only (owner's decision 2026-10-26, while enrolment was failing on production): the button "Later" starts a 7-day window.
// The window lives in a signed cookie bound to the person (no schema change, so it works while the database is behind), starts ONCE and cannot be renewed from the same browser: the cookie
// outlives the window (30 days) precisely so that its expiry is remembered. Clearing cookies restarts it — a stated limit of a temporary measure.
export const MFA_DEFERRAL_COOKIE = "mfa_deferral";
export const MFA_DEFERRAL_DAYS = 7;
export const MFA_DEFERRAL_COOKIE_MAX_AGE_MS = 30 * 24 * 3_600_000;
const WINDOW_MS = MFA_DEFERRAL_DAYS * 24 * 3_600_000;
const key = () => new TextEncoder().encode(`project-os-mfa-deferral|${ENV.cookieSecret}`);

export async function signDeferral(userId: number, since: number): Promise<string> {
  return new SignJWT({ uid: userId, since }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(Math.floor((since + MFA_DEFERRAL_COOKIE_MAX_AGE_MS) / 1000)).sign(key());
}

/** When this person's deferral began (ms), or null: no cookie, a bad signature, an expired cookie, or a cookie that belongs to someone else. */
export async function deferralSince(cookieValue: string | undefined | null, userId: number): Promise<number | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, key(), { algorithms: ["HS256"] });
    return payload.uid === userId && typeof payload.since === "number" ? payload.since : null;
  } catch { return null; }
}

export const deferralActive = (since: number | null, now = Date.now()) => since !== null && now < since + WINDOW_MS;
export const deferralEnds = (since: number) => new Date(since + WINDOW_MS);

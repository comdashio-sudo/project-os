import { TRPCError } from "@trpc/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { memberships, membershipRoles, permissions, rolePermissions, userMfa, type User } from "../drizzle/schema";
import { rowsAffected, withSystemContext } from "./_core/database";
import { ENV } from "./_core/env";
import { sessionStore } from "./_core/sessionStore";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, matchTotp, normalizeRecoveryCode, openSecret, otpauthUri, sealSecret } from "./_core/totp";
import { logError } from "./_core/logger";
import { schemaReadiness } from "./_core/schemaReady";
import { getDb } from "./db";

/** Five wrong codes lock the second step for fifteen minutes (a six-digit code is guessable otherwise). */
export const MFA_MAX_FAILURES = 5;
export const MFA_LOCK_MS = 15 * 60_000;
const REQUIRED_CACHE_MS = 60_000;

const refuse = (code: "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST" | "TOO_MANY_REQUESTS", message: string) => new TRPCError({ code, message });

// Who must use the second step: the platform owner (users.role = admin) and anyone who administers a company (an active membership holding tenant.manage).
// The administrator lookup is cached for a minute per person, so a request is not an extra query; a person promoted this minute is covered the next.
const requiredCache = new Map<number, { value: boolean; at: number }>();
export const clearMfaRequiredCache = () => requiredCache.clear();

export async function isMfaRequired(user: Pick<User, "id" | "role">, now = Date.now()): Promise<boolean> {
  if (!ENV.mfaEnforced) return false;
  if (user.role === "admin") return true;
  const cached = requiredCache.get(user.id);
  if (cached && now - cached.at < REQUIRED_CACHE_MS) return cached.value;
  const value = await withSystemContext("two-step verification: is this person a company administrator", async () => {
    const db = await getDb(); if (!db) return false;
    const [row] = await db.select({ id: memberships.id }).from(memberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, membershipRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active"), eq(permissions.code, "tenant.manage"))).limit(1);
    return Boolean(row);
  });
  requiredCache.set(user.id, { value, at: now });
  return value;
}

/** The refusal a request gets while it is not yet allowed to do anything but verify (null when it may proceed). One rule for tRPC and for the plain HTTP routes. */
export async function mfaGateRefusal(user: Pick<User, "id" | "role">, mfaVerified: boolean | undefined): Promise<TRPCError | null> {
  if (mfaVerified) return null;
  // The second step needs migration 0011 (user_mfa, auth_sessions.mfa_verified_at). While the database is behind the code, no one can enrol or verify, so refusing everything would lock
  // the owner out of the very screen that applies the fix: the gate waits (and says so in the log) until the schema is there. This is an operational state, not a way round the gate:
  // it opens only when the table itself does not exist.
  if (!(await schemaReadiness()).ready) { logError("mfa.gate_waiting_for_schema", undefined, { userId: user.id }); return null; }
  return (await isMfaRequired(user)) ? refuse("FORBIDDEN", "PROJECT_OS_MFA_REQUIRED") : null;
}

async function database() { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return db; }
const rowOf = async (userId: number) => (await (await database()).select().from(userMfa).where(eq(userMfa.userId, userId)).limit(1))[0];

export type MfaStatus = { required: boolean; enrolled: boolean; verified: boolean };
export async function mfaStatus(user: Pick<User, "id" | "role">, mfaVerified: boolean | undefined): Promise<MfaStatus> {
  if (!(await schemaReadiness()).ready) return { required: false, enrolled: false, verified: false };
  const [required, row] = await Promise.all([isMfaRequired(user), rowOf(user.id)]);
  return { required, enrolled: Boolean(row?.confirmedAt), verified: Boolean(mfaVerified) };
}

/** Starts enrolment: a fresh secret, shown once as text and as an otpauth link. Refused once enrolment is confirmed (a confirmed secret is never replaced from a session that has not proved the old one). */
export async function beginEnrolment(user: Pick<User, "id" | "email" | "openId">): Promise<{ secret: string; otpauthUri: string }> {
  const db = await database();
  const existing = await rowOf(user.id);
  if (existing?.confirmedAt) throw refuse("CONFLICT", "PROJECT_OS_MFA_ALREADY_ENROLLED");
  const secret = generateTotpSecret();
  const values = { secretSealed: sealSecret(secret), confirmedAt: null, recoveryHashes: "[]", lastUsedStep: null, failures: 0, lockedUntil: null };
  if (existing) await db.update(userMfa).set(values).where(eq(userMfa.userId, user.id));
  else await db.insert(userMfa).values({ userId: user.id, ...values });
  return { secret, otpauthUri: otpauthUri(secret, user.email ?? user.openId) };
}

async function recordFailure(userId: number, failures: number, now: Date) {
  const db = await database();
  const next = failures + 1;
  await db.update(userMfa).set(next >= MFA_MAX_FAILURES ? { failures: 0, lockedUntil: new Date(now.getTime() + MFA_LOCK_MS) } : { failures: next }).where(eq(userMfa.userId, userId));
}

const assertNotLocked = (row: { lockedUntil: Date | null }, now: Date) => { if (row.lockedUntil && row.lockedUntil > now) throw refuse("TOO_MANY_REQUESTS", "PROJECT_OS_MFA_LOCKED"); };

/** Accepts the first code, switches two-step verification on, and returns the recovery codes — the only time they are shown. */
export async function confirmEnrolment(user: Pick<User, "id">, sessionId: string, code: string, now = new Date()): Promise<{ recoveryCodes: string[] }> {
  const db = await database();
  const row = await rowOf(user.id);
  if (!row) throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_NOT_ENROLLED");
  if (row.confirmedAt) throw refuse("CONFLICT", "PROJECT_OS_MFA_ALREADY_ENROLLED");
  assertNotLocked(row, now);
  const step = matchTotp(openSecret(row.secretSealed), code, now.getTime(), row.lastUsedStep);
  if (step === null) { await recordFailure(user.id, row.failures, now); throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_CODE_INVALID"); }
  const recoveryCodes = generateRecoveryCodes();
  const updated = await db.update(userMfa).set({ confirmedAt: now, lastUsedStep: step, failures: 0, lockedUntil: null, recoveryHashes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)) })
    .where(and(eq(userMfa.userId, user.id), isNull(userMfa.confirmedAt)));
  if (rowsAffected(updated) !== 1) throw refuse("CONFLICT", "PROJECT_OS_MFA_ALREADY_ENROLLED");
  await sessionStore.markMfaVerified(sessionId, now);
  return { recoveryCodes };
}

/** The second step of a sign-in: an authenticator code, or one of the recovery codes (each works once). On success this session is marked verified. */
export async function verifySecondStep(user: Pick<User, "id">, sessionId: string, code: string, now = new Date()): Promise<{ usedRecoveryCode: boolean; recoveryCodesLeft: number }> {
  const db = await database();
  const row = await rowOf(user.id);
  if (!row?.confirmedAt) throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_NOT_ENROLLED");
  assertNotLocked(row, now);
  const hashes: string[] = JSON.parse(row.recoveryHashes);
  const step = matchTotp(openSecret(row.secretSealed), code, now.getTime(), row.lastUsedStep);
  if (step !== null) {
    // compare-and-set on the step: two parallel requests with the same code cannot both pass
    const won = await db.update(userMfa).set({ lastUsedStep: step, failures: 0, lockedUntil: null })
      .where(and(eq(userMfa.userId, user.id), or(isNull(userMfa.lastUsedStep), lt(userMfa.lastUsedStep, step))));
    if (rowsAffected(won) !== 1) throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_CODE_INVALID");
    await sessionStore.markMfaVerified(sessionId, now);
    return { usedRecoveryCode: false, recoveryCodesLeft: hashes.length };
  }
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length === 10) {
    const hash = hashRecoveryCode(normalized);
    if (hashes.includes(hash)) {
      const remaining = hashes.filter(h => h !== hash);
      // the recovery list is the compare-and-set value: only the request that still sees the code in the list spends it
      const spent = await db.update(userMfa).set({ recoveryHashes: JSON.stringify(remaining), failures: 0, lockedUntil: null }).where(and(eq(userMfa.userId, user.id), eq(userMfa.recoveryHashes, row.recoveryHashes)));
      if (rowsAffected(spent) !== 1) throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_CODE_INVALID");
      await sessionStore.markMfaVerified(sessionId, now);
      return { usedRecoveryCode: true, recoveryCodesLeft: remaining.length };
    }
  }
  await recordFailure(user.id, row.failures, now);
  throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_CODE_INVALID");
}

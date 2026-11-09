import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { auditLogs, companies, memberships, userMfa, type User } from "../drizzle/schema";
import { rowsAffected, withSystemContext } from "./_core/database";
import { ENV } from "./_core/env";
import { deferralActive, deferralEnds } from "./_core/mfaDeferral";
import { sessionStore } from "./_core/sessionStore";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, matchTotp, normalizeRecoveryCode, openSecret, otpauthUri, sealSecret } from "./_core/totp";
import { logError } from "./_core/logger";
import { isSchemaBehind, schemaReadiness } from "./_core/schemaReady";
import { assertTenantManager, getDb } from "./db";

/** Five wrong codes lock the second step for fifteen minutes (a six-digit code is guessable otherwise). */
export const MFA_MAX_FAILURES = 5;
export const MFA_LOCK_MS = 15 * 60_000;
const REQUIRED_CACHE_MS = 60_000;

const refuse = (code: "FORBIDDEN" | "CONFLICT" | "BAD_REQUEST" | "TOO_MANY_REQUESTS", message: string) => new TRPCError({ code, message });

// Who must use the second step (D-81, owner's decision 2026-11-09: «لا أريد الدخول برمزين، فقط رمز دخول واحد يكفي»): NOBODY by default — not the platform owner, not a company
// administrator, not someone who enrolled an authenticator app while it was compulsory. Sign-in is the first factor (the e-mail code) alone. It comes back in two ways only, with no
// exception by role: (1) the person switched it on for himself (user_mfa.required_by_self, from his profile); (2) he holds an ACTIVE membership in ANY company whose administrator
// switched on companies.require_two_step (a person in several companies is asked if one of them asks). This function is where every path meets — the tRPC gate (protectedProcedure
// and mfaProcedure), mfa.status (and through it the MfaGate screen) and the tenant export route all ask it — so the rule changes here and nowhere else.
// The answer is cached for a minute per person; a change of either setting clears the cache, so it takes effect on the next request.
const requiredCache = new Map<number, { value: boolean; at: number }>();
export const clearMfaRequiredCache = () => requiredCache.clear();

type Requirement = { self: boolean; company: boolean };
async function requirementOf(userId: number): Promise<Requirement> {
  try {
    return await withSystemContext("two-step verification: did this person or a company he belongs to ask for it", async () => {
      const db = await getDb(); if (!db) return { self: false, company: false };
      const [[own], [membership]] = await Promise.all([
        db.select({ on: userMfa.requiredBySelf }).from(userMfa).where(and(eq(userMfa.userId, userId), isNotNull(userMfa.confirmedAt))).limit(1),
        db.select({ id: memberships.id }).from(memberships).innerJoin(companies, eq(companies.id, memberships.tenantId))
          .where(and(eq(memberships.userId, userId), eq(memberships.status, "active"), eq(companies.requireTwoStep, true))).limit(1),
      ]);
      return { self: Boolean(own?.on), company: Boolean(membership) };
    });
  } catch (error) {
    // the columns arrive with migration 0023: while the database is behind the code, nobody can have asked for it, so nobody is required (never a lock-out)
    if (isSchemaBehind(error)) return { self: false, company: false };
    throw error;
  }
}

export async function isMfaRequired(user: Pick<User, "id" | "role">, now = Date.now()): Promise<boolean> {
  if (!ENV.mfaEnforced) return false;
  const cached = requiredCache.get(user.id);
  if (cached && now - cached.at < REQUIRED_CACHE_MS) return cached.value;
  const { self, company } = await requirementOf(user.id);
  const value = self || company;
  requiredCache.set(user.id, { value, at: now });
  return value;
}

/** A company's own security choice (D-81): whether its members must pass two-step verification. Off unless the company switched it on. Read and changed by tenant.manage only. */
export async function getCompanySecurity(input: { userId: number; tenantId: string }): Promise<{ requireTwoStep: boolean }> {
  await assertTenantManager(input.userId, input.tenantId);
  if (!(await schemaReadiness()).ready) return { requireTwoStep: false };
  const [row] = await (await database()).select({ requireTwoStep: companies.requireTwoStep }).from(companies).where(eq(companies.id, input.tenantId)).limit(1);
  if (!row) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  return { requireTwoStep: row.requireTwoStep };
}

/** Switches the company's requirement on or off, with its audit row in the same transaction. The change reaches every member on the next request (the cache is cleared). */
export async function setCompanyRequireTwoStep(input: { userId: number; tenantId: string; requireTwoStep: boolean }): Promise<{ requireTwoStep: boolean }> {
  await assertTenantManager(input.userId, input.tenantId);
  if (!(await schemaReadiness()).ready) throw refuse("CONFLICT", "PROJECT_OS_MFA_SETTING_NOT_READY");
  const db = await database();
  await db.transaction(async tx => {
    const [before] = await tx.select({ requireTwoStep: companies.requireTwoStep }).from(companies).where(eq(companies.id, input.tenantId)).limit(1);
    if (!before) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
    // the proof of the write is the row it returns: zero rows (filtered by row-level security, or no such company) is a refusal, never a silent success
    const updated = await tx.update(companies).set({ requireTwoStep: input.requireTwoStep, updatedAt: new Date() }).where(eq(companies.id, input.tenantId)).returning({ id: companies.id });
    if (updated.length !== 1) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "tenant.two_step_requirement_changed", entityType: "company", entityId: input.tenantId, metadata: JSON.stringify({ before: before.requireTwoStep, after: input.requireTwoStep }) });
  });
  clearMfaRequiredCache();
  return { requireTwoStep: input.requireTwoStep };
}

/** The refusal a request gets while it is not yet allowed to do anything but verify (null when it may proceed). One rule for tRPC and for the plain HTTP routes. */
export async function mfaGateRefusal(user: Pick<User, "id" | "role">, mfaVerified: boolean | undefined, deferralSince: number | null = null): Promise<TRPCError | null> {
  if (mfaVerified) return null;
  // the platform owner's temporary "Later" (mfaDeferral.ts): only for role admin, only inside its 7 days
  if (user.role === "admin" && deferralActive(deferralSince)) return null;
  // The second step needs migration 0011 (user_mfa, auth_sessions.mfa_verified_at). While the database is behind the code, no one can enrol or verify, so refusing everything would lock
  // the owner out of the very screen that applies the fix: the gate waits (and says so in the log) until the schema is there. This is an operational state, not a way round the gate:
  // it opens only when the table itself does not exist.
  if (!(await schemaReadiness()).ready) { logError("mfa.gate_waiting_for_schema", undefined, { userId: user.id }); return null; }
  return (await isMfaRequired(user)) ? refuse("FORBIDDEN", "PROJECT_OS_MFA_REQUIRED") : null;
}

async function database() { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return db; }
const rowOf = async (userId: number) => (await (await database()).select().from(userMfa).where(eq(userMfa.userId, userId)).limit(1))[0];

export type MfaStatus = { required: boolean; enrolled: boolean; verified: boolean; /** the owner's "Later" window is running; it ends at this time (ISO) */ postponedUntil: string | null; /** the owner may still press "Later" (never used in this browser) */ canPostpone: boolean;
  /** D-81: the person switched it on himself (profile) */ selfRequired: boolean; /** D-81: a company he is an active member of requires it (he cannot switch it off) */ companyRequired: boolean };
export async function mfaStatus(user: Pick<User, "id" | "role">, mfaVerified: boolean | undefined, deferralSince: number | null = null): Promise<MfaStatus> {
  if (!(await schemaReadiness()).ready) return { required: false, enrolled: false, verified: false, postponedUntil: null, canPostpone: false, selfRequired: false, companyRequired: false };
  const [required, requirement, row] = await Promise.all([isMfaRequired(user), requirementOf(user.id), rowOf(user.id)]);
  const owner = user.role === "admin";
  return { required, enrolled: Boolean(row?.confirmedAt), verified: Boolean(mfaVerified), postponedUntil: owner && deferralActive(deferralSince) ? deferralEnds(deferralSince!).toISOString() : null, canPostpone: owner && deferralSince === null, selfRequired: requirement.self, companyRequired: requirement.company };
}

/** What the screen shows to tell one pending enrolment from another: a short fingerprint of the secret (never the secret). */
export const enrolmentIdOf = (secret: string) => createHash("sha256").update(`project-os-mfa-enrolment|${secret}`).digest("hex").slice(0, 12);

/**
 * Starts enrolment — or CONTINUES it. There is at most ONE pending (unconfirmed) enrolment per person, and asking again (a page reload, a second tab, a second click, a new sign-in) returns the SAME
 * secret, never a new one: a new secret each time left the authenticator app holding a key the server no longer knew, and the right code was refused (2026-10-26). Refused once confirmed
 * (a confirmed secret is never replaced from a session that has not proved the old one).
 */
export async function beginEnrolment(user: Pick<User, "id" | "email" | "openId">): Promise<{ secret: string; otpauthUri: string; enrolmentId: string }> {
  const db = await database();
  const existing = await rowOf(user.id);
  if (existing?.confirmedAt) throw refuse("CONFLICT", "PROJECT_OS_MFA_ALREADY_ENROLLED");
  const account = user.email ?? user.openId;
  if (existing) { const secret = openSecret(existing.secretSealed); return { secret, otpauthUri: otpauthUri(secret, account), enrolmentId: enrolmentIdOf(secret) }; }
  const secret = generateTotpSecret();
  // two first requests at once: the primary key lets one insert win; the loser reads the winner's row and returns THAT secret
  await db.insert(userMfa).values({ userId: user.id, secretSealed: sealSecret(secret), confirmedAt: null, recoveryHashes: "[]", lastUsedStep: null, failures: 0, lockedUntil: null }).onConflictDoNothing();
  const stored = openSecret((await rowOf(user.id))!.secretSealed);
  return { secret: stored, otpauthUri: otpauthUri(stored, account), enrolmentId: enrolmentIdOf(stored) };
}

async function recordFailure(userId: number, failures: number, now: Date) {
  const db = await database();
  const next = failures + 1;
  await db.update(userMfa).set(next >= MFA_MAX_FAILURES ? { failures: 0, lockedUntil: new Date(now.getTime() + MFA_LOCK_MS) } : { failures: next }).where(eq(userMfa.userId, userId));
}

const assertNotLocked = (row: { lockedUntil: Date | null }, now: Date) => { if (row.lockedUntil && row.lockedUntil > now) throw refuse("TOO_MANY_REQUESTS", "PROJECT_OS_MFA_LOCKED"); };

/** Accepts the first code, switches two-step verification on, and returns the recovery codes — the only time they are shown. */
export async function confirmEnrolment(user: Pick<User, "id">, sessionId: string, code: string, enrolmentId?: string, now = new Date(), turnOn = false): Promise<{ recoveryCodes: string[] }> {
  const db = await database();
  const row = await rowOf(user.id);
  if (!row) throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_NOT_ENROLLED");
  if (row.confirmedAt) throw refuse("CONFLICT", "PROJECT_OS_MFA_ALREADY_ENROLLED");
  assertNotLocked(row, now);
  const secret = openSecret(row.secretSealed);
  // the code is checked against the enrolment the person was SHOWN: if the screen's enrolment is not the stored one, say so instead of "wrong code"
  if (enrolmentId !== undefined && enrolmentId !== enrolmentIdOf(secret)) throw refuse("CONFLICT", "PROJECT_OS_MFA_ENROLMENT_CHANGED");
  const step = matchTotp(secret, code, now.getTime(), row.lastUsedStep);
  if (step === null) { await recordFailure(user.id, row.failures, now); throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_CODE_INVALID"); }
  const recoveryCodes = generateRecoveryCodes();
  // turnOn: the person enrols from his profile to switch it on for himself (D-81); an enrolment the company's requirement asked for does not add a personal requirement
  const updated = await db.update(userMfa).set({ confirmedAt: now, lastUsedStep: step, failures: 0, lockedUntil: null, recoveryHashes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)), ...(turnOn ? { requiredBySelf: true } : {}) })
    .where(and(eq(userMfa.userId, user.id), isNull(userMfa.confirmedAt)));
  if (rowsAffected(updated) !== 1) throw refuse("CONFLICT", "PROJECT_OS_MFA_ALREADY_ENROLLED");
  if (turnOn) clearMfaRequiredCache();
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

/**
 * D-81: the person switches the second step on or off for himself, from his profile. Either way he proves he holds the authenticator now (a current app code or an unused
 * recovery code: the same check as a sign-in, so a stolen first-factor session cannot switch it off). Switching off is refused while a company he belongs to requires it.
 * The authenticator itself (secret, recovery codes) is kept either way: switching on again needs no new enrolment.
 */
export async function setOwnTwoStep(user: Pick<User, "id">, sessionId: string, on: boolean, code: string, now = new Date()): Promise<{ selfRequired: boolean }> {
  if (!(await schemaReadiness()).ready) throw refuse("CONFLICT", "PROJECT_OS_MFA_SETTING_NOT_READY");
  if (!on && (await requirementOf(user.id)).company) throw refuse("CONFLICT", "PROJECT_OS_MFA_REQUIRED_BY_COMPANY");
  await verifySecondStep(user, sessionId, code, now);
  const updated = await (await database()).update(userMfa).set({ requiredBySelf: on }).where(and(eq(userMfa.userId, user.id), isNotNull(userMfa.confirmedAt))).returning({ userId: userMfa.userId });
  if (updated.length !== 1) throw refuse("BAD_REQUEST", "PROJECT_OS_MFA_NOT_ENROLLED");
  clearMfaRequiredCache();
  return { selfRequired: on };
}

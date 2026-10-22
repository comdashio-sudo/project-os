import { sql } from "drizzle-orm";
import { getDb, withSystemContext } from "../database";
import type { AttemptLimiter } from "./emailCode";

// Sign-in happens before anyone has a company, so these statements run in the system context (see server/_core/database.ts). The table holds
// a hash of the address and counters, nothing else.
export const createDbAttemptLimiter = (): AttemptLimiter => ({
  async lockedUntil(emailHash, now) {
    const db = await getDb();
    if (!db) return null;
    return withSystemContext("sign-in attempt check", async () => {
      const { rows } = await db.execute(sql`SELECT locked_until FROM auth_code_attempts WHERE email_hash = ${emailHash} AND locked_until > ${now}`);
      const value = (rows[0] as { locked_until?: Date | string } | undefined)?.locked_until;
      return value ? new Date(value) : null;
    });
  },

  /** One wrong code, counted atomically (two simultaneous guesses cannot both slip under the limit). Returns the locked-until time when this guess reached it. */
  async recordFailure(emailHash, now, policy) {
    const db = await getDb();
    if (!db) return null;
    const windowStart = new Date(now.getTime() - policy.windowMs);
    const lockUntil = new Date(now.getTime() + policy.lockMs);
    return withSystemContext("sign-in attempt count", async () => {
      const { rows } = await db.execute(sql`
        INSERT INTO auth_code_attempts (email_hash, failures, window_started_at, locked_until, updated_at)
        VALUES (${emailHash}, 1, ${now}, CASE WHEN ${policy.max} <= 1 THEN ${lockUntil}::timestamptz ELSE NULL END, ${now})
        ON CONFLICT (email_hash) DO UPDATE SET
          failures = CASE WHEN auth_code_attempts.window_started_at < ${windowStart} AND (auth_code_attempts.locked_until IS NULL OR auth_code_attempts.locked_until <= ${now}) THEN 1 ELSE auth_code_attempts.failures + 1 END,
          window_started_at = CASE WHEN auth_code_attempts.window_started_at < ${windowStart} AND (auth_code_attempts.locked_until IS NULL OR auth_code_attempts.locked_until <= ${now}) THEN ${now}::timestamptz ELSE auth_code_attempts.window_started_at END,
          locked_until = CASE
            WHEN (CASE WHEN auth_code_attempts.window_started_at < ${windowStart} AND (auth_code_attempts.locked_until IS NULL OR auth_code_attempts.locked_until <= ${now}) THEN 1 ELSE auth_code_attempts.failures + 1 END) >= ${policy.max} THEN ${lockUntil}::timestamptz
            ELSE auth_code_attempts.locked_until END,
          updated_at = ${now}
        RETURNING locked_until`);
      const value = (rows[0] as { locked_until?: Date | string | null } | undefined)?.locked_until;
      return value ? new Date(value) : null;
    });
  },

  async clear(emailHash) {
    const db = await getDb();
    if (!db) return;
    await withSystemContext("sign-in attempt reset", async () => { await db.execute(sql`DELETE FROM auth_code_attempts WHERE email_hash = ${emailHash}`); });
  },
});

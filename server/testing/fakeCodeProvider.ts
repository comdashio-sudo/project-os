// An in-memory stand-in for Supabase Auth's e-mail code, for tests that are about OUR code (routes, sessions, the guess limit) and must run
// without Docker. It follows what a real GoTrue 2.176 answered when it was driven for this (server/auth.gotrue.live.test.ts proves the real one):
// a code works once; a wrong, an expired, a reused and an unknown-address code all fail the same way; a second request for one address inside the
// minimum interval is rate-limited; the answer to a request does not say whether the address has an account.
import { EmailCodeError, type AttemptLimiter } from "../_core/auth/emailCode";
import type { CodeProvider } from "../_core/auth/supabaseAuth";

export type FakeCodeProviderOptions = { now?: () => Date; randomCode?: () => string; ttlMs?: number; minIntervalMs?: number };

export function createFakeCodeProvider(options: FakeCodeProviderOptions = {}) {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? 60 * 60 * 1000;
  const minIntervalMs = options.minIntervalMs ?? 60 * 1000;
  let counter = 0;
  const randomCode = options.randomCode ?? (() => String(100000 + counter++));
  const open = new Map<string, { code: string; issuedAt: number }>();
  const sentAt = new Map<string, number>();
  const sent: Array<{ to: string; code: string; text: string }> = [];
  let unavailable = false;

  const provider: CodeProvider = {
    async sendCode(email) {
      if (unavailable) throw new EmailCodeError("MAIL_UNAVAILABLE");
      const at = now().getTime();
      const last = sentAt.get(email);
      if (last !== undefined && at - last < minIntervalMs) throw new EmailCodeError("RATE_LIMITED", Math.ceil((minIntervalMs - (at - last)) / 1000)); // as GoTrue: "after N seconds"
      const code = randomCode();
      open.set(email, { code, issuedAt: at });
      sentAt.set(email, at);
      sent.push({ to: email, code, text: `Your code: ${code}` });
    },
    async verifyCode(email, code) {
      if (unavailable) throw new EmailCodeError("MAIL_UNAVAILABLE");
      const entry = open.get(email);
      if (!entry || entry.code !== code || now().getTime() - entry.issuedAt > ttlMs) throw new EmailCodeError("CODE_INVALID");
      open.delete(email); // single use
      return { email };
    },
  };
  return { provider, sent, setUnavailable: (value: boolean) => { unavailable = value; } };
}

/** The same limiter contract the database-backed one keeps, in memory. */
export function createMemoryAttemptLimiter(): AttemptLimiter & { rows: Map<string, { failures: number; windowStartedAt: number; lockedUntil: number | null }> } {
  const rows = new Map<string, { failures: number; windowStartedAt: number; lockedUntil: number | null }>();
  return {
    rows,
    async lockedUntil(emailHash, now) { const row = rows.get(emailHash); return row?.lockedUntil && row.lockedUntil > now.getTime() ? new Date(row.lockedUntil) : null; },
    async recordFailure(emailHash, now, policy) {
      const at = now.getTime();
      const row = rows.get(emailHash);
      const locked = row?.lockedUntil !== null && row?.lockedUntil !== undefined && row.lockedUntil > at;
      const expired = !row || (row.windowStartedAt < at - policy.windowMs && !locked);
      const failures = expired ? 1 : row!.failures + 1;
      const lockedUntil = failures >= policy.max ? at + policy.lockMs : (expired ? null : row!.lockedUntil);
      rows.set(emailHash, { failures, windowStartedAt: expired ? at : row!.windowStartedAt, lockedUntil });
      return lockedUntil && lockedUntil > at ? new Date(lockedUntil) : null;
    },
    async clear(emailHash) { rows.delete(emailHash); },
  };
}

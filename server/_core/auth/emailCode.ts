// Sign-in by a one-time code sent to the user's e-mail address.
//
// The code is generated, mailed, expired and counted by Supabase Auth; this file holds what the app still decides:
// which addresses are well formed, the stable account identity derived from a verified address, and the error
// vocabulary the routes and the screen speak. Every failure to verify looks the same to the caller.
import { createHash } from "node:crypto";
import type { CodeProvider } from "./supabaseAuth";

/** What the screen may say about how long a code lives. Supabase's own default is one hour (Authentication > Email > Email OTP Expiration). */
export const DEFAULT_CODE_TTL_SECONDS = 60 * 60;

export type EmailCodeErrorCode = "EMAIL_INVALID" | "RATE_LIMITED" | "MAIL_UNAVAILABLE" | "CODE_INVALID" | "CREDENTIALS_INVALID" | "PASSWORD_WEAK";

export class EmailCodeError extends Error {
  /** `retryAfterSeconds` is set only when the provider said how long to wait ("after 49 seconds"): the screen turns it into a countdown and tells the person to use the code already sent. */
  constructor(readonly code: EmailCodeErrorCode, readonly retryAfterSeconds?: number) {
    super(code);
    this.name = "EmailCodeError";
  }
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new EmailCodeError("EMAIL_INVALID");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new EmailCodeError("EMAIL_INVALID");
  return email;
}

export const hashEmail = (email: string) => createHash("sha256").update(email).digest("hex");

/** Stable account identity derived from the verified address (users.openId, 46 chars). Unchanged by the move to Supabase Auth, so no account is orphaned. */
export const openIdForEmail = (email: string) => `email:${hashEmail(email).slice(0, 40)}`;

/** The guess limit Supabase Auth does not give: wrong codes per address, counted by the app and shared by every server instance. */
export const ATTEMPT_POLICY = { max: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 } as const;
export interface AttemptLimiter {
  /** When this address is locked, until when (null when it may try). */
  lockedUntil(emailHash: string, now: Date): Promise<Date | null>;
  /** Counts one wrong code; returns the end of the lock when this guess reached the limit. */
  recordFailure(emailHash: string, now: Date, policy: typeof ATTEMPT_POLICY): Promise<Date | null>;
  clear(emailHash: string): Promise<void>;
}

/** D-82: at least 8 characters (owner's order); at most 72, the most GoTrue's bcrypt reads (a longer one would be cut silently). */
export const PASSWORD_POLICY = { min: 8, max: 72 } as const;
/** Wrong passwords are counted apart from wrong codes (a mailed code still works while the password is locked), under a key that cannot collide with a code key. */
export const passwordAttemptKey = (email: string) => hashEmail(`password:${email}`);

export type EmailCodeServiceDependencies = { provider: CodeProvider | null; attempts?: AttemptLimiter; ttlSeconds?: number; now?: () => Date };

export function createEmailCodeService(dependencies: EmailCodeServiceDependencies) {
  const { provider } = dependencies;
  const ttlSeconds = dependencies.ttlSeconds ?? DEFAULT_CODE_TTL_SECONDS;
  const attempts = dependencies.attempts;
  const now = dependencies.now ?? (() => new Date());

  return {
    async requestCode(rawEmail: unknown): Promise<{ expiresInSeconds: number }> {
      const email = normalizeEmail(rawEmail);
      if (!provider) throw new EmailCodeError("MAIL_UNAVAILABLE");
      await provider.sendCode(email);
      return { expiresInSeconds: ttlSeconds };
    },

    /** Resolves with the verified address, or throws CODE_INVALID for every kind of failure. */
    async verifyCode(rawEmail: unknown, rawCode: unknown): Promise<{ email: string }> {
      return withCode(rawEmail, rawCode, (email, code) => provider!.verifyCode(email, code));
    },

    /**
     * D-82: sign-in by the password GoTrue holds. Every wrong password, unknown and unconfirmed address throws CREDENTIALS_INVALID (one answer, no enumeration).
     * Five wrong ones in 15 minutes lock the address for 15 minutes (RATE_LIMITED with the seconds left), checked BEFORE GoTrue is asked, so the right password
     * does not open a lock; the source-address limit of the route stays on top. The password is passed through and never stored, logged or put in an error.
     */
    async signInWithPassword(rawEmail: unknown, rawPassword: unknown): Promise<{ email: string }> {
      let email: string;
      try { email = normalizeEmail(rawEmail); } catch { throw new EmailCodeError("CREDENTIALS_INVALID"); }
      if (typeof rawPassword !== "string" || !rawPassword || rawPassword.length > PASSWORD_POLICY.max) throw new EmailCodeError("CREDENTIALS_INVALID");
      if (!provider) throw new EmailCodeError("MAIL_UNAVAILABLE");
      const key = passwordAttemptKey(email);
      const lockedUntil = attempts ? await attempts.lockedUntil(key, now()) : null;
      if (lockedUntil) throw new EmailCodeError("RATE_LIMITED", Math.max(1, Math.ceil((lockedUntil.getTime() - now().getTime()) / 1000)));
      try {
        const signedIn = await provider.signInWithPassword(email, rawPassword);
        await attempts?.clear(key);
        return signedIn;
      } catch (error) {
        if (error instanceof EmailCodeError && error.code === "CREDENTIALS_INVALID") await attempts?.recordFailure(key, now(), ATTEMPT_POLICY);
        throw error;
      }
    },

    /** D-82: set or replace the password with a mailed code (the code from requestCode). A weak password is refused before the code is spent. Clears the password lock. */
    async setPassword(rawEmail: unknown, rawCode: unknown, rawPassword: unknown): Promise<{ email: string }> {
      if (typeof rawPassword !== "string" || rawPassword.length < PASSWORD_POLICY.min || rawPassword.length > PASSWORD_POLICY.max || !rawPassword.trim()) throw new EmailCodeError("PASSWORD_WEAK");
      const result = await withCode(rawEmail, rawCode, (email, code) => provider!.setPasswordWithCode(email, code, rawPassword));
      await attempts?.clear(passwordAttemptKey(result.email));
      return result;
    },
  };

  /** A mailed code, checked under the per-address guess limit: a locked address is refused before the provider is asked (five wrong guesses cannot become six). */
  async function withCode(rawEmail: unknown, rawCode: unknown, use: (email: string, code: string) => Promise<{ email: string }>): Promise<{ email: string }> {
    let email: string;
    try {
      email = normalizeEmail(rawEmail);
    } catch {
      throw new EmailCodeError("CODE_INVALID");
    }
    if (typeof rawCode !== "string" || !/^\d{6,10}$/.test(rawCode.trim())) throw new EmailCodeError("CODE_INVALID");
    if (!provider) throw new EmailCodeError("MAIL_UNAVAILABLE");
    const emailHash = hashEmail(email);
    if (attempts && (await attempts.lockedUntil(emailHash, now()))) throw new EmailCodeError("CODE_INVALID");
    try {
      const verified = await use(email, rawCode.trim());
      await attempts?.clear(emailHash);
      return verified;
    } catch (error) {
      if (error instanceof EmailCodeError && error.code === "CODE_INVALID") await attempts?.recordFailure(emailHash, now(), ATTEMPT_POLICY);
      throw error;
    }
  }
}

export type EmailCodeService = ReturnType<typeof createEmailCodeService>;

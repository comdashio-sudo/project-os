// Sign-in by a one-time code sent to the user's e-mail address.
//
// The code is generated, mailed, expired and counted by Supabase Auth; this file holds what the app still decides:
// which addresses are well formed, the stable account identity derived from a verified address, and the error
// vocabulary the routes and the screen speak. Every failure to verify looks the same to the caller.
import { createHash } from "node:crypto";
import type { CodeProvider } from "./supabaseAuth";

/** What the screen may say about how long a code lives. Supabase's own default is one hour (Authentication > Email > Email OTP Expiration). */
export const DEFAULT_CODE_TTL_SECONDS = 60 * 60;

export type EmailCodeErrorCode = "EMAIL_INVALID" | "RATE_LIMITED" | "MAIL_UNAVAILABLE" | "CODE_INVALID";

export class EmailCodeError extends Error {
  constructor(readonly code: EmailCodeErrorCode) {
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
      let email: string;
      try {
        email = normalizeEmail(rawEmail);
      } catch {
        throw new EmailCodeError("CODE_INVALID");
      }
      if (typeof rawCode !== "string" || !/^\d{6,10}$/.test(rawCode.trim())) throw new EmailCodeError("CODE_INVALID");
      if (!provider) throw new EmailCodeError("MAIL_UNAVAILABLE");
      const emailHash = hashEmail(email);
      // A locked address is refused before the provider is asked: five wrong guesses cannot become six, and the right code does not help until the lock ends.
      if (attempts && (await attempts.lockedUntil(emailHash, now()))) throw new EmailCodeError("CODE_INVALID");
      try {
        const verified = await provider.verifyCode(email, rawCode.trim());
        await attempts?.clear(emailHash);
        return verified;
      } catch (error) {
        if (error instanceof EmailCodeError && error.code === "CODE_INVALID") await attempts?.recordFailure(emailHash, now(), ATTEMPT_POLICY);
        throw error;
      }
    },
  };
}

export type EmailCodeService = ReturnType<typeof createEmailCodeService>;

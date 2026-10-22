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

export type EmailCodeServiceDependencies = { provider: CodeProvider | null; ttlSeconds?: number };

export function createEmailCodeService(dependencies: EmailCodeServiceDependencies) {
  const { provider } = dependencies;
  const ttlSeconds = dependencies.ttlSeconds ?? DEFAULT_CODE_TTL_SECONDS;

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
      return provider.verifyCode(email, rawCode.trim());
    },
  };
}

export type EmailCodeService = ReturnType<typeof createEmailCodeService>;

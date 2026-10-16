// Sign-in by a one-time code sent to the user's e-mail address.
//
// Rules that make a six-digit code safe enough:
//  - only an HMAC of the code is stored, never the code, and never the address
//    (the table keeps a hash of the normalized address);
//  - a code lives 10 minutes, accepts 5 guesses (each one is claimed atomically
//    BEFORE it is compared, so simultaneous guesses cannot exceed the limit),
//    and works once;
//  - a new request retires the open code, at most 5 requests an hour per
//    address, and at least 30 seconds between two;
//  - every failure to verify looks the same to the caller.
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MAX_REQUESTS_PER_HOUR = 5;
export const MIN_REQUEST_INTERVAL_MS = 30 * 1000;

export type EmailCodeErrorCode = "EMAIL_INVALID" | "RATE_LIMITED" | "MAIL_UNAVAILABLE" | "CODE_INVALID";

export class EmailCodeError extends Error {
  constructor(readonly code: EmailCodeErrorCode) {
    super(code);
    this.name = "EmailCodeError";
  }
}

export type LoginCodeRow = { id: string; emailHash: string; codeHash: string; expiresAt: Date; attempts: number; consumedAt: Date | null; createdAt: Date };

export interface LoginCodeRepository {
  countSince(emailHash: string, since: Date): Promise<number>;
  latestCreatedAt(emailHash: string): Promise<Date | null>;
  retireOpen(emailHash: string, now: Date): Promise<void>;
  insert(row: Omit<LoginCodeRow, "attempts" | "consumedAt">): Promise<void>;
  findOpen(emailHash: string, now: Date): Promise<LoginCodeRow | null>;
  /**
   * Takes one of the `max` guesses a code allows, atomically: true only for a call
   * that got a free guess. Two simultaneous guesses on a code with one guess left
   * cannot both get it, which is what a read-then-increment could not promise.
   */
  claimAttempt(id: string, max: number): Promise<boolean>;
  /** true only for the call that actually consumed the row. */
  consume(id: string, now: Date): Promise<boolean>;
}

export type OutgoingMail = { to: string; subject: string; text: string; html: string };
export interface Mailer {
  send(mail: OutgoingMail): Promise<void>;
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new EmailCodeError("EMAIL_INVALID");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new EmailCodeError("EMAIL_INVALID");
  return email;
}

export const hashEmail = (email: string) => createHash("sha256").update(email).digest("hex");

/** Stable account identity derived from the verified address (users.openId, 46 chars). */
export const openIdForEmail = (email: string) => `email:${hashEmail(email).slice(0, 40)}`;

const hashCode = (secret: string, emailHash: string, code: string) => createHmac("sha256", secret).update(`${emailHash}:${code}`).digest("hex");

const equalHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));

export function loginMail(email: string, code: string): OutgoingMail {
  const minutes = CODE_TTL_MS / 60000;
  return {
    to: email,
    subject: `PROJECT OS — ${code} رمز الدخول / Sign-in code`,
    text: `رمز الدخول إلى PROJECT OS: ${code}\nصالح لمدة ${minutes} دقائق ولمرة واحدة. إن لم تطلبه فتجاهل هذه الرسالة.\n\nYour PROJECT OS sign-in code: ${code}\nValid for ${minutes} minutes, single use. If you did not ask for it, ignore this message.`,
    html: `<div dir="rtl" style="font-family:system-ui,sans-serif"><p>رمز الدخول إلى PROJECT OS:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>صالح لمدة ${minutes} دقائق ولمرة واحدة. إن لم تطلبه فتجاهل هذه الرسالة.</p></div><div dir="ltr" style="font-family:system-ui,sans-serif"><p>Your PROJECT OS sign-in code is above. Valid for ${minutes} minutes, single use. If you did not ask for it, ignore this message.</p></div>`,
  };
}

export type EmailCodeServiceDependencies = {
  repository: LoginCodeRepository;
  mailer: Mailer | null;
  secret: string;
  now?: () => Date;
  randomCode?: () => string;
};

export function createEmailCodeService(dependencies: EmailCodeServiceDependencies) {
  const { repository, mailer, secret } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const randomCode = dependencies.randomCode ?? (() => String(randomInt(0, 1_000_000)).padStart(6, "0"));
  if (secret.length < 16) throw new Error("JWT_SECRET must be at least 16 characters");

  return {
    async requestCode(rawEmail: unknown): Promise<{ expiresInSeconds: number }> {
      const email = normalizeEmail(rawEmail);
      if (!mailer) throw new EmailCodeError("MAIL_UNAVAILABLE");
      const emailHash = hashEmail(email);
      const at = now();

      const last = await repository.latestCreatedAt(emailHash);
      if (last && at.getTime() - last.getTime() < MIN_REQUEST_INTERVAL_MS) throw new EmailCodeError("RATE_LIMITED");
      if ((await repository.countSince(emailHash, new Date(at.getTime() - 60 * 60 * 1000))) >= MAX_REQUESTS_PER_HOUR) throw new EmailCodeError("RATE_LIMITED");

      const code = randomCode();
      await repository.retireOpen(emailHash, at);
      const id = randomUUID();
      await repository.insert({ id, emailHash, codeHash: hashCode(secret, emailHash, code), expiresAt: new Date(at.getTime() + CODE_TTL_MS), createdAt: at });
      try {
        await mailer.send(loginMail(email, code));
      } catch {
        await repository.consume(id, now());
        throw new EmailCodeError("MAIL_UNAVAILABLE");
      }
      return { expiresInSeconds: CODE_TTL_MS / 1000 };
    },

    /** Resolves with the verified address, or throws CODE_INVALID for every kind of failure. */
    async verifyCode(rawEmail: unknown, rawCode: unknown): Promise<{ email: string }> {
      let email: string;
      try {
        email = normalizeEmail(rawEmail);
      } catch {
        throw new EmailCodeError("CODE_INVALID");
      }
      if (typeof rawCode !== "string" || !/^\d{6}$/.test(rawCode.trim())) throw new EmailCodeError("CODE_INVALID");
      const code = rawCode.trim();
      const emailHash = hashEmail(email);
      const at = now();

      const open = await repository.findOpen(emailHash, at);
      if (!open) throw new EmailCodeError("CODE_INVALID");
      // Every guess, right or wrong, spends one of the five before it is looked at.
      if (!(await repository.claimAttempt(open.id, MAX_ATTEMPTS))) {
        await repository.consume(open.id, at);
        throw new EmailCodeError("CODE_INVALID");
      }
      if (!equalHex(open.codeHash, hashCode(secret, emailHash, code))) throw new EmailCodeError("CODE_INVALID");
      if (!(await repository.consume(open.id, at))) throw new EmailCodeError("CODE_INVALID");
      return { email };
    },
  };
}

export type EmailCodeService = ReturnType<typeof createEmailCodeService>;

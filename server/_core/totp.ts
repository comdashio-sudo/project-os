import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ENV } from "./env";

// RFC 6238 time-based one-time passwords (HMAC-SHA1, 6 digits, 30-second steps) — what every authenticator app speaks. No dependency: the algorithm is
// forty lines and the RFC publishes its test vectors, which server/totp.test.ts checks.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0; let value = 0; let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0; let value = 0; const out: number[] = [];
  for (const ch of clean) {
    const index = ALPHABET.indexOf(ch);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

/** The code for one 30-second step. `digits` is a parameter only so the RFC's 8-digit vectors can be checked. */
export function totpCode(secretBase32: string, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const stepAt = (now: number) => Math.floor(now / 1000 / TOTP_STEP_SECONDS);

/**
 * The step a code matches within one step either side (a phone clock a few seconds off), or null. A step at or before `lastUsedStep` never matches:
 * a code is good once, so one that was shoulder-surfed or intercepted cannot be replayed within its 90-second window.
 */
export function matchTotp(secretBase32: string, submitted: string, now: number, lastUsedStep: number | null): number | null {
  const code = submitted.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const current = stepAt(now);
  let matched: number | null = null;
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    const expected = Buffer.from(totpCode(secretBase32, step));
    // every candidate is compared, so the time taken does not say which step (or whether any) matched
    if (timingSafeEqual(expected, Buffer.from(code)) && matched === null) matched = step;
  }
  return matched;
}

export const otpauthUri = (secretBase32: string, account: string, issuer = "Dashio") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;

// The secret is kept encrypted (AES-256-GCM, key derived from the server secret), so a database copy on its own cannot produce a code.
const key = () => createHash("sha256").update(`project-os-mfa-secret|${ENV.cookieSecret}`).digest();
export function sealSecret(secretBase32: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(secretBase32, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${body.toString("base64")}`;
}
export function openSecret(sealed: string): string {
  const [iv, tag, body] = sealed.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

// Recovery codes: ten, shown once, stored as hashes, each good once. They are the way back in when the phone is lost.
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = Array.from(randomBytes(10), b => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
export const normalizeRecoveryCode = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();
export const hashRecoveryCode = (code: string) => createHash("sha256").update(`project-os-mfa-recovery|${ENV.cookieSecret}|${normalizeRecoveryCode(code)}`).digest("hex");

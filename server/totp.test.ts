import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, hashRecoveryCode, matchTotp, normalizeRecoveryCode, openSecret, otpauthUri, sealSecret, totpCode } from "./_core/totp";

// RFC 6238 appendix B: the shared secret is the ASCII string "12345678901234567890"; these are its published 8-digit codes.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const RFC_VECTORS: Array<[number, string]> = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];

describe("TOTP (RFC 6238)", () => {
  it.each(RFC_VECTORS)("matches the RFC's published code at t=%i", (seconds, expected) => {
    expect(totpCode(RFC_SECRET, Math.floor(seconds / 30), 8)).toBe(expected);
  });
  it("base32 round-trips", () => {
    const bytes = Buffer.from("hello dashio");
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    expect(() => base32Decode("not*base32")).toThrow();
  });
  it("accepts the current step and one either side, nothing further", () => {
    const now = 1_700_000_000_000; const step = Math.floor(now / 30_000);
    for (const delta of [-1, 0, 1]) expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + delta), now, null)).toBe(step + delta);
    for (const delta of [-2, 2]) expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + delta), now, null)).toBeNull();
  });
  it("NEGATIVE: a code already used (its step, or any earlier) is refused, and malformed input never matches", () => {
    const now = 1_700_000_000_000; const step = Math.floor(now / 30_000); const code = totpCode(RFC_SECRET, step);
    expect(matchTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, step)).toBeNull();
    for (const bad of ["", "12345", "1234567", "abcdef", "12 34 5x"]) expect(matchTotp(RFC_SECRET, bad, now, null)).toBeNull();
  });
  it("a spaced code (as an app displays it) is accepted", () => {
    const now = 1_700_000_000_000; const code = totpCode(RFC_SECRET, Math.floor(now / 30_000));
    expect(matchTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now, null)).not.toBeNull();
  });
  it("the stored secret is sealed: it opens back to the original, differs each time, and tampering fails", () => {
    const sealed = sealSecret(RFC_SECRET);
    expect(sealed).not.toContain(RFC_SECRET);
    expect(openSecret(sealed)).toBe(RFC_SECRET);
    expect(sealSecret(RFC_SECRET)).not.toBe(sealed);
    const [iv, tag, body] = sealed.split(".");
    expect(() => openSecret(`${iv}.${tag}.${Buffer.from("tampered").toString("base64")}`)).toThrow();
  });
  it("recovery codes: ten distinct, hashed, and matched whatever the case or dash", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(hashRecoveryCode(codes[0])).toBe(hashRecoveryCode(codes[0].toLowerCase().replace("-", " ")));
    expect(hashRecoveryCode(codes[0])).not.toBe(hashRecoveryCode(codes[1]));
    expect(normalizeRecoveryCode("abcde-fghjk")).toBe("ABCDEFGHJK");
  });
  it("the otpauth URI carries the secret, issuer, digits and period", () => {
    const uri = otpauthUri("ABC234", "owner@example.test");
    expect(uri).toBe("otpauth://totp/Dashio:owner%40example.test?secret=ABC234&issuer=Dashio&algorithm=SHA1&digits=6&period=30");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionCookieOptions } from "./cookies";

const request = (headers: Record<string, string> = {}, protocol = "http") => ({ headers, protocol }) as never;
afterEach(() => vi.unstubAllEnvs());

describe("session cookie options", () => {
  it("is HttpOnly, SameSite=Lax and site-wide on every request", () => {
    for (const options of [getSessionCookieOptions(request()), getSessionCookieOptions(request({}, "https"))]) {
      expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
      expect(options.domain).toBeUndefined(); // host-only: never shared with a sibling sub-domain
    }
  });

  it("is Secure in production even when the proxy hides that the connection was https", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getSessionCookieOptions(request()).secure).toBe(true);
    expect(getSessionCookieOptions(request({ "x-forwarded-proto": "http" })).secure).toBe(true);
  });

  it("is Secure outside production when the connection is https, directly or through a proxy, and only plain local http goes without", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSessionCookieOptions(request({}, "https")).secure).toBe(true);
    expect(getSessionCookieOptions(request({ "x-forwarded-proto": "https" })).secure).toBe(true);
    expect(getSessionCookieOptions(request({ "x-forwarded-proto": "http, https" })).secure).toBe(true);
    expect(getSessionCookieOptions(request()).secure).toBe(false);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createSupabaseCodeProvider, supabaseAuthConfigFromEnv } from "./supabaseAuth";
import { EmailCodeError } from "./emailCode";

// The response bodies below are the ones a real GoTrue v2.176.1 returned when this was written (server/auth.gotrue.live.test.ts drives the real one).
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const OK_SESSION = { access_token: "a.b.c", token_type: "bearer", expires_in: 3600, expires_at: 1, refresh_token: "r", user: { id: "u", email: "engineer@example.test", email_confirmed_at: "2026-10-22T12:00:00Z" } };

function provider(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit; body: unknown }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { const body = init?.body ? JSON.parse(String(init.body)) : undefined; calls.push({ url: String(url), init: init ?? {}, body }); return handler(String(url), init ?? {}); });
  return { calls, provider: createSupabaseCodeProvider({ url: "https://ref0123.supabase.co", anonKey: "anon-key-for-tests", fetchImpl: fetchImpl as unknown as typeof fetch }) };
}
const failure = async (promise: Promise<unknown>) => { try { await promise; } catch (error) { return error as EmailCodeError; } throw new Error("expected a failure"); };

describe("configuration", () => {
  it("needs the project URL and the anon key, and trims a trailing slash", () => {
    expect(supabaseAuthConfigFromEnv({})).toBeNull();
    expect(supabaseAuthConfigFromEnv({ SUPABASE_URL: "https://ref0123.supabase.co" })).toBeNull();
    expect(supabaseAuthConfigFromEnv({ SUPABASE_URL: "https://ref0123.supabase.co/", SUPABASE_ANON_KEY: "k" })).toEqual({ url: "https://ref0123.supabase.co", anonKey: "k" });
    expect(supabaseAuthConfigFromEnv({ SUPABASE_URL: "http://127.0.0.1:9999", SUPABASE_ANON_KEY: "k", SUPABASE_AUTH_URL: "http://127.0.0.1:9999/" })).toMatchObject({ authUrl: "http://127.0.0.1:9999" });
  });
});

describe("asking for a code", () => {
  it("posts the address to /auth/v1/otp with the anon key and creates the user on first sign-in", async () => {
    const { provider: p, calls } = provider(() => json(200, {}));
    await p.sendCode("engineer@example.test");
    expect(calls[0].url).toBe("https://ref0123.supabase.co/auth/v1/otp");
    expect(calls[0].body).toEqual({ email: "engineer@example.test", create_user: true });
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe("anon-key-for-tests");
    expect(JSON.stringify(calls[0].init)).not.toContain("service_role");
  });

  it("maps the provider's own answers: rate limit, invalid address, anything else is unavailable", async () => {
    expect((await failure(provider(() => json(429, { code: 429, error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 49 seconds." })).provider.sendCode("a@example.test"))).code).toBe("RATE_LIMITED");
    expect((await failure(provider(() => json(400, { code: 400, error_code: "validation_failed", msg: "Unable to validate email address: invalid format" })).provider.sendCode("a@example.test"))).code).toBe("EMAIL_INVALID");
    expect((await failure(provider(() => json(422, { code: 422, error_code: "signup_disabled", msg: "Signups not allowed for this instance" })).provider.sendCode("a@example.test"))).code).toBe("MAIL_UNAVAILABLE");
    expect((await failure(provider(() => json(500, { msg: "boom" })).provider.sendCode("a@example.test"))).code).toBe("MAIL_UNAVAILABLE");
    expect((await failure(provider(() => { throw new TypeError("fetch failed"); }).provider.sendCode("a@example.test"))).code).toBe("MAIL_UNAVAILABLE");
  });
});

describe("verifying a code", () => {
  it("posts type=email to /auth/v1/verify, returns the address GoTrue confirmed, and closes the provider's session", async () => {
    const { provider: p, calls } = provider(url => (url.endsWith("/verify") ? json(200, OK_SESSION) : new Response(null, { status: 204 })));
    await expect(p.verifyCode("engineer@example.test", "123456")).resolves.toEqual({ email: "engineer@example.test" });
    expect(calls[0].url).toBe("https://ref0123.supabase.co/auth/v1/verify");
    expect(calls[0].body).toEqual({ type: "email", email: "engineer@example.test", token: "123456" });
    expect(calls[1].url).toBe("https://ref0123.supabase.co/auth/v1/logout");
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer a.b.c");
  });

  it("gives CODE_INVALID for a wrong, expired, reused or unknown code (GoTrue answers all four with the same 403)", async () => {
    const same = () => json(403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
    for (const status of [same, () => json(400, {}), () => json(422, {}), () => json(401, {})]) {
      expect((await failure(provider(status).provider.verifyCode("a@example.test", "123456"))).code).toBe("CODE_INVALID");
    }
  });

  it("does not accept a success that names another address, an unconfirmed user, or a body without a session", async () => {
    for (const body of [
      { ...OK_SESSION, user: { ...OK_SESSION.user, email: "someone-else@example.test" } },
      { ...OK_SESSION, user: { ...OK_SESSION.user, email_confirmed_at: null } },
      { token_type: "bearer", user: OK_SESSION.user },
      {},
    ]) expect((await failure(provider(() => json(200, body)).provider.verifyCode("engineer@example.test", "123456"))).code).toBe("CODE_INVALID");
  });

  it("an unreachable or failing provider is MAIL_UNAVAILABLE, a throttled one RATE_LIMITED", async () => {
    expect((await failure(provider(() => { throw new TypeError("fetch failed"); }).provider.verifyCode("a@example.test", "123456"))).code).toBe("MAIL_UNAVAILABLE");
    expect((await failure(provider(() => json(503, {})).provider.verifyCode("a@example.test", "123456"))).code).toBe("MAIL_UNAVAILABLE");
    expect((await failure(provider(() => json(429, { error_code: "over_request_rate_limit" })).provider.verifyCode("a@example.test", "123456"))).code).toBe("RATE_LIMITED");
  });

  it("a failure to close the provider's session does not fail the sign-in", async () => {
    const { provider: p } = provider(url => { if (url.endsWith("/logout")) throw new TypeError("fetch failed"); return json(200, OK_SESSION); });
    await expect(p.verifyCode("engineer@example.test", "123456")).resolves.toEqual({ email: "engineer@example.test" });
  });
});

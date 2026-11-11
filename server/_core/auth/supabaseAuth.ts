// Sign-in code delivery and verification by Supabase Auth (GoTrue), over its public REST API with the project's anon key.
// The app keeps its own session: GoTrue is asked only "did this person prove they own this address?", then the session
// this server issues (same cookie, same shape, same roles and permissions) takes over and the GoTrue session is closed.
//
// The anon key is the only Supabase credential this file touches. Nothing here can read or write a table.
import { EmailCodeError } from "./emailCode";

/** `authUrl` is the base of the Auth API, `<project url>/auth/v1` on Supabase. Only a local GoTrue (no gateway in front of it) needs it set to something else. */
export type SupabaseAuthConfig = { url: string; anonKey: string; authUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number };

export interface CodeProvider {
  /** Asks the provider to e-mail a code. Throws EmailCodeError. */
  sendCode(email: string): Promise<void>;
  /** Resolves with the address the provider confirmed. Throws EmailCodeError (CODE_INVALID for every wrong, expired or reused code). */
  verifyCode(email: string, code: string): Promise<{ email: string }>;
  /** D-82: the password GoTrue holds for this address. Throws EmailCodeError: CREDENTIALS_INVALID for every wrong password, unknown or unconfirmed address. */
  signInWithPassword(email: string, password: string): Promise<{ email: string }>;
  /** D-82: "set a password" and "forgot my password" are one path: a mailed code proves the address, then the new password is stored at GoTrue. No reset link. */
  setPasswordWithCode(email: string, code: string, password: string): Promise<{ email: string }>;
}

type GoTrueBody = { error_code?: string; msg?: string; access_token?: string; user?: { email?: string; email_confirmed_at?: string | null } };

/** GoTrue words its send limit as "...you can only request this after 49 seconds." Anything else gives no number. */
export function retryAfterSecondsFrom(message: unknown): number | undefined {
  const match = typeof message === "string" ? message.match(/after\s+(\d{1,5})\s+seconds?/i) : null;
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

export function supabaseAuthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseAuthConfig | null {
  const url = (env.SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anonKey = env.SUPABASE_ANON_KEY ?? "";
  const authUrl = (env.SUPABASE_AUTH_URL ?? "").replace(/\/+$/, "");
  return url && anonKey ? { url, anonKey, ...(authUrl ? { authUrl } : {}) } : null;
}

export function createSupabaseCodeProvider(config: SupabaseAuthConfig): CodeProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const headers = { apikey: config.anonKey, "Content-Type": "application/json" };

  async function call(path: string, body: unknown, extraHeaders: Record<string, string> = {}, method = "POST"): Promise<{ status: number; body: GoTrueBody }> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.authUrl ?? `${config.url}/auth/v1`}${path}`, { method, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new EmailCodeError("MAIL_UNAVAILABLE");
    }
    const parsed = (await response.json().catch(() => ({}))) as GoTrueBody;
    return { status: response.status, body: parsed && typeof parsed === "object" ? parsed : {} };
  }

  const provider: CodeProvider = {
    async sendCode(email) {
      const { status, body } = await call("/otp", { email, create_user: true });
      if (status >= 200 && status < 300) return;
      if (status === 429 || body.error_code === "over_email_send_rate_limit" || body.error_code === "over_request_rate_limit") throw new EmailCodeError("RATE_LIMITED", retryAfterSecondsFrom(body.msg));
      if (status === 400 && (body.error_code === "validation_failed" || body.error_code === "email_address_invalid")) throw new EmailCodeError("EMAIL_INVALID");
      throw new EmailCodeError("MAIL_UNAVAILABLE");
    },

    async verifyCode(email, code) {
      const { accessToken } = await verified(email, code);
      await logout(accessToken);
      return { email };
    },

    async signInWithPassword(email, password) {
      const { status, body } = await call("/token?grant_type=password", { email, password });
      if (status >= 500) throw new EmailCodeError("MAIL_UNAVAILABLE");
      if (status === 429) throw new EmailCodeError("RATE_LIMITED");
      // a wrong password, an address GoTrue does not know and an unconfirmed one all answer the same (no account enumeration)
      if (status !== 200 || !body.access_token || !body.user?.email_confirmed_at || body.user.email?.trim().toLowerCase() !== email) throw new EmailCodeError("CREDENTIALS_INVALID");
      await logout(body.access_token);
      return { email };
    },

    async setPasswordWithCode(email, code, password) {
      const { accessToken } = await verified(email, code);
      try {
        const { status, body } = await call("/user", { password }, { Authorization: `Bearer ${accessToken}` }, "PUT");
        // same_password: the address already has exactly this password, which is what was asked for
        if (status === 422 && body.error_code === "weak_password") throw new EmailCodeError("PASSWORD_WEAK");
        if ((status < 200 || status >= 300) && body.error_code !== "same_password") throw new EmailCodeError("MAIL_UNAVAILABLE");
      } finally { await logout(accessToken); }
      return { email };
    },
  };
  return provider;

  /** The code check both paths share: the address GoTrue confirmed, and the short-lived token that proves it. */
  async function verified(email: string, code: string): Promise<{ accessToken: string }> {
    const { status, body } = await call("/verify", { type: "email", email, token: code });
    if (status >= 500) throw new EmailCodeError("MAIL_UNAVAILABLE");
    if (status === 429) throw new EmailCodeError("RATE_LIMITED");
    const confirmed = body.user?.email?.trim().toLowerCase();
    if (status !== 200 || !body.access_token || !body.user?.email_confirmed_at || confirmed !== email) throw new EmailCodeError("CODE_INVALID");
    return { accessToken: body.access_token };
  }
  // The app issues its own session; do not leave a second one open at the provider. A failure here changes nothing for the caller.
  async function logout(accessToken: string) { await call("/logout", {}, { Authorization: `Bearer ${accessToken}` }).catch(() => undefined); }
}

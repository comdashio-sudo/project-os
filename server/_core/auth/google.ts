// Google sign-in (OpenID Connect, authorization-code flow with PKCE and a nonce).
// Optional: it is offered only when GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
// APP_BASE_URL are all set. The identity used by the app is the verified
// address, so a Google account whose address is not verified is refused.
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, type JWTVerifyGetKey } from "jose";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

export const base64url = (buffer: Buffer) => buffer.toString("base64url");
export const newRandom = (bytes = 32) => base64url(randomBytes(bytes));
export const challengeFor = (verifier: string) => base64url(createHash("sha256").update(verifier).digest());

export function buildAuthorizationUrl(config: GoogleConfig, params: { state: string; nonce: string; verifier: string }): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("code_challenge", challengeFor(params.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export class GoogleSignInError extends Error {
  constructor(readonly reason: "TOKEN_EXCHANGE_FAILED" | "ID_TOKEN_INVALID" | "EMAIL_NOT_VERIFIED") {
    super(reason);
    this.name = "GoogleSignInError";
  }
}

export type GoogleIdentity = { email: string; name: string | null };

export async function completeGoogleSignIn(
  config: GoogleConfig,
  input: { code: string; verifier: string; nonce: string },
  dependencies: { fetchImpl?: typeof fetch; keys: JWTVerifyGetKey },
): Promise<GoogleIdentity> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: input.verifier,
    }),
  });
  if (!response.ok) throw new GoogleSignInError("TOKEN_EXCHANGE_FAILED");
  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!body || typeof body.id_token !== "string") throw new GoogleSignInError("TOKEN_EXCHANGE_FAILED");

  let claims: Record<string, unknown>;
  try {
    const verified = await jwtVerify(body.id_token, dependencies.keys, { issuer: GOOGLE_ISSUERS, audience: config.clientId });
    claims = verified.payload as Record<string, unknown>;
  } catch {
    throw new GoogleSignInError("ID_TOKEN_INVALID");
  }
  if (claims.nonce !== input.nonce) throw new GoogleSignInError("ID_TOKEN_INVALID");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new GoogleSignInError("EMAIL_NOT_VERIFIED");
  if (typeof claims.email !== "string" || !claims.email) throw new GoogleSignInError("ID_TOKEN_INVALID");
  return { email: claims.email, name: typeof claims.name === "string" && claims.name ? claims.name : null };
}

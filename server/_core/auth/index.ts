import type { Express } from "express";
import { isEligibleToSignIn, upsertUser } from "../../db";
import { ENV } from "../env";
import { sdk } from "../sdk";
import { createDbAttemptLimiter } from "./attemptRepository";
import { createEmailCodeService } from "./emailCode";
import { googleConfigFromEnvironment, googleKeys, registerAuthRoutes } from "./routes";
import { createSupabaseCodeProvider, supabaseAuthConfigFromEnv } from "./supabaseAuth";
import { logWarn } from "../logger";

export function registerDefaultAuthRoutes(app: Express) {
  const supabase = supabaseAuthConfigFromEnv();
  if (!supabase) logWarn("auth.supabase_not_configured", { note: "SUPABASE_URL or SUPABASE_ANON_KEY is not set: e-mail sign-in codes cannot be sent" });
  const googleConfig = googleConfigFromEnvironment();
  registerAuthRoutes(app, {
    emailCodes: createEmailCodeService({ provider: supabase ? createSupabaseCodeProvider(supabase) : null, attempts: createDbAttemptLimiter(), ttlSeconds: ENV.authCodeTtlSeconds }),
    google: googleConfig ? { config: googleConfig, keys: googleKeys() } : null,
    secret: ENV.cookieSecret,
    isEligible: email => isEligibleToSignIn(email),
    upsertUser: user => upsertUser(user),
    createSessionToken: (openId, options) => sdk.issueSession(openId, { name: options.name, expiresInMs: options.expiresInMs }),
  });
}

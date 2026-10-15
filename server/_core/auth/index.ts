import type { Express } from "express";
import { upsertUser } from "../../db";
import { ENV } from "../env";
import { sdk } from "../sdk";
import { createEmailCodeService } from "./emailCode";
import { createDbLoginCodeRepository } from "./loginCodeRepository";
import { createResendMailer } from "./resendMailer";
import { googleConfigFromEnvironment, googleKeys, registerAuthRoutes } from "./routes";

export function registerDefaultAuthRoutes(app: Express) {
  const mailer = ENV.resendApiKey && ENV.emailFrom ? createResendMailer({ apiKey: ENV.resendApiKey, from: ENV.emailFrom }) : null;
  if (!mailer) console.warn("[Auth] RESEND_API_KEY or EMAIL_FROM is not set: e-mail sign-in codes cannot be sent.");
  const googleConfig = googleConfigFromEnvironment();
  registerAuthRoutes(app, {
    emailCodes: createEmailCodeService({ repository: createDbLoginCodeRepository(), mailer, secret: ENV.cookieSecret }),
    google: googleConfig ? { config: googleConfig, keys: googleKeys() } : null,
    secret: ENV.cookieSecret,
    upsertUser: user => upsertUser(user),
    createSessionToken: (openId, options) => sdk.createSessionToken(openId, options),
  });
}

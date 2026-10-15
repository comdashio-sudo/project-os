export const ENV = {
  appId: process.env.APP_ID || "project-os",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerEmail: (process.env.OWNER_EMAIL ?? "").trim().toLowerCase(),
  appBaseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2Bucket: process.env.R2_BUCKET ?? "",
  // The language model is off unless the owner turns it on AND configures a
  // provider. LLM_BASE_URL is an OpenAI-compatible base such as https://host/v1.
  llmEnabled: process.env.LLM_ENABLED === "true",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmBaseUrl: (process.env.LLM_BASE_URL ?? "").replace(/\/+$/, ""),
};

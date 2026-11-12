export const ENV = {
  appId: process.env.APP_ID || "project-os",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerEmail: (process.env.OWNER_EMAIL ?? "").trim().toLowerCase(),
  // Registration is by invitation only (owner's decision 2026-10-25, docs/TASLEEM_AUDIT.md 1.11): an uninvited address gets no sign-in code, and only the platform owner creates companies.
  // REGISTRATION=open is the owner's switch to open it; anything else, or nothing, keeps it closed.
  registrationOpen: (process.env.REGISTRATION ?? "").trim().toLowerCase() === "open",
  // D-81 (2026-11-09): two-step verification is required of nobody by default; a company may require it of its members (companies.require_two_step). MFA_ENFORCEMENT=off is the
  // break-glass switch (a lost phone AND lost recovery codes): it lifts every company's requirement, nothing else.
  mfaEnforced: (process.env.MFA_ENFORCEMENT ?? "").trim().toLowerCase() !== "off",
  appBaseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
  // Supabase Auth sends and checks the sign-in code; the anon key is the only Supabase key this server uses for it.
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/+$/, ""),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
  authCodeTtlSeconds: Number(process.env.AUTH_CODE_TTL_SECONDS) > 0 ? Number(process.env.AUTH_CODE_TTL_SECONDS) : 3600,
  emailFrom: process.env.EMAIL_FROM ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Supabase Storage through its S3 connection (Project Settings > Storage). The access key pair is server-only.
  storageS3Endpoint: process.env.STORAGE_S3_ENDPOINT ?? "",
  storageS3Region: process.env.STORAGE_S3_REGION ?? "",
  storageS3AccessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? "",
  storageS3SecretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? "",
  storageBucket: process.env.STORAGE_BUCKET ?? "",
  // The language model is off unless the owner turns it on AND configures a
  // provider. LLM_BASE_URL is an OpenAI-compatible base such as https://host/v1.
  llmEnabled: process.env.LLM_ENABLED === "true",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmBaseUrl: (process.env.LLM_BASE_URL ?? "").replace(/\/+$/, ""),
  // The AI reading of PDFs, scans and free text (smart import) stops for a company once its estimated cost this month reaches this many US dollars.
  smartReadingMonthlyCapUsd: Number(process.env.SMART_READING_MONTHLY_CAP_USD ?? "5"),
};

import { sql } from "drizzle-orm";
import { getDb } from "./database";

// The code and the database are one system, but they do not always arrive together: the application deploys from the repository, while the schema is applied by the owner's
// Bootstrap / "Supabase setup" run. When a release needs a column the database does not have yet, an INSERT or SELECT naming it fails (42703 / 42P01) and, if nothing expects that,
// every sign-in is a server error (2026-10-26). So: what this release needs is listed here, the answer is cached for half a minute, the code that depends on it asks first,
// and /api/readyz says what is missing so a post-deploy check can raise it as a warning.
export const REQUIRED_SCHEMA = [
  { migration: "0010_wo20_session_idle", kind: "column", table: "auth_sessions", column: "last_seen_at" },
  { migration: "0011_wo20_two_step_verification", kind: "column", table: "auth_sessions", column: "mfa_verified_at" },
  { migration: "0011_wo20_two_step_verification", kind: "table", table: "user_mfa" },
] as const;

/** PostgreSQL codes that mean "the schema is behind the code": undefined column, undefined table. Drizzle wraps the driver's error, so the code may sit on `cause`. */
export function isSchemaBehind(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth++, current = (current as { cause?: unknown }).cause) {
    const code = (current as { code?: string }).code;
    if (code === "42703" || code === "42P01") return true;
  }
  return false;
}

export type SchemaReadiness = { ready: boolean; missing: string[] };
/** What /api/readyz says in public: only which migrations are pending, nothing about the data. */
export const pendingMigrations = (readiness: SchemaReadiness) => Array.from(new Set(readiness.missing.map(item => item.match(/\((\d{4}_[a-z0-9_]+)\)/)?.[1] ?? item)));
let cached: { at: number; value: SchemaReadiness } | null = null;
export const clearSchemaReadinessCache = () => { cached = null; };

export async function schemaReadiness(now = Date.now()): Promise<SchemaReadiness> {
  if (cached && now - cached.at < 30_000) return cached.value;
  const db = await getDb();
  if (!db) return { ready: false, missing: ["database"] };
  const missing: string[] = [];
  try {
    for (const item of REQUIRED_SCHEMA) {
      const present = item.kind === "table"
        ? (await db.execute(sql`SELECT to_regclass(${`public.${item.table}`}) IS NOT NULL AS present`)).rows[0]?.present
        : (await db.execute(sql`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${item.table} AND column_name = ${item.column}) AS present`)).rows[0]?.present;
      if (!present) missing.push(item.kind === "table" ? `${item.table} (${item.migration})` : `${item.table}.${item.column} (${item.migration})`);
    }
  } catch { return { ready: false, missing: ["schema could not be read"] }; }
  const value = { ready: missing.length === 0, missing };
  cached = { at: now, value };
  return value;
}

import { sql } from "drizzle-orm";
import { getDb } from "./database";
import { logWarn } from "./logger";

// The code and the database are one system, but they do not always arrive together: the application deploys from the repository, while the schema is applied by the owner's
// Bootstrap / "Supabase setup" run. When a release needs a column the database does not have yet, an INSERT or SELECT naming it fails (42703 / 42P01) and, if nothing expects that,
// every sign-in is a server error (2026-10-26). So: what this release needs is listed here, the answer is cached for half a minute, the code that depends on it asks first,
// and /api/readyz says what is missing so a post-deploy check can raise it as a warning.
export const REQUIRED_SCHEMA = [
  { migration: "0010_wo20_session_idle", kind: "column", table: "auth_sessions", column: "last_seen_at" },
  { migration: "0011_wo20_two_step_verification", kind: "column", table: "auth_sessions", column: "mfa_verified_at" },
  { migration: "0011_wo20_two_step_verification", kind: "table", table: "user_mfa" },
  { migration: "0013_wo20_smart_import", kind: "table", table: "import_source_profiles" },
  { migration: "0013_wo20_smart_import", kind: "table", table: "data_import_sources" },
  { migration: "0013_wo20_smart_import", kind: "table", table: "smart_reading_usage" },
  { migration: "0014_wo20_unit_external_code", kind: "column", table: "pmc_units", column: "external_code" },
  { migration: "0015_wo16_user_language", kind: "table", table: "user_language_preferences" },
  // 0016 narrows the "same file twice" rule to confirmed imports (the index's WHERE clause names the three confirmed statuses)
  { migration: "0016_wo20_import_duplicate_confirmed_only", kind: "unique-index-confirmed-only", table: "data_imports", column: "data_imports_tenant_file_hash_unique" },
  { migration: "0017_wo20_p6_schedule", kind: "table", table: "schedule_calendars" },
  { migration: "0017_wo20_p6_schedule", kind: "table", table: "activity_relationships" },
  { migration: "0017_wo20_p6_schedule", kind: "table", table: "activity_code_types" },
  { migration: "0017_wo20_p6_schedule", kind: "table", table: "activity_code_values" },
  { migration: "0017_wo20_p6_schedule", kind: "table", table: "activity_code_assignments" },
  { migration: "0017_wo20_p6_schedule", kind: "table", table: "activity_resource_assignments" },
  { migration: "0017_wo20_p6_schedule", kind: "column", table: "activities", column: "external_id" },
  { migration: "0018_wo20_import_format_xls", kind: "enum-value", table: "data_imports_source_format", column: "xls" },
  { migration: "0019_wo22_site_consultant", kind: "table", table: "pmc_site_activities" },
  { migration: "0019_wo22_site_consultant", kind: "table", table: "pmc_site_cells" },
  { migration: "0019_wo22_site_consultant", kind: "table", table: "pmc_consultant_columns" },
  { migration: "0019_wo22_site_consultant", kind: "table", table: "pmc_consultant_cells" },
  { migration: "0019_wo22_site_consultant", kind: "table", table: "pmc_cell_notes" },
  { migration: "0019_wo22_site_consultant", kind: "table", table: "pmc_plan_months" },
  { migration: "0019_wo22_site_consultant", kind: "column", table: "pmc_units", column: "villa_label" },
  { migration: "0019_wo22_site_consultant", kind: "column", table: "pmc_activity_definitions", column: "wir_code" },
  { migration: "0019_wo22_site_consultant", kind: "column", table: "site_daily_reports", column: "contractor_id" },
  { migration: "0020_wo23_project_profile", kind: "table", table: "project_profiles" },
  { migration: "0020_wo23_project_profile", kind: "table", table: "project_companies" },
  { migration: "0021_wo23_report_approvers", kind: "table", table: "project_report_approvers" },
  { migration: "0022_reports_reference_lists", kind: "table", table: "project_labour_roles" },
  { migration: "0022_reports_reference_lists", kind: "table", table: "project_equipment" },
  { migration: "0022_reports_reference_lists", kind: "column", table: "pmc_site_activities", column: "measure_unit" },
  { migration: "0023_d81_company_require_two_step", kind: "column", table: "companies", column: "require_two_step" },
  { migration: "0023_d81_company_require_two_step", kind: "column", table: "user_mfa", column: "required_by_self" },
  { migration: "0024_d79_database_file_storage", kind: "table", table: "stored_files" },
  { migration: "0025_daily_report_core", kind: "table", table: "site_daily_report_labour" },
  { migration: "0025_daily_report_core", kind: "table", table: "site_daily_report_equipment" },
  { migration: "0025_daily_report_core", kind: "table", table: "project_report_counters" },
  { migration: "0025_daily_report_core", kind: "column", table: "site_daily_reports", column: "report_number" },
  { migration: "0026_daily_report_sections", kind: "table", table: "site_daily_report_materials" },
  { migration: "0026_daily_report_sections", kind: "table", table: "site_daily_report_hse" },
  { migration: "0026_daily_report_sections", kind: "table", table: "site_daily_report_obstacles" },
  { migration: "0026_daily_report_sections", kind: "table", table: "site_daily_report_tomorrow" },
  { migration: "0027_daily_report_approval", kind: "column", table: "site_daily_reports", column: "checked_at" },
  { migration: "0027_daily_report_approval", kind: "column", table: "site_daily_report_photos", column: "pmc_unit_id" },
  { migration: "0028_master_plan_drawing_calibration", kind: "column", table: "master_plan_drawings", column: "calibration" },
  // 0012 takes UPDATE on the immutable columns away from the application role: applied when the role (the one running this query) can no longer update tenant_id
  { migration: "0012_wo20_column_level_update", kind: "immutable-column-locked", table: "projects", column: "tenant_id" },
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
        : item.kind === "enum-value"
        ? (await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = ${item.table} AND e.enumlabel = ${item.column}) AS present`)).rows[0]?.present
        : item.kind === "unique-index-confirmed-only"
        ? (await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${item.table} AND indexname = ${item.column} AND indexdef LIKE '%confirmed%importing%completed%') AS present`)).rows[0]?.present
        : item.kind === "immutable-column-locked"
        ? (await db.execute(sql`SELECT (current_user <> 'project_os_app') OR NOT has_column_privilege(current_user, ${`public.${item.table}`}, ${item.column}, 'UPDATE') AS present`)).rows[0]?.present
        : (await db.execute(sql`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${item.table} AND column_name = ${item.column}) AS present`)).rows[0]?.present;
      if (!present) missing.push(item.kind === "table" ? `${item.table} (${item.migration})` : `${item.table}.${item.column} (${item.migration})`);
    }
  } catch { return { ready: false, missing: ["schema could not be read"] }; }
  const value = { ready: missing.length === 0, missing };
  cached = { at: now, value };
  if (!value.ready) logWarn("schema.behind", { pending: pendingMigrations(value).join(", ") });
  return value;
}

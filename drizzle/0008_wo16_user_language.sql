-- Work order 16, item 4 (G-203): the interface language a person chose is kept on their account, so it follows them to any device. One row per user
-- (user_id is the key; a second choice replaces the first). A per-person preference, not tenant data: it is listed as a global table in
-- project_os_apply_conventions() (like users and auth_sessions), and the server reads and writes it only for the signed-in user (server/userLanguage.ts).
-- The check admits the three interface languages only (shared/interfaceLanguages.ts).
-- The table is NOT in drizzle/schema.ts or in the baseline, on purpose: the migrations after the baseline (0006) re-create the convention function with an
-- older global list and run the sweep, so a table created in the baseline would be refused there. This migration is the one that creates it, and it
-- re-creates the function with the table listed BEFORE the sweep of this migration runs (the runner calls the sweep after each file). The table's
-- definition is in server/userLanguage.ts; keep the two in step.
-- Re-runnable. Rollback: drop the table user_language_preferences (nothing else refers to it), and re-create the previous body of
-- project_os_apply_conventions() from drizzle/0006_wo15_convention_sweep_skips_matching.sql (the only change is the one name added to global_tables).
CREATE TABLE IF NOT EXISTS "user_language_preferences" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"language" varchar(2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_language_preferences_user_fk') THEN ALTER TABLE "user_language_preferences" ADD CONSTRAINT "user_language_preferences_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_language_preferences_language_check') THEN ALTER TABLE "user_language_preferences" ADD CONSTRAINT "user_language_preferences_language_check" CHECK ("user_language_preferences"."language" IN ('ar', 'en', 'ur')); END IF; END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_apply_conventions() RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE
  t record;
  global_tables constant text[] := ARRAY['users', 'auth_sessions', 'permissions', 'commercial_features', 'commercial_plans', 'plan_feature_entitlements', 'scheduled_jobs', 'self_service_signup_attempts', 'invoice_counters', 'auth_code_attempts', 'user_language_preferences'];
  child_tables constant jsonb := '{
    "data_import_errors":            ["import_id",         "data_imports"],
    "data_import_row_results":       ["import_id",         "data_imports"],
    "subcontract_certificate_lines": ["certificate_id",    "subcontract_certificates"],
    "tenant_license_feature_overrides": ["tenant_license_id", "tenant_licenses"],
    "membership_roles":              ["membership_id",     "memberships"],
    "role_permissions":              ["role_id",           "roles"]
  }'::jsonb;
  pred text;
  swept integer := 0;
  reapplied integer := 0;
  child jsonb;
  policy_names text[];  -- the policies this table must carry, in the order they are created
  policy_sql text[];    -- the statements that create them
  sig text;             -- a fingerprint of everything the sweep would do to this table; it is stamped on each policy, so a changed rule shows up as a changed fingerprint
  want_privs text[];
  have_privs text[];
  conforming boolean;
  i integer;
BEGIN
  -- Work order 15: a table that already matches the convention is LEFT ALONE. Every statement below (trigger, grants, row-level security, policies) takes an
  -- exclusive lock, so re-running it on all tables every time collided with autovacuum (CI saw the deadlock) and would queue behind any long query in production.
  -- "Matches" means: row-level security is on, the application role holds exactly the privileges it should, the updated_at trigger is there when the table has
  -- the column, the table carries exactly the policies it should, and each of them carries the fingerprint of the rule as written now. Nothing the check reads
  -- takes a lock on the table (it reads the catalogs), so a table someone holds locked is skipped, not waited for. Drift of any kind (a policy dropped, a grant
  -- widened, row-level security switched off) makes the table non-matching, and it is re-applied in full. When a migration changes a rule below, the fingerprint
  -- changes with it and every table is re-applied once.
  FOR t IN SELECT c.oid AS oid, c.relname AS name, c.relrowsecurity AS rls_on, c.relacl AS acl,
                  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped) AS has_tenant,
                  EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'updated_at' AND NOT a.attisdropped) AS has_updated
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname
  LOOP
    swept := swept + 1;

    -- 1. what this table must look like (an unclassified table is refused here, before anything is touched)
    IF t.name = 'audit_logs' THEN
      want_privs := ARRAY['INSERT', 'SELECT'];
    ELSE
      want_privs := ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE'];
    END IF;
    IF t.name = 'audit_logs' THEN
      pred := format('((SELECT app_system()) OR %I = ANY ((SELECT app_tenant_ids())::text[]))', 'tenant_id');
      policy_names := ARRAY['project_os_read', 'project_os_insert'];
      policy_sql := ARRAY[
        format('CREATE POLICY project_os_read ON %I FOR SELECT TO project_os_app USING %s', t.name, pred),
        format('CREATE POLICY project_os_insert ON %I FOR INSERT TO project_os_app WITH CHECK %s', t.name, pred)];
    ELSIF t.name = 'companies' THEN
      -- A company is its own tenant: its row is readable, changeable and deletable when its id is among the caller's companies, and a change may not move
      -- the row to another id. CREATING one is a system act (sign-up). Who may change the company is the application's permission check; this layer
      -- only keeps one company's context away from another company's row. (A single FOR ALL policy with a system-only check also refused the owner's own
      -- erasure of their company: the browser rehearsal found it, the database tests ran in a system context and did not.)
      pred := format('((SELECT app_system()) OR %I = ANY ((SELECT app_tenant_ids())::text[]))', 'id');
      policy_names := ARRAY['project_os_read', 'project_os_update', 'project_os_delete', 'project_os_insert'];
      policy_sql := ARRAY[
        format('CREATE POLICY project_os_read ON %I FOR SELECT TO project_os_app USING %s', t.name, pred),
        format('CREATE POLICY project_os_update ON %I FOR UPDATE TO project_os_app USING %s WITH CHECK %s', t.name, pred, pred),
        format('CREATE POLICY project_os_delete ON %I FOR DELETE TO project_os_app USING %s', t.name, pred),
        format('CREATE POLICY project_os_insert ON %I FOR INSERT TO project_os_app WITH CHECK ((SELECT app_system()))', t.name)];
    ELSIF t.name = ANY (global_tables) THEN
      policy_names := ARRAY['project_os_isolation'];
      policy_sql := ARRAY[format('CREATE POLICY project_os_isolation ON %I FOR ALL TO project_os_app USING (true) WITH CHECK (true)', t.name)];
    ELSIF child_tables ? t.name THEN
      child := child_tables -> t.name;
      pred := format('((SELECT app_system()) OR %I IN (SELECT id FROM %I WHERE tenant_id = ANY ((SELECT app_tenant_ids())::text[])))', child ->> 0, child ->> 1);
      policy_names := ARRAY['project_os_isolation'];
      policy_sql := ARRAY[format('CREATE POLICY project_os_isolation ON %I FOR ALL TO project_os_app USING %s WITH CHECK %s', t.name, pred, pred)];
    ELSIF t.has_tenant THEN
      pred := format('((SELECT app_system()) OR %I = ANY ((SELECT app_tenant_ids())::text[]))', 'tenant_id');
      policy_names := ARRAY['project_os_isolation'];
      policy_sql := ARRAY[format('CREATE POLICY project_os_isolation ON %I FOR ALL TO project_os_app USING %s WITH CHECK %s', t.name, pred, pred)];
    ELSE
      RAISE EXCEPTION 'table % has no tenant_id and is not classified in project_os_apply_conventions(): add it to global_tables or child_tables', t.name;
    END IF;
    sig := md5(array_to_string(policy_sql, E'\n') || '|' || array_to_string(want_privs, ','));

    -- 2. does it already look like that? (catalog reads only)
    SELECT array_agg(a.privilege_type::text ORDER BY a.privilege_type::text) INTO have_privs
      FROM aclexplode(t.acl) a JOIN pg_roles r ON r.oid = a.grantee WHERE r.rolname = 'project_os_app';
    conforming := t.rls_on
      AND have_privs IS NOT DISTINCT FROM want_privs
      AND (NOT t.has_updated OR EXISTS (SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid = t.oid AND tg.tgname = 'set_updated_at' AND NOT tg.tgisinternal
                                         AND tg.tgfoid = 'project_os_set_updated_at'::regproc AND tg.tgtype = 19))
      AND (SELECT coalesce(array_agg(p.polname::text ORDER BY p.polname::text), ARRAY[]::text[]) FROM pg_policy p
            WHERE p.polrelid = t.oid AND p.polname::text = ANY (ARRAY['project_os_isolation', 'project_os_read', 'project_os_insert', 'project_os_update', 'project_os_delete']))
          = (SELECT array_agg(n ORDER BY n) FROM unnest(policy_names) n)
      AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t.oid AND p.polname::text = ANY (policy_names)
                         AND coalesce(obj_description(p.oid, 'pg_policy'), '') <> sig);
    IF conforming THEN CONTINUE; END IF;
    reapplied := reapplied + 1;

    -- 3. otherwise (a new table, a changed rule, or drift) apply it in full, as before
    -- updated_at upkeep
    IF t.has_updated THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', t.name);
      EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION project_os_set_updated_at()', t.name);
    END IF;

    -- grants: everything except what the audit trail is denied
    IF t.name = 'audit_logs' THEN
      EXECUTE format('REVOKE ALL ON %I FROM project_os_app', t.name);
      EXECUTE format('GRANT SELECT, INSERT ON %I TO project_os_app', t.name);
    ELSE
      EXECUTE format('REVOKE ALL ON %I FROM project_os_app', t.name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO project_os_app', t.name);
    END IF;

    -- row-level security
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_isolation ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_read ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_insert ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_update ON %I', t.name);
    EXECUTE format('DROP POLICY IF EXISTS project_os_delete ON %I', t.name);
    FOR i IN 1 .. array_length(policy_sql, 1) LOOP
      EXECUTE policy_sql[i];
      EXECUTE format('COMMENT ON POLICY %I ON %I IS %L', policy_names[i], t.name, sig);
    END LOOP;
  END LOOP;

  -- sequences (the users identity) and the one SECURITY DEFINER helper
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO project_os_app';
  RAISE NOTICE 'project_os_apply_conventions: % tables, % applied, % already matched', swept, reapplied, swept - reapplied;
  RETURN swept;
END $fn$;

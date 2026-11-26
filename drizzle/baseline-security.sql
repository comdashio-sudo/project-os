-- PROJECT OS baseline, hand-written part (appended to the generated tables by scripts/build-baseline.mjs; do not apply on its own).
--
-- What it adds to the generated schema, in the order it runs:
--   1. the application role (project_os_app, no login until the database administrator gives it a password);
--   2. updated_at upkeep (MySQL had ON UPDATE CURRENT_TIMESTAMP; PostgreSQL needs a trigger);
--   3. the audit trail made append-only in the database itself: triggers that refuse UPDATE, DELETE and TRUNCATE
--      for everyone, and no UPDATE/DELETE/TRUNCATE privilege for the application role;
--   4. row-level security as the SECOND layer of tenant isolation (the first is still the server, which filters every
--      query by tenant). A query that forgets its tenant filter reads zero foreign rows instead of someone else's;
--   5. project_os_apply_conventions(): one function that (re)applies items 2 and 4 and the grants to EVERY table. The migration
--      runner calls it after every migration, so a table added later is protected without anyone remembering to. A table it
--      cannot classify makes the migration fail, which is the safe direction.
--
-- Limit, stated plainly: the per-request context (app.user_id / app.tenant_ids / app.system) is set by the server, through
-- the same connection the queries use. Row-level security therefore protects against a server function that forgets its tenant
-- filter; it does not protect against someone who can run arbitrary SQL as project_os_app. The role holds no DDL, no TRUNCATE
-- and no UPDATE/DELETE on the audit trail, and a deployment gives it nothing else.

-- 1. roles ---------------------------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN
    CREATE ROLE project_os_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
-- Supabase's Data API roles must see nothing here: the application talks to the database over its own connection only.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO project_os_app;
--> statement-breakpoint

-- 2. updated_at ----------------------------------------------------------------------------------------------------------
CREATE FUNCTION project_os_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint

-- 3. the audit trail is append-only --------------------------------------------------------------------------------------
CREATE FUNCTION project_os_audit_logs_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is refused', TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_refuse_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION project_os_audit_logs_refuse();
--> statement-breakpoint
CREATE TRIGGER audit_logs_refuse_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION project_os_audit_logs_refuse();
--> statement-breakpoint
CREATE TRIGGER audit_logs_refuse_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION project_os_audit_logs_refuse();
--> statement-breakpoint
-- 3b. a platform administrator's identity (the OWNER_EMAIL account) is never blanked or replaced by an erasure or a clean-up (work order 17, item 1) --
CREATE FUNCTION project_os_users_protect_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'admin' AND ((OLD.email IS NOT NULL AND NEW.email IS NULL) OR (NEW.open_id LIKE 'deleted:%' AND OLD.open_id NOT LIKE 'deleted:%')) THEN
    RAISE EXCEPTION 'the identity of a platform administrator is never erased' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER users_protect_admin BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION project_os_users_protect_admin();
--> statement-breakpoint
-- ALWAYS: a session that sets session_replication_role = replica (the usual way to switch triggers off) still hits them.
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_refuse_update;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_refuse_delete;
--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER audit_logs_refuse_truncate;
--> statement-breakpoint
-- 3c. Q-21 (a): the change history of a strategy assumption is append-only the same way (one function names the table it refuses) ------------------
CREATE FUNCTION project_os_append_only_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
CREATE TRIGGER strategy_assumption_changes_refuse_update BEFORE UPDATE ON strategy_assumption_changes FOR EACH ROW EXECUTE FUNCTION project_os_append_only_refuse();
--> statement-breakpoint
-- I57 (0054): DELETE is refused except by the company's own erasure, inside its transaction (project_os.erasing_tenant, SET LOCAL), for its rows, after its freeze
CREATE FUNCTION project_os_strategy_changes_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('project_os.erasing_tenant', true) IS NOT DISTINCT FROM OLD.tenant_id
     AND EXISTS (SELECT 1 FROM companies c WHERE c.id = OLD.tenant_id AND c.status <> 'active') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % is refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_strategy_changes_delete_guard() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER strategy_assumption_changes_delete_on_erasure BEFORE DELETE ON strategy_assumption_changes FOR EACH ROW EXECUTE FUNCTION project_os_strategy_changes_delete_guard();
--> statement-breakpoint
CREATE TRIGGER strategy_assumption_changes_refuse_truncate BEFORE TRUNCATE ON strategy_assumption_changes FOR EACH STATEMENT EXECUTE FUNCTION project_os_append_only_refuse();
--> statement-breakpoint
ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_refuse_update;
--> statement-breakpoint
ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_delete_on_erasure;
--> statement-breakpoint
ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_refuse_truncate;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_append_only_refuse() FROM PUBLIC;
--> statement-breakpoint

-- 4. the per-request context RLS reads ------------------------------------------------------------------------------------
-- Set by the server for the length of one statement or transaction (server/_core/database.ts). With nothing set, no tenant row is visible.
CREATE FUNCTION app_system() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.system', true), 'off') = 'on' $$;
--> statement-breakpoint
CREATE FUNCTION app_user_id() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::integer $$;
--> statement-breakpoint
CREATE FUNCTION app_tenant_ids() RETURNS text[] LANGUAGE sql STABLE AS $$ SELECT coalesce(string_to_array(nullif(current_setting('app.tenant_ids', true), ''), ','), ARRAY[]::text[]) $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app_system(), app_user_id(), app_tenant_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_system(), app_user_id(), app_tenant_ids() TO project_os_app;
--> statement-breakpoint

-- 5. the convention sweep -------------------------------------------------------------------------------------------------
-- Tables with no tenant_id of their own, and where they get their tenant from.
--   global:  shared reference or identity data, not tenant data (users belong to many companies; plans and permissions are catalogues).
--            Row-level security is still ON for them so the Data API roles get nothing; the application role sees all rows.
--   child:   rows that reach their company through a parent table.
CREATE FUNCTION project_os_apply_conventions() RETURNS integer LANGUAGE plpgsql AS $fn$
DECLARE
  t record;
  global_tables constant text[] := ARRAY['users', 'auth_sessions', 'permissions', 'commercial_features', 'commercial_plans', 'plan_feature_entitlements', 'scheduled_jobs', 'self_service_signup_attempts', 'invoice_counters', 'auth_code_attempts', 'user_mfa'];
  child_tables constant jsonb := '{
    "data_import_errors":            ["import_id",         "data_imports"],
    "data_import_row_results":       ["import_id",         "data_imports"],
    "subcontract_certificate_lines": ["certificate_id",    "subcontract_certificates"],
    "tenant_license_feature_overrides": ["tenant_license_id", "tenant_licenses"],
    "membership_roles":              ["membership_id",     "memberships"],
    "role_permissions":              ["role_id",           "roles"]
  }'::jsonb;
  -- Work order 20, item 3 (audit 4.3): the application role may UPDATE a column only when the column is not immutable. A statement that moves a row to another company (tenant_id),
  -- rewrites its identity (id) or its history (created_at), or re-points a person's identity (users.open_id and the like) is refused by the database with 42501 before row-level security is
  -- even consulted, whatever the application code or an injected statement says. A column added later is writable by default: this function runs after every migration and grants it.
  immutable_cols constant text[] := ARRAY['id', 'tenant_id', 'created_at'];
  immutable_extra constant jsonb := '{
    "users":         ["open_id"],
    "auth_sessions": ["user_id"],
    "memberships":   ["user_id"],
    "user_mfa":      ["user_id"]
  }'::jsonb;
  imm text[];            -- the immutable columns of the table in hand
  writable text;         -- its writable columns, as a quoted list for GRANT UPDATE (...)
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
    imm := immutable_cols || ARRAY(SELECT jsonb_array_elements_text(coalesce(immutable_extra -> t.name, '[]'::jsonb)));
    IF t.name = 'audit_logs' THEN
      want_privs := ARRAY['INSERT', 'SELECT'];
    ELSE
      -- UPDATE is not a table-level privilege any more: it is granted per column below (a column-level REVOKE would subtract nothing from a table-level grant)
      want_privs := ARRAY['DELETE', 'INSERT', 'SELECT'];
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
    sig := md5(array_to_string(policy_sql, E'\n') || '|' || array_to_string(want_privs, ',') || '|' || array_to_string(imm, ','));

    -- 2. does it already look like that? (catalog reads only)
    SELECT array_agg(a.privilege_type::text ORDER BY a.privilege_type::text) INTO have_privs
      FROM aclexplode(t.acl) a JOIN pg_roles r ON r.oid = a.grantee WHERE r.rolname = 'project_os_app';
    conforming := t.rls_on
      AND have_privs IS NOT DISTINCT FROM want_privs
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
                         AND has_column_privilege('project_os_app', t.oid, a.attnum, 'UPDATE') IS DISTINCT FROM (t.name <> 'audit_logs' AND NOT (a.attname::text = ANY (imm))))
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
      EXECUTE format('GRANT SELECT, INSERT, DELETE ON %I TO project_os_app', t.name);
      SELECT string_agg(quote_ident(a.attname::text), ', ' ORDER BY a.attnum) INTO writable
        FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped AND NOT (a.attname::text = ANY (imm));
      IF writable IS NOT NULL THEN EXECUTE format('GRANT UPDATE (%s) ON %I TO project_os_app', writable, t.name); END IF;
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
--> statement-breakpoint
-- Statistics refresh after a bulk import. ANALYZE needs ownership; the application role is not the owner, so it goes through this
-- function (SECURITY DEFINER): it analyses only existing public tables from the list it is given, and never audit_logs.
CREATE FUNCTION project_os_analyze(tables text[]) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE name text; done integer := 0;
BEGIN
  FOREACH name IN ARRAY tables LOOP
    IF name <> 'audit_logs' AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = name) THEN
      EXECUTE format('ANALYZE public.%I', name);
      done := done + 1;
    END IF;
  END LOOP;
  RETURN done;
END $$;
--> statement-breakpoint
-- Quality gate on progress (work order 12, item 7). A cell (unit x activity) is "accepted" when the latest ANSWERED inspection request that covers it carries one of the
-- response codes the company counts as an acceptance (tenant_policies.qc_accepted_codes, default A,B). When the company's policy is "block" no path (screen, daily-report
-- approval, bulk import, a script) can move a cell to COMPLETE without that acceptance: the rule sits on the table every path writes to.
CREATE FUNCTION project_os_cell_qc_accepted(p_unit varchar, p_activity varchar) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT r.response_code::text = ANY (string_to_array(COALESCE((SELECT p.qc_accepted_codes FROM tenant_policies p WHERE p.tenant_id = r.tenant_id), 'A,B'), ','))
       -- work order 14: while the company's NCR rule is "block" (its default) an open NCR on this unit and activity means the inspection does not count
       AND NOT (
         COALESCE((SELECT p.ncr_acceptance_mode::text FROM tenant_policies p WHERE p.tenant_id = r.tenant_id), 'block') = 'block'
         AND EXISTS (SELECT 1 FROM ncrs n WHERE n.tenant_id = r.tenant_id AND n.pmc_unit_id = p_unit AND n.pmc_activity_definition_id = p_activity AND n.status NOT IN ('closed', 'cancelled'))
       )
      FROM pmc_inspection_requests r
      JOIN pmc_inspection_request_units u ON u.inspection_request_id = r.id
     WHERE u.unit_id = p_unit AND r.activity_definition_id = p_activity AND r.response_code IS NOT NULL
     ORDER BY r.requested_at DESC, r.created_at DESC
     LIMIT 1), false)
$$;
--> statement-breakpoint
CREATE FUNCTION project_os_qc_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE completion_mode text;
BEGIN
  IF NEW.status = 'COMPLETE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'COMPLETE') THEN
    SELECT qc_completion_mode::text INTO completion_mode FROM tenant_policies WHERE tenant_id = NEW.tenant_id;
    IF completion_mode = 'block' AND NOT project_os_cell_qc_accepted(NEW.unit_id, NEW.activity_definition_id) THEN
      RAISE EXCEPTION 'QC_NOT_ACCEPTED: unit % activity % has no accepted inspection', NEW.unit_id, NEW.activity_definition_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER pmc_cell_qc_guard BEFORE INSERT OR UPDATE OF status ON pmc_unit_activity_progress FOR EACH ROW EXECUTE FUNCTION project_os_qc_completion_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_cell_qc_accepted(varchar, varchar), project_os_qc_completion_guard() FROM PUBLIC;
--> statement-breakpoint
-- D-4 (#153): a schedule link joins two activities of ITS OWN project. The foreign keys only say each end exists; this says both ends are in the row's project and company,
-- so no path (the P6 import, a later screen, a hand-written INSERT) can tie project A's activity to project B's. Runs as the caller, under row-level security: an end the caller
-- cannot see is not found, and the row is refused (fail closed).
CREATE FUNCTION project_os_activity_relationship_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM activities a WHERE a.id IN (NEW.predecessor_activity_id, NEW.successor_activity_id) AND a.project_id = NEW.project_id AND a.tenant_id = NEW.tenant_id) <> 2 THEN
    RAISE EXCEPTION 'ACTIVITY_RELATIONSHIP_CROSS_PROJECT: both activities must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER activity_relationships_same_project BEFORE INSERT OR UPDATE OF predecessor_activity_id, successor_activity_id, project_id, tenant_id ON activity_relationships FOR EACH ROW EXECUTE FUNCTION project_os_activity_relationship_same_project();
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_activity_relationship_same_project() FROM PUBLIC;
--> statement-breakpoint
-- G-209 (D-4, review of #153 @ 441821c, item 3): the P6 schedule's sibling tables join rows of ITS OWN project, as activity_relationships already does.
-- The foreign keys only say each end exists; these say each end is in the row's project and company, so no path (the P6 import, a later screen, a hand-written
-- INSERT) can tie project A's activity to project B's code, resource or calendar. Each runs as the caller, under row-level security: an end the caller cannot
-- see is not found, and the row is refused (fail closed).
CREATE FUNCTION project_os_activity_code_assignment_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activities a WHERE a.id = NEW.activity_id AND a.project_id = NEW.project_id AND a.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM activity_code_types t WHERE t.id = NEW.code_type_id AND t.project_id = NEW.project_id AND t.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM activity_code_values v WHERE v.id = NEW.code_value_id AND v.project_id = NEW.project_id AND v.tenant_id = NEW.tenant_id AND v.code_type_id = NEW.code_type_id) THEN
    RAISE EXCEPTION 'ACTIVITY_CODE_ASSIGNMENT_CROSS_PROJECT: the activity, the code type and its value must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION project_os_activity_resource_assignment_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activities a WHERE a.id = NEW.activity_id AND a.project_id = NEW.project_id AND a.tenant_id = NEW.tenant_id)
     OR NOT EXISTS (SELECT 1 FROM project_resources r WHERE r.id = NEW.resource_id AND r.project_id = NEW.project_id AND r.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'ACTIVITY_RESOURCE_ASSIGNMENT_CROSS_PROJECT: the activity and the resource must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION project_os_activity_code_value_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM activity_code_types t WHERE t.id = NEW.code_type_id AND t.project_id = NEW.project_id AND t.tenant_id = NEW.tenant_id)
     OR (NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM activity_code_values p WHERE p.id = NEW.parent_id AND p.project_id = NEW.project_id AND p.tenant_id = NEW.tenant_id AND p.code_type_id = NEW.code_type_id)) THEN
    RAISE EXCEPTION 'ACTIVITY_CODE_VALUE_CROSS_PROJECT: the code type and the parent value must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION project_os_activity_calendar_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.calendar_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM schedule_calendars c WHERE c.id = NEW.calendar_id AND c.project_id = NEW.project_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'ACTIVITY_CALENDAR_CROSS_PROJECT: the calendar must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER activity_code_assignments_same_project BEFORE INSERT OR UPDATE OF activity_id, code_type_id, code_value_id, project_id, tenant_id ON activity_code_assignments FOR EACH ROW EXECUTE FUNCTION project_os_activity_code_assignment_same_project();
--> statement-breakpoint
CREATE TRIGGER activity_resource_assignments_same_project BEFORE INSERT OR UPDATE OF activity_id, resource_id, project_id, tenant_id ON activity_resource_assignments FOR EACH ROW EXECUTE FUNCTION project_os_activity_resource_assignment_same_project();
--> statement-breakpoint
CREATE TRIGGER activity_code_values_same_project BEFORE INSERT OR UPDATE OF code_type_id, parent_id, project_id, tenant_id ON activity_code_values FOR EACH ROW EXECUTE FUNCTION project_os_activity_code_value_same_project();
--> statement-breakpoint
CREATE TRIGGER activities_calendar_same_project BEFORE INSERT OR UPDATE OF calendar_id, project_id, tenant_id ON activities FOR EACH ROW EXECUTE FUNCTION project_os_activity_calendar_same_project();
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_activity_code_assignment_same_project(), project_os_activity_resource_assignment_same_project(), project_os_activity_code_value_same_project(), project_os_activity_calendar_same_project() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION project_os_cell_qc_accepted(varchar, varchar) TO project_os_app;
--> statement-breakpoint
-- Q-25 (review of #413 by programmer B): «issued minutes are final» and «attendees and minutes items are added, not rewritten» held in the database for every
-- role, not by the application's grants (project_os_apply_conventions() re-grants the standard UPDATE and DELETE after every migration). ALWAYS: a session that
-- sets session_replication_role = replica still hits them, as audit_logs does. The one removal allowed is the company's erasure after its freeze.
CREATE FUNCTION project_os_meeting_rows_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE meeting_status text;
BEGIN
  -- the one removal: the company's own erasure (server/tenantData.ts), after freezeTenant suspended it and wrote tenant.deletion_frozen to the audit trail
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM companies c WHERE c.id = OLD.tenant_id AND c.status <> 'active')
     AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.tenant_id = OLD.tenant_id AND a.action = 'tenant.deletion_frozen') THEN
    RETURN OLD;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'MEETING_ROWS_APPEND_ONLY: % rows are added to the minutes, never changed or removed', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- the meeting row is held (FOR SHARE) until this insert commits, so it cannot be issued in between
  SELECT m.status INTO meeting_status FROM project_meetings m WHERE m.id = NEW.meeting_id AND m.tenant_id = NEW.tenant_id AND m.project_id = NEW.project_id FOR SHARE;
  IF meeting_status = 'issued' THEN
    RAISE EXCEPTION 'MEETING_ISSUED: the minutes of meeting % are issued; nothing is added to them', NEW.meeting_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION project_os_meeting_issue_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND EXISTS (SELECT 1 FROM companies c WHERE c.id = OLD.tenant_id AND c.status <> 'active')
     AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.tenant_id = OLD.tenant_id AND a.action = 'tenant.deletion_frozen') THEN
    RETURN OLD; -- the company's own erasure, after its freeze (as above)
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'MEETING_KEPT: a meeting is never removed, except with the erasure of its whole company' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- the one change a meeting takes: a draft is issued (status, issued_at, and the updated_at the conventions keep); everything else is final
  IF OLD.status <> 'draft' OR NEW.status <> 'issued' OR (to_jsonb(NEW) - 'status' - 'issued_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'issued_at' - 'updated_at') THEN
    RAISE EXCEPTION 'MEETING_ISSUED: meeting % moves only from draft to issued, once; issued minutes are final', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_items_append_only ON project_meeting_items;
--> statement-breakpoint
CREATE TRIGGER project_meeting_items_append_only BEFORE INSERT OR UPDATE OR DELETE ON project_meeting_items FOR EACH ROW EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_items_no_truncate ON project_meeting_items;
--> statement-breakpoint
CREATE TRIGGER project_meeting_items_no_truncate BEFORE TRUNCATE ON project_meeting_items FOR EACH STATEMENT EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_attendees_append_only ON project_meeting_attendees;
--> statement-breakpoint
CREATE TRIGGER project_meeting_attendees_append_only BEFORE INSERT OR UPDATE OR DELETE ON project_meeting_attendees FOR EACH ROW EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meeting_attendees_no_truncate ON project_meeting_attendees;
--> statement-breakpoint
CREATE TRIGGER project_meeting_attendees_no_truncate BEFORE TRUNCATE ON project_meeting_attendees FOR EACH STATEMENT EXECUTE FUNCTION project_os_meeting_rows_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meetings_issue_only ON project_meetings;
--> statement-breakpoint
CREATE TRIGGER project_meetings_issue_only BEFORE UPDATE OR DELETE ON project_meetings FOR EACH ROW EXECUTE FUNCTION project_os_meeting_issue_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS project_meetings_no_truncate ON project_meetings;
--> statement-breakpoint
CREATE TRIGGER project_meetings_no_truncate BEFORE TRUNCATE ON project_meetings FOR EACH STATEMENT EXECUTE FUNCTION project_os_meeting_issue_only();
--> statement-breakpoint
ALTER TABLE project_meeting_items ENABLE ALWAYS TRIGGER project_meeting_items_append_only;
--> statement-breakpoint
ALTER TABLE project_meeting_items ENABLE ALWAYS TRIGGER project_meeting_items_no_truncate;
--> statement-breakpoint
ALTER TABLE project_meeting_attendees ENABLE ALWAYS TRIGGER project_meeting_attendees_append_only;
--> statement-breakpoint
ALTER TABLE project_meeting_attendees ENABLE ALWAYS TRIGGER project_meeting_attendees_no_truncate;
--> statement-breakpoint
ALTER TABLE project_meetings ENABLE ALWAYS TRIGGER project_meetings_issue_only;
--> statement-breakpoint
ALTER TABLE project_meetings ENABLE ALWAYS TRIGGER project_meetings_no_truncate;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_meeting_rows_append_only(), project_os_meeting_issue_only() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_apply_conventions(), project_os_analyze(text[]), project_os_set_updated_at(), project_os_audit_logs_refuse() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION project_os_analyze(text[]) TO project_os_app;
--> statement-breakpoint
SELECT project_os_apply_conventions();

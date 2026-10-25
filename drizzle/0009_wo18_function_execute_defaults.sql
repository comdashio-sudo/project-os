-- Work order 18, section 0 item 4 (docs/TASLEEM_LESSONS.md section 4): the privilege on FUNCTIONS, which PostgreSQL gives to everyone by default.
-- Every function created in this database was executable by PUBLIC (hence by anon and authenticated on Supabase) the moment it existed, whether or not anyone wrote that.
-- (1) A function created from now on by the migrating role gets no EXECUTE for PUBLIC. Written WITHOUT `IN SCHEMA`: the schema-scoped form only adds to a role's default
--     list and cannot take away the global default, so it silently does nothing. A function that project_os_app must call says so in its own migration (GRANT EXECUTE ... TO project_os_app).
-- (2) The one existing function that still had the implicit PUBLIC grant (a trigger function, project_os_users_protect_admin) loses it.
-- (3) The five functions the application role calls keep an explicit grant (they already had one; restated so this file alone documents it).
-- (4) The file proves what it did and raises when it did not: no function in public grants EXECUTE to PUBLIC, and a function created now (inside a sub-transaction that is rolled back) has none.
-- Rollback: ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC; (and GRANT EXECUTE ON FUNCTION project_os_users_protect_admin() TO PUBLIC;). Nothing stored changes.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
  END IF;
  -- the role running this file creates the next functions; when it is not `postgres` (a self-hosted owner) it gets the same rule
  IF current_user <> 'postgres' THEN
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC', current_user);
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_users_protect_admin() FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN
    GRANT EXECUTE ON FUNCTION app_system(), app_user_id(), app_tenant_ids(), project_os_analyze(text[]), project_os_cell_qc_accepted(varchar, varchar) TO project_os_app;
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  open_now text;
  leaked boolean;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO open_now
    FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   WHERE p.pronamespace = 'public'::regnamespace AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e');
  IF open_now IS NOT NULL THEN RAISE EXCEPTION 'work order 18: these functions still grant EXECUTE to PUBLIC: %', open_now; END IF;
  BEGIN
    CREATE FUNCTION public.zz_wo18_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1';
    SELECT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    WHERE p.oid = 'public.zz_wo18_probe()'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') INTO leaked;
    IF leaked THEN RAISE EXCEPTION 'work order 18: a function created now still grants EXECUTE to PUBLIC (the default was not changed for %)', current_user; END IF;
    RAISE EXCEPTION 'probe rolled back' USING ERRCODE = 'P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'probe rolled back' THEN RAISE; END IF;
  END;
END $$;

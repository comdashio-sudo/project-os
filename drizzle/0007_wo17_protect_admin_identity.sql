-- Work order 17, item 1: erasing a company removes memberships only; and the identity of a platform administrator (the OWNER_EMAIL account) can never be blanked or replaced.
-- Rollback: DROP TRIGGER users_protect_admin ON users; DROP FUNCTION project_os_users_protect_admin(); no data is touched.
CREATE FUNCTION project_os_users_protect_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'admin' AND ((OLD.email IS NOT NULL AND NEW.email IS NULL) OR (NEW.open_id LIKE 'deleted:%' AND OLD.open_id NOT LIKE 'deleted:%')) THEN
    RAISE EXCEPTION 'the identity of a platform administrator is never erased' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER users_protect_admin BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION project_os_users_protect_admin();

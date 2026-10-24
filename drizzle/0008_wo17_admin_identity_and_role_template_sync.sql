-- Work order 17, items 1 and 2. Idempotent on purpose: a fresh database applies the baseline (which already holds all of this) and then this file.
-- (1) Erasing a company removes memberships only, and the identity of a platform administrator (the OWNER_EMAIL account) can never be blanked or replaced.
-- (2) Role templates reach existing companies: additions apply by themselves (audited); a withdrawn permission is only PROPOSED here (role_template_removals) and waits for the company administrator.
-- Rollback: DROP TRIGGER users_protect_admin ON users; DROP FUNCTION project_os_users_protect_admin(); DROP TABLE role_template_removals; DROP TYPE role_template_removal_status; no company data is touched.
CREATE OR REPLACE FUNCTION project_os_users_protect_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'admin' AND ((OLD.email IS NOT NULL AND NEW.email IS NULL) OR (NEW.open_id LIKE 'deleted:%' AND OLD.open_id NOT LIKE 'deleted:%')) THEN
    RAISE EXCEPTION 'the identity of a platform administrator is never erased' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS users_protect_admin ON users;
--> statement-breakpoint
CREATE TRIGGER users_protect_admin BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION project_os_users_protect_admin();
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."role_template_removal_status" AS ENUM('pending', 'approved', 'declined'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_template_removals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"role_id" varchar(36) NOT NULL,
	"permission_id" varchar(36) NOT NULL,
	"status" "role_template_removal_status" DEFAULT 'pending' NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_user_id" integer,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "role_template_removals" ADD CONSTRAINT "role_template_removals_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "role_template_removals" ADD CONSTRAINT "role_template_removals_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "role_template_removals" ADD CONSTRAINT "role_template_removals_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "role_template_removals" ADD CONSTRAINT "role_template_removals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_template_removals_role_permission_uq" ON "role_template_removals" USING btree ("role_id","permission_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_template_removals_tenant_status_idx" ON "role_template_removals" USING btree ("tenant_id","status");
--> statement-breakpoint
-- The one template change of this order: the Quality manager template gains project.read (it could not open the Quality screen). Every existing company that has the
-- role gets it now, one audit row per addition; a company that already has it is left alone.
WITH added AS (
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
   WHERE r.code = 'QA_QC_MANAGER' AND r.system_managed AND p.code = 'project.read'
  ON CONFLICT DO NOTHING
  RETURNING role_id, permission_id
)
INSERT INTO audit_logs (id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
SELECT gen_random_uuid()::text, r.tenant_id, NULL, 'role_template.permission_added', 'role', r.id, json_build_object('role', r.code, 'permission', 'project.read', 'source', 'migration 0007 (work order 17)')::text
  FROM added a JOIN roles r ON r.id = a.role_id;

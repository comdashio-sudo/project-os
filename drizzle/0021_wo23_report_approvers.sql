-- Work order 23, P-18 (D-42 b): who prepares, reviews and approves a project's reports (one membership per step). Expand-only: one new table and one new
-- UNIQUE (id, tenant_id) on memberships (id is already the primary key, so no existing row can violate it); row-level security, grants and the updated_at trigger
-- come from project_os_apply_conventions(), which the runner calls after this file.
-- The composite foreign key (membership_id, tenant_id) -> memberships (id, tenant_id) makes a step pointing at another company's person impossible, not merely refused.
-- Rollback: DROP TABLE "project_report_approvers"; then ALTER TABLE "memberships" DROP CONSTRAINT "memberships_id_tenant_unique"; — no older code reads either.
-- Correction to 0020's rollback note (0020 is applied and is not edited): «the sweep» removes only objects under uploads/{tenant}/{project}/{purpose}/pending/, so a
-- logo stored for good under uploads/{tenant}/{project}/logo/ is NOT removed by it; after dropping project_profiles such objects are deleted by hand (by prefix).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "memberships" ADD CONSTRAINT "memberships_id_tenant_unique" UNIQUE("id","tenant_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_report_approvers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"step" varchar(8) NOT NULL,
	"membership_id" varchar(36) NOT NULL,
	"assigned_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_report_approvers_step_check" CHECK ("project_report_approvers"."step" IN ('prepare', 'review', 'approve'))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_report_approvers" ADD CONSTRAINT "project_report_approvers_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_report_approvers" ADD CONSTRAINT "project_report_approvers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_report_approvers" ADD CONSTRAINT "project_report_approvers_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_report_approvers" ADD CONSTRAINT "project_report_approvers_membership_tenant_fk" FOREIGN KEY ("membership_id","tenant_id") REFERENCES "public"."memberships"("id","tenant_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_report_approvers_project_step_unique" ON "project_report_approvers" USING btree ("tenant_id","project_id","step");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_report_approvers_membership_idx" ON "project_report_approvers" USING btree ("membership_id");
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the step CHECK, one person per step, and the same-company foreign key
DO $$ BEGIN
  IF to_regclass('public.project_report_approvers') IS NULL THEN RAISE EXCEPTION '0021: project_report_approvers is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_report_approvers_membership_tenant_fk' AND contype = 'f' AND array_length(conkey, 1) = 2) THEN RAISE EXCEPTION '0021: the (membership, company) foreign key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_report_approvers_step_check' AND contype = 'c') THEN RAISE EXCEPTION '0021: the step check is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_report_approvers_project_step_unique' AND indexdef LIKE '%UNIQUE%') THEN RAISE EXCEPTION '0021: one person per step is not enforced'; END IF;
END $$;

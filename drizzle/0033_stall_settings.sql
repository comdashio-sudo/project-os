-- Q-14: per project, after how many working days without movement a started villa counts as stalled (3 by default, 1 to 60). Expand-only: one new table.
-- Row-level security, grants and the updated_at trigger come from project_os_apply_conventions(), run after this file (a tenant_id table is a tenant table).
-- Rollback (no older code reads it): DROP TABLE "project_stall_settings";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_stall_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"threshold_days" integer DEFAULT 3 NOT NULL,
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stall_settings_threshold_check" CHECK ("project_stall_settings"."threshold_days" >= 1 AND "project_stall_settings"."threshold_days" <= 60)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_stall_settings" ADD CONSTRAINT "project_stall_settings_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_stall_settings" ADD CONSTRAINT "project_stall_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_stall_settings" ADD CONSTRAINT "project_stall_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_stall_settings_project_unique" ON "project_stall_settings" USING btree ("tenant_id","project_id");

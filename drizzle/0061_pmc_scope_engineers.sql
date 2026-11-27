-- Q-72 (4): the engineer in charge of a block or a phase of a project — one per scope, set by whoever manages PMC (project.pmc.manage), shown in the activity summary.
-- Impact: expand-only. One new, empty table; nothing existing changes. One engineer per project × scope type × scope key (unique); the type is block or phase (CHECK).
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads it): DROP TABLE "pmc_scope_engineers";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_scope_engineers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"scope_type" varchar(8) NOT NULL,
	"scope_key" varchar(80) NOT NULL,
	"engineer_user_id" integer NOT NULL,
	"updated_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pmc_scope_engineers_type_check" CHECK ("pmc_scope_engineers"."scope_type" IN ('block', 'phase'))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_scope_engineers" ADD CONSTRAINT "pmc_scope_engineers_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_scope_engineers" ADD CONSTRAINT "pmc_scope_engineers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_scope_engineers" ADD CONSTRAINT "pmc_scope_engineers_engineer_user_id_users_id_fk" FOREIGN KEY ("engineer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_scope_engineers" ADD CONSTRAINT "pmc_scope_engineers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_scope_engineers_scope_unique" ON "pmc_scope_engineers" USING btree ("project_id","scope_type","scope_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_scope_engineers_tenant_project_idx" ON "pmc_scope_engineers" USING btree ("tenant_id","project_id");

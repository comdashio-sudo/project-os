-- Q-61 (3): once per project, which stages of the P6 schedule (its «Q Item» codes) each weight group's planned progress follows — across the span of those
-- stages' activities in a villa, or at the start or the end of one stage. Suggested by name, saved by a person with project.pmc.manage, audited.
-- Impact: expand-only. One new, empty table; nothing existing changes. One link per project × weight group; the anchor is one of span/start/end (CHECK).
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads it): DROP TABLE "pmc_schedule_stage_links";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_schedule_stage_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"group_id" varchar(36) NOT NULL,
	"stage_codes_json" text NOT NULL,
	"anchor" varchar(8) DEFAULT 'span' NOT NULL,
	"suggested_score" numeric(5, 4),
	"updated_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pmc_schedule_stage_links_anchor_check" CHECK ("pmc_schedule_stage_links"."anchor" IN ('span', 'start', 'end'))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_schedule_stage_links" ADD CONSTRAINT "pmc_schedule_stage_links_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_schedule_stage_links" ADD CONSTRAINT "pmc_schedule_stage_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_schedule_stage_links" ADD CONSTRAINT "pmc_schedule_stage_links_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_schedule_stage_links" ADD CONSTRAINT "pmc_stage_links_group_fk" FOREIGN KEY ("group_id") REFERENCES "public"."pmc_activity_groups"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_schedule_stage_links_group_unique" ON "pmc_schedule_stage_links" USING btree ("project_id","group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_schedule_stage_links_tenant_project_idx" ON "pmc_schedule_stage_links" USING btree ("tenant_id","project_id");

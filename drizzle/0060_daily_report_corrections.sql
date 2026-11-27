-- Q-72 (5): a daily report that was sent is frozen. A correction is an additional record beside it (who, when, which part, what was wrong and what is right),
-- never an edit of the sent figures; the sent report and its totals stay exactly as sent.
-- Impact: expand-only. One new, empty table; nothing existing changes. Tied to a report of the SAME project (composite foreign key); the section is one of a closed list (CHECK).
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads it): DROP TABLE "site_daily_report_corrections";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_corrections" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"section" varchar(24) NOT NULL,
	"note" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_daily_report_corrections_section_check" CHECK ("site_daily_report_corrections"."section" IN ('summary', 'labour', 'equipment', 'work', 'materials', 'hse', 'obstacles', 'weather', 'other'))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_corrections" ADD CONSTRAINT "site_daily_report_corrections_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_corrections" ADD CONSTRAINT "site_daily_report_corrections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_corrections" ADD CONSTRAINT "site_daily_report_corrections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_corrections" ADD CONSTRAINT "site_daily_report_corrections_report_fk" FOREIGN KEY ("report_id","tenant_id","project_id") REFERENCES "public"."site_daily_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_corrections_report_idx" ON "site_daily_report_corrections" USING btree ("report_id");

-- D-49 (a): the weekly report's own words — the texts the planning engineer writes and the daily-report photos chosen for it. Its figures are NOT stored: they are the
-- period engine's (D-48, server/reportPeriods.ts), recomputed from the approved dailies every time the report is read. Expand-only: two new tables and one
-- UNIQUE (id, tenant_id, project_id) on site_daily_report_photos (its first column is the primary key, so no existing row can violate it).
-- A chosen photo is tied to a daily-report photo of the SAME project, and a photo row to a weekly report of the same project, by composite foreign keys.
-- Row-level security, the updated_at trigger and the column-level grants come from project_os_apply_conventions(), run after this file; the explicit GRANTs below say the
-- intended privileges of the application role in this file as well (the sweep re-applies the same set).
-- Rollback (no older code reads any of it): DROP TABLE "weekly_report_photos"; DROP TABLE "weekly_reports";
--   ALTER TABLE "site_daily_report_photos" DROP CONSTRAINT "site_daily_report_photos_id_tenant_project_unique";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_reports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"week_start" date NOT NULL,
	"summary" text,
	"analysis" text,
	"corrective_actions" text,
	"milestones" text,
	"outlook" text,
	"engineering" text,
	"procurement" text,
	"commercial" text,
	"interfaces" text,
	"issues" text,
	"decisions" text,
	"created_by_user_id" integer NOT NULL,
	"updated_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_reports_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_report_photos" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"weekly_report_id" varchar(36) NOT NULL,
	"photo_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_reports_project_week_unique" ON "weekly_reports" USING btree ("project_id","week_start");
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_report_photos" ADD CONSTRAINT "weekly_report_photos_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_report_photos" ADD CONSTRAINT "weekly_report_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_report_photos" ADD CONSTRAINT "weekly_report_photos_report_fk" FOREIGN KEY ("weekly_report_id","tenant_id","project_id") REFERENCES "public"."weekly_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "weekly_report_photos" ADD CONSTRAINT "weekly_report_photos_photo_fk" FOREIGN KEY ("photo_id","tenant_id","project_id") REFERENCES "public"."site_daily_report_photos"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_report_photos_report_photo_unique" ON "weekly_report_photos" USING btree ("weekly_report_id","photo_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_report_photos_report_idx" ON "weekly_report_photos" USING btree ("weekly_report_id");
--> statement-breakpoint
-- the application role's privileges, said here explicitly (only where the role exists, as on every environment this repository deploys to); the conventions sweep that runs
-- after this file applies the same set and enables row-level security with the tenant-and-project policies
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN
    GRANT SELECT, INSERT, DELETE ON "weekly_reports", "weekly_report_photos" TO project_os_app;
    GRANT UPDATE ("summary", "analysis", "corrective_actions", "milestones", "outlook", "engineering", "procurement", "commercial", "interfaces", "issues", "decisions", "updated_by_user_id", "updated_at") ON "weekly_reports" TO project_os_app;
  END IF;
END $$;
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the two same-project keys and the one report per project and week
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_constraint WHERE conname IN ('weekly_report_photos_report_fk', 'weekly_report_photos_photo_fk') AND contype = 'f' AND array_length(conkey, 1) = 3) <> 2 THEN RAISE EXCEPTION '0034: a same-project foreign key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'weekly_reports_project_week_unique') THEN RAISE EXCEPTION '0034: the one-report-per-week index is missing'; END IF;
END $$;

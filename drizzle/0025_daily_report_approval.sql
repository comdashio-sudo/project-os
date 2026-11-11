-- D-45 (c), P-39 (2): the middle step of the report's approval chain (prepare → review → approve: who reviewed, when, the note) and where a photo was taken (a zone in
-- words, or a unit of the SAME project). Expand-only: five nullable columns and one UNIQUE (id, tenant_id, project_id) on pmc_units whose first column is the primary key
-- (no existing row can violate it). Grants and row-level security come from project_os_apply_conventions(), run after this file. The inspections of the day are read from
-- pmc_inspection_requests and rfis when the report is read: no table, nothing typed.
-- Rollback (no older code reads any of it): ALTER TABLE "site_daily_report_photos" DROP CONSTRAINT "site_daily_report_photos_unit_fk", DROP COLUMN "pmc_unit_id", DROP COLUMN "zone";
--   ALTER TABLE "site_daily_reports" DROP COLUMN "checked_by_user_id", DROP COLUMN "checked_at", DROP COLUMN "check_note";
--   ALTER TABLE "pmc_units" DROP CONSTRAINT "pmc_units_id_tenant_project_unique";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "checked_by_user_id" integer;
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "check_note" varchar(500);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_checked_by_user_id_users_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_units" ADD CONSTRAINT "pmc_units_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "site_daily_report_photos" ADD COLUMN IF NOT EXISTS "zone" varchar(80);
--> statement-breakpoint
ALTER TABLE "site_daily_report_photos" ADD COLUMN IF NOT EXISTS "pmc_unit_id" varchar(36);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_unit_fk" FOREIGN KEY ("pmc_unit_id","tenant_id","project_id") REFERENCES "public"."pmc_units"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
-- refuse to finish without the same-project key of a photo's unit
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_photos_unit_fk' AND contype = 'f' AND array_length(conkey, 1) = 3) THEN RAISE EXCEPTION '0025: the photo unit key of the same project is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_daily_reports' AND column_name = 'checked_at') THEN RAISE EXCEPTION '0025: checked_at is missing'; END IF;
END $$;

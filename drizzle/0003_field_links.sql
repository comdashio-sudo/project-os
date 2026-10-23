-- Work order 12, items 4 to 7: the site daily report, the consultant submittals and their reply codes, the company's quality/material policies, the cell of an NCR,
-- and the quality gate on a cell's COMPLETE status (the function and trigger are in drizzle/baseline-security.sql with their reasons). For a database that applied an earlier baseline; every statement is re-runnable.

DO $$ BEGIN CREATE TYPE "public"."consultant_submittals_status" AS ENUM('draft', 'sent', 'replied', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."consultant_submittals_type" AS ENUM('shop_drawing', 'material_approval', 'method_statement', 'sample'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."site_daily_report_lines_line_type" AS ENUM('labour', 'equipment', 'work'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."site_daily_reports_status" AS ENUM('draft', 'submitted', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."tenant_policies_mode" AS ENUM('off', 'warn', 'block'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consultant_submittals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"submittal_type" "consultant_submittals_type" NOT NULL,
	"submittal_number" varchar(120) NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"title" varchar(255) NOT NULL,
	"status" "consultant_submittals_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"reply_code" varchar(8),
	"reply_note" varchar(500),
	"pmc_activity_definition_id" varchar(36),
	"pmc_unit_id" varchar(36),
	"material_id" varchar(36),
	"created_by_user_id" integer NOT NULL,
	"sent_by_user_id" integer,
	"replied_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ncrs" ADD COLUMN IF NOT EXISTS "pmc_unit_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "ncrs" ADD COLUMN IF NOT EXISTS "pmc_activity_definition_id" varchar(36);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"line_type" "site_daily_report_lines_line_type" NOT NULL,
	"pmc_activity_definition_id" varchar(36),
	"pmc_unit_id" varchar(36),
	"label" varchar(160),
	"quantity" numeric(10, 2),
	"hours" numeric(6, 2),
	"description" text,
	"reported_status" "pmc_unit_activity_progress_status",
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_photos" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"file_name" varchar(160) NOT NULL,
	"content_type" varchar(80) NOT NULL,
	"size_bytes" integer NOT NULL,
	"caption" varchar(255),
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_reports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_date" date NOT NULL,
	"weather" varchar(24),
	"temperature_c" numeric(5, 1),
	"summary" text,
	"obstacles" text,
	"status" "site_daily_reports_status" DEFAULT 'draft' NOT NULL,
	"prepared_by_user_id" integer NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	"review_note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submittal_reply_codes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"code" varchar(8) NOT NULL,
	"label_ar" varchar(120) NOT NULL,
	"label_en" varchar(120) NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_policies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"qc_completion_mode" "tenant_policies_mode" DEFAULT 'warn' NOT NULL,
	"qc_accepted_codes" varchar(40) DEFAULT 'A,B' NOT NULL,
	"material_approval_mode" "tenant_policies_mode" DEFAULT 'warn' NOT NULL,
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultant_submittals_tenant_id_companies_id_fk') THEN ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultant_submittals_project_id_projects_id_fk') THEN ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultant_submittals_created_by_user_id_users_id_fk') THEN ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultant_submittals_sent_by_user_id_users_id_fk') THEN ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultant_submittals_replied_by_user_id_users_id_fk') THEN ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_replied_by_user_id_users_id_fk" FOREIGN KEY ("replied_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_lines_tenant_id_companies_id_fk') THEN ALTER TABLE "site_daily_report_lines" ADD CONSTRAINT "site_daily_report_lines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_lines_project_id_projects_id_fk') THEN ALTER TABLE "site_daily_report_lines" ADD CONSTRAINT "site_daily_report_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_lines_report_id_site_daily_reports_id_fk') THEN ALTER TABLE "site_daily_report_lines" ADD CONSTRAINT "site_daily_report_lines_report_id_site_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."site_daily_reports"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_photos_tenant_id_companies_id_fk') THEN ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_photos_project_id_projects_id_fk') THEN ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_photos_report_id_site_daily_reports_id_fk') THEN ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_report_id_site_daily_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."site_daily_reports"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_photos_created_by_user_id_users_id_fk') THEN ALTER TABLE "site_daily_report_photos" ADD CONSTRAINT "site_daily_report_photos_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_reports_tenant_id_companies_id_fk') THEN ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_reports_project_id_projects_id_fk') THEN ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_reports_prepared_by_user_id_users_id_fk') THEN ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_reports_reviewed_by_user_id_users_id_fk') THEN ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'submittal_reply_codes_tenant_id_companies_id_fk') THEN ALTER TABLE "submittal_reply_codes" ADD CONSTRAINT "submittal_reply_codes_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_policies_tenant_id_companies_id_fk') THEN ALTER TABLE "tenant_policies" ADD CONSTRAINT "tenant_policies_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_policies_updated_by_user_id_users_id_fk') THEN ALTER TABLE "tenant_policies" ADD CONSTRAINT "tenant_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "consultant_submittals_number_revision_unique" ON "consultant_submittals" USING btree ("project_id","submittal_number","revision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultant_submittals_tenant_project_status_idx" ON "consultant_submittals" USING btree ("tenant_id","project_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consultant_submittals_material_idx" ON "consultant_submittals" USING btree ("project_id","material_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_lines_report_idx" ON "site_daily_report_lines" USING btree ("report_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_lines_cell_idx" ON "site_daily_report_lines" USING btree ("pmc_unit_id","pmc_activity_definition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_photos_report_idx" ON "site_daily_report_photos" USING btree ("report_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_daily_report_photos_key_unique" ON "site_daily_report_photos" USING btree ("storage_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_daily_reports_project_date_preparer_unique" ON "site_daily_reports" USING btree ("project_id","report_date","prepared_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_reports_tenant_project_status_idx" ON "site_daily_reports" USING btree ("tenant_id","project_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submittal_reply_codes_tenant_code_unique" ON "submittal_reply_codes" USING btree ("tenant_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_policies_tenant_unique" ON "tenant_policies" USING btree ("tenant_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_cell_qc_accepted(p_unit varchar, p_activity varchar) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT r.response_code::text = ANY (string_to_array(COALESCE((SELECT p.qc_accepted_codes FROM tenant_policies p WHERE p.tenant_id = r.tenant_id), 'A,B'), ','))
      FROM pmc_inspection_requests r
      JOIN pmc_inspection_request_units u ON u.inspection_request_id = r.id
     WHERE u.unit_id = p_unit AND r.activity_definition_id = p_activity AND r.response_code IS NOT NULL
     ORDER BY r.requested_at DESC, r.created_at DESC
     LIMIT 1), false)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_qc_completion_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE completion_mode text;
BEGIN
  IF NEW.status = 'COMPLETE' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'COMPLETE') THEN
    SELECT qc_completion_mode::text INTO completion_mode FROM tenant_policies WHERE tenant_id = NEW.tenant_id;
    IF completion_mode = 'block' AND NOT project_os_cell_qc_accepted(NEW.unit_id, NEW.activity_definition_id) THEN
      RAISE EXCEPTION 'QC_NOT_ACCEPTED: unit % activity % has no accepted inspection', NEW.unit_id, NEW.activity_definition_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS pmc_cell_qc_guard ON pmc_unit_activity_progress;
--> statement-breakpoint
CREATE TRIGGER pmc_cell_qc_guard BEFORE INSERT OR UPDATE OF status ON pmc_unit_activity_progress FOR EACH ROW EXECUTE FUNCTION project_os_qc_completion_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_cell_qc_accepted(varchar, varchar), project_os_qc_completion_guard() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION project_os_cell_qc_accepted(varchar, varchar) TO project_os_app;

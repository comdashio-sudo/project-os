-- D-45 (b), P-39 (1): the daily report's other sections — materials received (optionally against the consultant's approval of that material, same project), HSE events,
-- obstacles, and the plan for tomorrow. Expand-only: four new tables and one UNIQUE (id, tenant_id, project_id) on consultant_submittals (its first column is the primary
-- key, so no existing row can violate it). Row-level security, grants and the updated_at trigger come from project_os_apply_conventions(), run after this file.
-- Every row is tied to a report of the SAME project, and a material to a submittal of the same project, by composite foreign keys.
-- Rollback (no older code reads any of it): DROP TABLE "site_daily_report_materials"; DROP TABLE "site_daily_report_hse"; DROP TABLE "site_daily_report_obstacles";
--   DROP TABLE "site_daily_report_tomorrow"; ALTER TABLE "consultant_submittals" DROP CONSTRAINT "consultant_submittals_id_tenant_project_unique";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_materials" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"material" varchar(160) NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" varchar(24) NOT NULL,
	"supplier" varchar(160),
	"consultant_submittal_id" varchar(36),
	CONSTRAINT "site_daily_report_materials_quantity_check" CHECK ("site_daily_report_materials"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_hse" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kind" varchar(20) NOT NULL,
	"description" text NOT NULL,
	"people_count" integer,
	"action_taken" text,
	CONSTRAINT "site_daily_report_hse_kind_check" CHECK ("site_daily_report_hse"."kind" IN ('meeting', 'incident', 'near_miss', 'violation', 'corrective_action') AND ("site_daily_report_hse"."people_count" IS NULL OR "site_daily_report_hse"."people_count" >= 0))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_obstacles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issue" text NOT NULL,
	"impact" text,
	"responsible" varchar(160),
	"action" text,
	"due_date" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_tomorrow" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"area" varchar(160),
	"activity" varchar(255) NOT NULL,
	"quantity" numeric(14, 3),
	"unit" varchar(24),
	"resources" text,
	CONSTRAINT "site_daily_report_tomorrow_quantity_check" CHECK ("site_daily_report_tomorrow"."quantity" IS NULL OR "site_daily_report_tomorrow"."quantity" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_materials" ADD CONSTRAINT "site_daily_report_materials_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_materials" ADD CONSTRAINT "site_daily_report_materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_materials" ADD CONSTRAINT "site_daily_report_materials_report_fk" FOREIGN KEY ("report_id","tenant_id","project_id") REFERENCES "public"."site_daily_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_materials" ADD CONSTRAINT "site_daily_report_materials_submittal_fk" FOREIGN KEY ("consultant_submittal_id","tenant_id","project_id") REFERENCES "public"."consultant_submittals"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_materials_report_idx" ON "site_daily_report_materials" USING btree ("report_id");
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_hse" ADD CONSTRAINT "site_daily_report_hse_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_hse" ADD CONSTRAINT "site_daily_report_hse_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_hse" ADD CONSTRAINT "site_daily_report_hse_report_fk" FOREIGN KEY ("report_id","tenant_id","project_id") REFERENCES "public"."site_daily_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_hse_report_idx" ON "site_daily_report_hse" USING btree ("report_id");
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_obstacles" ADD CONSTRAINT "site_daily_report_obstacles_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_obstacles" ADD CONSTRAINT "site_daily_report_obstacles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_obstacles" ADD CONSTRAINT "site_daily_report_obstacles_report_fk" FOREIGN KEY ("report_id","tenant_id","project_id") REFERENCES "public"."site_daily_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_obstacles_report_idx" ON "site_daily_report_obstacles" USING btree ("report_id");
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_tomorrow" ADD CONSTRAINT "site_daily_report_tomorrow_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_tomorrow" ADD CONSTRAINT "site_daily_report_tomorrow_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_tomorrow" ADD CONSTRAINT "site_daily_report_tomorrow_report_fk" FOREIGN KEY ("report_id","tenant_id","project_id") REFERENCES "public"."site_daily_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_tomorrow_report_idx" ON "site_daily_report_tomorrow" USING btree ("report_id");
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the four same-project report keys and the same-project submittal key
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_constraint WHERE conname IN ('site_daily_report_materials_report_fk', 'site_daily_report_hse_report_fk', 'site_daily_report_obstacles_report_fk', 'site_daily_report_tomorrow_report_fk', 'site_daily_report_materials_submittal_fk') AND contype = 'f' AND array_length(conkey, 1) = 3) <> 5 THEN RAISE EXCEPTION '0025: a same-project foreign key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_daily_report_hse_kind_check' AND contype = 'c') THEN RAISE EXCEPTION '0025: the HSE kind check is missing'; END IF;
END $$;

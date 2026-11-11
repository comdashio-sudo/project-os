-- D-45 (a), P-38: the daily report's header (a system number, the wind, the working hours), its labour matrix (company × role × shift) and its equipment, and the planned and
-- actual quantity of a work line. Expand-only: three new tables, four new nullable columns, two CHECKs and four UNIQUE constraints whose columns start with the primary key
-- (no existing row can violate them). Row-level security, grants and the updated_at trigger come from project_os_apply_conventions(), run after this file.
-- Composite foreign keys (x_id, tenant_id, project_id) make a role, a company, a machine or a report of ANOTHER project impossible in a labour or equipment row.
-- Rollback (no older code reads any of it): DROP TABLE "site_daily_report_labour"; DROP TABLE "site_daily_report_equipment"; DROP TABLE "project_report_counters";
--   ALTER TABLE "site_daily_reports" DROP CONSTRAINT "site_daily_reports_id_tenant_project_unique", DROP CONSTRAINT "site_daily_reports_work_hours_check", DROP COLUMN "report_number", DROP COLUMN "wind", DROP COLUMN "work_hours";
--   DROP INDEX "site_daily_reports_project_number_unique"; ALTER TABLE "site_daily_report_lines" DROP CONSTRAINT "site_daily_report_lines_quantities_check", DROP COLUMN "planned_quantity", DROP COLUMN "actual_quantity";
--   ALTER TABLE "project_labour_roles" DROP CONSTRAINT "project_labour_roles_id_tenant_project_unique"; ALTER TABLE "project_equipment" DROP CONSTRAINT "project_equipment_id_tenant_project_unique";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "report_number" varchar(40);
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "wind" varchar(24);
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "work_hours" numeric(4, 1);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_work_hours_check" CHECK ("site_daily_reports"."work_hours" IS NULL OR ("site_daily_reports"."work_hours" >= 0 AND "site_daily_reports"."work_hours" <= 24)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_reports" ADD CONSTRAINT "site_daily_reports_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_daily_reports_project_number_unique" ON "site_daily_reports" USING btree ("project_id","report_number") WHERE "site_daily_reports"."report_number" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "site_daily_report_lines" ADD COLUMN IF NOT EXISTS "planned_quantity" numeric(14, 3);
--> statement-breakpoint
ALTER TABLE "site_daily_report_lines" ADD COLUMN IF NOT EXISTS "actual_quantity" numeric(14, 3);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_lines" ADD CONSTRAINT "site_daily_report_lines_quantities_check" CHECK (("site_daily_report_lines"."planned_quantity" IS NULL OR "site_daily_report_lines"."planned_quantity" >= 0) AND ("site_daily_report_lines"."actual_quantity" IS NULL OR "site_daily_report_lines"."actual_quantity" >= 0)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_labour_roles" ADD CONSTRAINT "project_labour_roles_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_report_counters" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"last_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_report_counters_kind_check" CHECK ("project_report_counters"."kind" IN ('daily'))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_report_counters" ADD CONSTRAINT "project_report_counters_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_report_counters" ADD CONSTRAINT "project_report_counters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_report_counters_project_kind_unique" ON "project_report_counters" USING btree ("tenant_id","project_id","kind");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_labour" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"company_id" varchar(36) NOT NULL,
	"labour_role_id" varchar(36) NOT NULL,
	"shift" varchar(8) NOT NULL,
	"headcount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_daily_report_labour_shift_check" CHECK ("site_daily_report_labour"."shift" IN ('day', 'night')),
	CONSTRAINT "site_daily_report_labour_headcount_check" CHECK ("site_daily_report_labour"."headcount" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_labour" ADD CONSTRAINT "site_daily_report_labour_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_labour" ADD CONSTRAINT "site_daily_report_labour_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_labour" ADD CONSTRAINT "site_daily_report_labour_report_fk" FOREIGN KEY ("report_id","tenant_id","project_id") REFERENCES "public"."site_daily_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_labour" ADD CONSTRAINT "site_daily_report_labour_company_fk" FOREIGN KEY ("company_id","tenant_id","project_id") REFERENCES "public"."project_companies"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_labour" ADD CONSTRAINT "site_daily_report_labour_role_fk" FOREIGN KEY ("labour_role_id","tenant_id","project_id") REFERENCES "public"."project_labour_roles"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_daily_report_labour_cell_unique" ON "site_daily_report_labour" USING btree ("report_id","company_id","labour_role_id","shift");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_labour_tenant_project_idx" ON "site_daily_report_labour" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_daily_report_equipment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"equipment_id" varchar(36) NOT NULL,
	"count" integer NOT NULL,
	"hours" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_daily_report_equipment_values_check" CHECK ("site_daily_report_equipment"."count" > 0 AND ("site_daily_report_equipment"."hours" IS NULL OR ("site_daily_report_equipment"."hours" >= 0 AND "site_daily_report_equipment"."hours" <= 24)))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_equipment" ADD CONSTRAINT "site_daily_report_equipment_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_equipment" ADD CONSTRAINT "site_daily_report_equipment_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_equipment" ADD CONSTRAINT "site_daily_report_equipment_report_fk" FOREIGN KEY ("report_id","tenant_id","project_id") REFERENCES "public"."site_daily_reports"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "site_daily_report_equipment" ADD CONSTRAINT "site_daily_report_equipment_item_fk" FOREIGN KEY ("equipment_id","tenant_id","project_id") REFERENCES "public"."project_equipment"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_daily_report_equipment_item_unique" ON "site_daily_report_equipment" USING btree ("report_id","equipment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_daily_report_equipment_tenant_project_idx" ON "site_daily_report_equipment" USING btree ("tenant_id","project_id");
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the three same-project keys of a labour row, the machine's, one number per report, one row per labour cell
DO $$ BEGIN
  IF to_regclass('public.site_daily_report_labour') IS NULL OR to_regclass('public.site_daily_report_equipment') IS NULL OR to_regclass('public.project_report_counters') IS NULL THEN RAISE EXCEPTION '0024: a daily-report table is missing'; END IF;
  IF (SELECT COUNT(*) FROM pg_constraint WHERE conname IN ('site_daily_report_labour_report_fk', 'site_daily_report_labour_company_fk', 'site_daily_report_labour_role_fk', 'site_daily_report_equipment_report_fk', 'site_daily_report_equipment_item_fk') AND contype = 'f' AND array_length(conkey, 1) = 3) <> 5 THEN RAISE EXCEPTION '0024: a same-project foreign key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'site_daily_reports_project_number_unique' AND indexdef LIKE '%UNIQUE%') THEN RAISE EXCEPTION '0024: one number per report is not enforced'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'site_daily_report_labour_cell_unique' AND indexdef LIKE '%UNIQUE%') THEN RAISE EXCEPTION '0024: one row per labour cell is not enforced'; END IF;
END $$;

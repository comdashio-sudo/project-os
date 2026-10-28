-- Work order 22 (the 390-villa project): the site <-> the consultant <-> the monthly report. Expand-only: new tables, nullable columns, one loosened unique index.
-- Rollback: DROP the eleven pmc_site_*/pmc_consultant_*/pmc_cell_notes/pmc_contractors/pmc_plan_months tables and the two types; the added columns are nullable and unread by older code.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."pmc_consultant_status" AS ENUM('NOT_RECEIVED', 'RECEIVED', 'APPROVED', 'REJECTED', 'CODE_A', 'CODE_B', 'CODE_C', 'CODE_D'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."pmc_site_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'INSPECTION_REQUESTED', 'QC_APPROVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_cell_notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"unit_id" varchar(36) NOT NULL,
	"activity_code" varchar(80) NOT NULL,
	"note" varchar(2000) NOT NULL,
	"updated_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_consultant_cell_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"cell_id" varchar(36) NOT NULL,
	"from_status" "pmc_consultant_status",
	"to_status" "pmc_consultant_status" NOT NULL,
	"observed_on" date NOT NULL,
	"import_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_consultant_cells" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"unit_id" varchar(36) NOT NULL,
	"column_id" varchar(36) NOT NULL,
	"status" "pmc_consultant_status" DEFAULT 'NOT_RECEIVED' NOT NULL,
	"first_received_on" date,
	"status_on" date,
	"last_import_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_consultant_columns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"source_key" varchar(255) NOT NULL,
	"wir_code" varchar(40),
	"section_name" varchar(255),
	"subgroup_name" varchar(255),
	"activity_name" varchar(255) NOT NULL,
	"location_name" varchar(120),
	"weight" numeric(10, 8),
	"reported_percent" numeric(9, 6),
	"activity_code" varchar(80),
	"link_method" varchar(16),
	"linked_by_user_id" integer,
	"linked_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_contractors" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"number" varchar(80),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_plan_months" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"month" date NOT NULL,
	"planned_cost" numeric(18, 2),
	"planned_percent" numeric(10, 8) NOT NULL,
	"cumulative_percent" numeric(10, 8) NOT NULL,
	"import_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_site_activities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"csi_name" varchar(255) NOT NULL,
	"sub_name" varchar(255),
	"name" varchar(255) NOT NULL,
	"weight" numeric(10, 8) NOT NULL,
	"model_codes_json" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_site_activity_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"site_activity_id" varchar(36) NOT NULL,
	"activity_code" varchar(80) NOT NULL,
	"score" numeric(5, 4),
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by_user_id" integer,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_site_cell_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"cell_id" varchar(36) NOT NULL,
	"from_status" "pmc_site_status",
	"to_status" "pmc_site_status" NOT NULL,
	"status_on" date NOT NULL,
	"entered_by_user_id" integer,
	"entered_by_label" varchar(120),
	"source" varchar(24) NOT NULL,
	"batch_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_site_cells" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"unit_id" varchar(36) NOT NULL,
	"site_activity_id" varchar(36) NOT NULL,
	"status" "pmc_site_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"status_on" date,
	"not_started_on" date,
	"in_progress_on" date,
	"done_on" date,
	"inspection_requested_on" date,
	"qc_approved_on" date,
	"updated_by_user_id" integer,
	"updated_by_label" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pmc_activity_definitions" ADD COLUMN IF NOT EXISTS "wir_code" varchar(40);
--> statement-breakpoint
ALTER TABLE "pmc_units" ADD COLUMN IF NOT EXISTS "villa_label" varchar(40);
--> statement-breakpoint
ALTER TABLE "pmc_units" ADD COLUMN IF NOT EXISTS "net_sellable_area" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "pmc_units" ADD COLUMN IF NOT EXISTS "unit_price" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "site_daily_report_lines" ADD COLUMN IF NOT EXISTS "wbs_code" varchar(40);
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "contractor_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "main_labour_count" integer;
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "sub_labour_count" integer;
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "inspection_status" varchar(24);
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "day_progress_percent" numeric(7, 4);
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "remaining_days" integer;
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "recommendations" text;
--> statement-breakpoint
ALTER TABLE "site_daily_reports" ADD COLUMN IF NOT EXISTS "source_label" varchar(60);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_cell_notes" ADD CONSTRAINT "pmc_cell_notes_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_cell_notes" ADD CONSTRAINT "pmc_cell_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_cell_notes" ADD CONSTRAINT "pmc_cell_notes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_cell_notes" ADD CONSTRAINT "pmc_cell_notes_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."pmc_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_cell_events" ADD CONSTRAINT "pmc_consultant_cell_events_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_cell_events" ADD CONSTRAINT "pmc_consultant_cell_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_cell_events" ADD CONSTRAINT "pmc_consultant_events_cell_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."pmc_consultant_cells"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_cells" ADD CONSTRAINT "pmc_consultant_cells_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_cells" ADD CONSTRAINT "pmc_consultant_cells_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_cells" ADD CONSTRAINT "pmc_consultant_cells_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."pmc_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_cells" ADD CONSTRAINT "pmc_consultant_cells_column_fk" FOREIGN KEY ("column_id") REFERENCES "public"."pmc_consultant_columns"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_columns" ADD CONSTRAINT "pmc_consultant_columns_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_columns" ADD CONSTRAINT "pmc_consultant_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_consultant_columns" ADD CONSTRAINT "pmc_consultant_columns_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_contractors" ADD CONSTRAINT "pmc_contractors_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_contractors" ADD CONSTRAINT "pmc_contractors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_plan_months" ADD CONSTRAINT "pmc_plan_months_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_plan_months" ADD CONSTRAINT "pmc_plan_months_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_activities" ADD CONSTRAINT "pmc_site_activities_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_activities" ADD CONSTRAINT "pmc_site_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_activity_links" ADD CONSTRAINT "pmc_site_activity_links_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_activity_links" ADD CONSTRAINT "pmc_site_activity_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_activity_links" ADD CONSTRAINT "pmc_site_activity_links_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_activity_links" ADD CONSTRAINT "pmc_site_links_activity_fk" FOREIGN KEY ("site_activity_id") REFERENCES "public"."pmc_site_activities"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cell_events" ADD CONSTRAINT "pmc_site_cell_events_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cell_events" ADD CONSTRAINT "pmc_site_cell_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cell_events" ADD CONSTRAINT "pmc_site_cell_events_entered_by_user_id_users_id_fk" FOREIGN KEY ("entered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cell_events" ADD CONSTRAINT "pmc_site_events_cell_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."pmc_site_cells"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cells" ADD CONSTRAINT "pmc_site_cells_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cells" ADD CONSTRAINT "pmc_site_cells_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cells" ADD CONSTRAINT "pmc_site_cells_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cells" ADD CONSTRAINT "pmc_site_cells_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."pmc_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_cells" ADD CONSTRAINT "pmc_site_cells_activity_fk" FOREIGN KEY ("site_activity_id") REFERENCES "public"."pmc_site_activities"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_cell_notes_unit_activity_unique" ON "pmc_cell_notes" USING btree ("unit_id","activity_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_cell_notes_tenant_project_idx" ON "pmc_cell_notes" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_consultant_events_tenant_project_idx" ON "pmc_consultant_cell_events" USING btree ("tenant_id","project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_consultant_events_cell_idx" ON "pmc_consultant_cell_events" USING btree ("cell_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_consultant_cells_unit_column_unique" ON "pmc_consultant_cells" USING btree ("unit_id","column_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_consultant_cells_tenant_project_status_idx" ON "pmc_consultant_cells" USING btree ("tenant_id","project_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_consultant_columns_project_key_unique" ON "pmc_consultant_columns" USING btree ("project_id","source_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_consultant_columns_tenant_project_idx" ON "pmc_consultant_columns" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_contractors_project_name_unique" ON "pmc_contractors" USING btree ("project_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_contractors_tenant_project_idx" ON "pmc_contractors" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_plan_months_project_month_unique" ON "pmc_plan_months" USING btree ("project_id","month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_plan_months_tenant_project_idx" ON "pmc_plan_months" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_site_activities_project_code_unique" ON "pmc_site_activities" USING btree ("project_id","code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_site_activities_tenant_project_idx" ON "pmc_site_activities" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_site_links_activity_code_unique" ON "pmc_site_activity_links" USING btree ("site_activity_id","activity_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_site_links_tenant_project_idx" ON "pmc_site_activity_links" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_site_events_tenant_project_idx" ON "pmc_site_cell_events" USING btree ("tenant_id","project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_site_events_cell_idx" ON "pmc_site_cell_events" USING btree ("cell_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_site_cells_unit_activity_unique" ON "pmc_site_cells" USING btree ("unit_id","site_activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_site_cells_tenant_project_status_idx" ON "pmc_site_cells" USING btree ("tenant_id","project_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_units_project_villa_label_unique" ON "pmc_units" USING btree ("project_id","villa_label") WHERE "pmc_units"."villa_label" IS NOT NULL;
--> statement-breakpoint
-- one report per engineer per day AND per contractor (the old sheet held one row per contractor per day): the unique rule only gets wider
DROP INDEX IF EXISTS "site_daily_reports_project_date_preparer_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "site_daily_reports_project_date_preparer_unique" ON "site_daily_reports" USING btree ("project_id","report_date","prepared_by_user_id",coalesce("contractor_id", ''));

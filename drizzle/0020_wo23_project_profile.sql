-- Work order 23, P-17 (D-42 a): a project's profile (location, contract number, the three parties and their logos, working days and hours, report prefix) and the companies taking part
-- in it (one active main contractor at most, any number of subcontractors). Expand-only: two new tables, nothing existing is altered; row-level security, grants and the updated_at
-- trigger come from project_os_apply_conventions(), which the runner calls after this file.
-- Rollback: DROP TABLE "project_companies"; DROP TABLE "project_profiles"; — no older code reads either table, so dropping them loses only the profiles entered since (the logos
-- stay in storage under uploads/{tenant}/{project}/logo/ and can be removed by the sweep). Never part of an automatic rollback: the owner decides, after an export.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_profiles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"location" varchar(255),
	"contract_number" varchar(80),
	"client_name" varchar(255),
	"consultant_name" varchar(255),
	"contractor_name" varchar(255),
	"client_logo_key" varchar(512),
	"consultant_logo_key" varchar(512),
	"contractor_logo_key" varchar(512),
	"work_days" varchar(7) DEFAULT '01234' NOT NULL,
	"work_start" time,
	"work_end" time,
	"report_prefix" varchar(16),
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_profiles_work_days_check" CHECK ("project_profiles"."work_days" ~ '^0?1?2?3?4?5?6?$' AND "project_profiles"."work_days" <> ''),
	CONSTRAINT "project_profiles_work_hours_check" CHECK (("project_profiles"."work_start" IS NULL) = ("project_profiles"."work_end" IS NULL) AND ("project_profiles"."work_start" IS NULL OR "project_profiles"."work_start" < "project_profiles"."work_end")),
	CONSTRAINT "project_profiles_report_prefix_check" CHECK ("project_profiles"."report_prefix" IS NULL OR "project_profiles"."report_prefix" ~ '^[A-Z0-9][A-Z0-9-]{0,15}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_companies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" varchar(8) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_companies_role_check" CHECK ("project_companies"."role" IN ('main', 'sub'))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_companies" ADD CONSTRAINT "project_companies_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_companies" ADD CONSTRAINT "project_companies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_profiles" ADD CONSTRAINT "project_profiles_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_profiles" ADD CONSTRAINT "project_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_profiles" ADD CONSTRAINT "project_profiles_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_companies_one_active_main" ON "project_companies" USING btree ("project_id") WHERE "project_companies"."role" = 'main' AND "project_companies"."active";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_companies_tenant_project_idx" ON "project_companies" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_profiles_tenant_project_unique" ON "project_profiles" USING btree ("tenant_id","project_id");
--> statement-breakpoint
-- the rule «one active main contractor per project» is the index, not a check in code: refuse to finish if it is missing or does not carry its WHERE clause
DO $$ BEGIN
  IF to_regclass('public.project_profiles') IS NULL OR to_regclass('public.project_companies') IS NULL THEN RAISE EXCEPTION '0020: project_profiles or project_companies is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_companies_one_active_main' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%WHERE%') THEN RAISE EXCEPTION '0020: the partial unique index project_companies_one_active_main is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_profiles_tenant_project_unique') THEN RAISE EXCEPTION '0020: project_profiles_tenant_project_unique is missing'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.project_profiles'::regclass AND contype = 'c') < 3 THEN RAISE EXCEPTION '0020: a check constraint of project_profiles is missing'; END IF;
END $$;

-- D-44 (a), P-35: the project's reference lists for the daily report — labour roles (direct / indirect), the equipment on the project with its owner, and what each site
-- activity is measured in with its whole quantity. Expand-only: two new tables, two new columns with a default (no rewrite), one CHECK and one UNIQUE on small tables.
-- Row-level security, grants (column-level UPDATE without id / tenant_id / created_at) and the updated_at trigger come from project_os_apply_conventions(), run after this file.
-- The composite foreign key (owner_company_id, tenant_id, project_id) -> project_companies (id, tenant_id, project_id) makes an owner from another project or company
-- impossible, not merely refused. An activity measured in anything but a villa without a whole quantity is refused by the CHECK.
-- Rollback (no older code reads any of it): DROP TABLE "project_equipment"; DROP TABLE "project_labour_roles";
--   ALTER TABLE "project_companies" DROP CONSTRAINT "project_companies_id_tenant_project_unique";
--   ALTER TABLE "pmc_site_activities" DROP CONSTRAINT "pmc_site_activities_measure_check", DROP COLUMN "total_quantity", DROP COLUMN "measure_unit";
--   — loses only the lists and quantities entered since.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "pmc_site_activities" ADD COLUMN IF NOT EXISTS "measure_unit" varchar(8) DEFAULT 'villa' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pmc_site_activities" ADD COLUMN IF NOT EXISTS "total_quantity" numeric(14, 3);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_site_activities" ADD CONSTRAINT "pmc_site_activities_measure_check" CHECK ("pmc_site_activities"."measure_unit" IN ('villa', 'lm', 'm2', 'piece') AND ("pmc_site_activities"."total_quantity" IS NULL OR "pmc_site_activities"."total_quantity" > 0) AND ("pmc_site_activities"."measure_unit" = 'villa' OR "pmc_site_activities"."total_quantity" IS NOT NULL)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_companies" ADD CONSTRAINT "project_companies_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"); EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_labour_roles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(8) NOT NULL,
	"default_key" varchar(64),
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_labour_roles_category_check" CHECK ("project_labour_roles"."category" IN ('direct', 'indirect'))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_labour_roles" ADD CONSTRAINT "project_labour_roles_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_labour_roles" ADD CONSTRAINT "project_labour_roles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_labour_roles_project_name_unique" ON "project_labour_roles" USING btree ("project_id",lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_labour_roles_project_default_unique" ON "project_labour_roles" USING btree ("project_id","default_key") WHERE "project_labour_roles"."default_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_labour_roles_tenant_project_idx" ON "project_labour_roles" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_equipment" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"equipment_type" varchar(120) NOT NULL,
	"model" varchar(120),
	"plate_or_size" varchar(80),
	"owner_company_id" varchar(36),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_owner_same_project_fk" FOREIGN KEY ("owner_company_id","tenant_id","project_id") REFERENCES "public"."project_companies"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_equipment_project_plate_unique" ON "project_equipment" USING btree ("project_id",lower("plate_or_size")) WHERE "project_equipment"."plate_or_size" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_equipment_tenant_project_idx" ON "project_equipment" USING btree ("tenant_id","project_id");
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the measure CHECK, the same-project owner key, and the two "no duplicate" indexes
DO $$ BEGIN
  IF to_regclass('public.project_labour_roles') IS NULL OR to_regclass('public.project_equipment') IS NULL THEN RAISE EXCEPTION '0022: project_labour_roles or project_equipment is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pmc_site_activities_measure_check' AND contype = 'c') THEN RAISE EXCEPTION '0022: the activity measure check is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_equipment_owner_same_project_fk' AND contype = 'f' AND array_length(conkey, 1) = 3) THEN RAISE EXCEPTION '0022: the (owner, company, project) foreign key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_labour_roles_project_name_unique' AND indexdef LIKE '%UNIQUE%lower%') THEN RAISE EXCEPTION '0022: one role name per project is not enforced'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_labour_roles_project_default_unique' AND indexdef LIKE '%UNIQUE%') THEN RAISE EXCEPTION '0022: copying the default roles twice is not prevented'; END IF;
END $$;

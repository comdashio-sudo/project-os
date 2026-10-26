-- Work order 20, smart import: (1) import_source_profiles — a source's column map remembered by name; (2) data_import_sources — the original file an import was read from;
-- (3) smart_reading_usage — the monthly cost of the optional AI reading. All three carry tenant_id, so the convention sweep gives them row-level security and grants.
-- Idempotent on purpose (a fresh database applies the baseline, which already holds all of this, and then this file).
-- Rollback: DROP TABLE smart_reading_usage, data_import_sources, import_source_profiles (no other table is touched).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_source_profiles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"name" varchar(160) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"header_signature" text NOT NULL,
	"column_map_json" text NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_import_sources" (
	"import_id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"source_key" varchar(512) NOT NULL,
	"source_name" varchar(255) NOT NULL,
	"detected_kind" varchar(32) NOT NULL,
	"sheet_name" varchar(160),
	"mapping_json" text NOT NULL,
	"profile_id" varchar(36),
	"merged_cells_filled" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "smart_reading_usage" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"month" varchar(7) NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"estimated_micro_usd" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "import_source_profiles" ADD CONSTRAINT "import_source_profiles_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "import_source_profiles" ADD CONSTRAINT "import_source_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_import_sources" ADD CONSTRAINT "data_import_sources_import_id_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."data_imports"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_import_sources" ADD CONSTRAINT "data_import_sources_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_import_sources" ADD CONSTRAINT "data_import_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "smart_reading_usage" ADD CONSTRAINT "smart_reading_usage_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "import_source_profiles_tenant_name_unique" ON "import_source_profiles" USING btree ("tenant_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_import_sources_tenant_project_idx" ON "data_import_sources" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "smart_reading_usage_tenant_month_unique" ON "smart_reading_usage" USING btree ("tenant_id","month");

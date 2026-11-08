-- Work order 20 (full Primavera P6 import): what a schedule holds besides its activities — calendars, relationships (FS/SS/FF/SF with lag), activity codes (types, values, assignments to activities)
-- and resource assignments with their units and costs — plus the source system's own fields on activities (id, type, calendar, durations, completion, float, constraint).
-- All six tables carry tenant_id (and project_id): the convention sweep gives them row-level security and grants. Idempotent (a fresh database applies the baseline, which already holds all of this, then this file).
-- The new activities columns are mutable: the sweep grants UPDATE on every column except the immutable ones, so nothing to grant here.
-- Rollback: DROP TRIGGER activity_relationships_same_project ON activity_relationships; DROP FUNCTION project_os_activity_relationship_same_project(); DROP TABLE activity_resource_assignments, activity_code_assignments, activity_code_values, activity_code_types, activity_relationships, schedule_calendars; ALTER TABLE activities DROP COLUMN ... (the nine added below). No other table is touched.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "external_id" varchar(40);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "task_type" varchar(24);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "calendar_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "duration_hours" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "remaining_hours" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "percent_complete" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "total_float_hours" numeric(10, 2);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "constraint_type" varchar(24);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "constraint_date" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_calendars" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"external_id" varchar(40) NOT NULL,
	"name" varchar(255) NOT NULL,
	"calendar_type" varchar(40),
	"is_default" boolean DEFAULT false NOT NULL,
	"hours_per_day" numeric(6, 2) DEFAULT '8' NOT NULL,
	"hours_per_week" numeric(6, 2) DEFAULT '40' NOT NULL,
	"definition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_relationships" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"predecessor_activity_id" varchar(36) NOT NULL,
	"successor_activity_id" varchar(36) NOT NULL,
	"relation_type" varchar(2) NOT NULL,
	"lag_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_relationships_type_check" CHECK ("activity_relationships"."relation_type" IN ('FS', 'SS', 'FF', 'SF')),
	CONSTRAINT "activity_relationships_not_self_check" CHECK ("activity_relationships"."predecessor_activity_id" <> "activity_relationships"."successor_activity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_code_types" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"external_id" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"scope" varchar(40),
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_code_values" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"code_type_id" varchar(36) NOT NULL,
	"parent_id" varchar(36),
	"external_id" varchar(40) NOT NULL,
	"short_name" varchar(80) NOT NULL,
	"name" varchar(255) NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_code_assignments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"activity_id" varchar(36) NOT NULL,
	"code_type_id" varchar(36) NOT NULL,
	"code_value_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_resource_assignments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"activity_id" varchar(36) NOT NULL,
	"resource_id" varchar(36) NOT NULL,
	"external_id" varchar(40) NOT NULL,
	"planned_units" numeric(14, 2) DEFAULT '0' NOT NULL,
	"actual_units" numeric(14, 2) DEFAULT '0' NOT NULL,
	"remaining_units" numeric(14, 2) DEFAULT '0' NOT NULL,
	"planned_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"actual_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"remaining_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_assignments" ADD CONSTRAINT "activity_code_assignments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_assignments" ADD CONSTRAINT "activity_code_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_assignments" ADD CONSTRAINT "activity_code_assignments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_assignments" ADD CONSTRAINT "act_code_assign_type_fk" FOREIGN KEY ("code_type_id") REFERENCES "public"."activity_code_types"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_assignments" ADD CONSTRAINT "act_code_assign_value_fk" FOREIGN KEY ("code_value_id") REFERENCES "public"."activity_code_values"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_types" ADD CONSTRAINT "activity_code_types_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_types" ADD CONSTRAINT "activity_code_types_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_values" ADD CONSTRAINT "activity_code_values_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_values" ADD CONSTRAINT "activity_code_values_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_code_values" ADD CONSTRAINT "activity_code_values_code_type_id_activity_code_types_id_fk" FOREIGN KEY ("code_type_id") REFERENCES "public"."activity_code_types"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_relationships" ADD CONSTRAINT "activity_relationships_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_relationships" ADD CONSTRAINT "activity_relationships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_relationships" ADD CONSTRAINT "activity_relationships_predecessor_activity_id_activities_id_fk" FOREIGN KEY ("predecessor_activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_relationships" ADD CONSTRAINT "activity_relationships_successor_activity_id_activities_id_fk" FOREIGN KEY ("successor_activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_resource_assignments" ADD CONSTRAINT "activity_resource_assignments_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_resource_assignments" ADD CONSTRAINT "activity_resource_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_resource_assignments" ADD CONSTRAINT "activity_resource_assignments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "activity_resource_assignments" ADD CONSTRAINT "act_resource_assign_resource_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."project_resources"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_calendars" ADD CONSTRAINT "schedule_calendars_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_calendars" ADD CONSTRAINT "schedule_calendars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_code_assignments_activity_type_unique" ON "activity_code_assignments" USING btree ("activity_id","code_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_code_assignments_value_idx" ON "activity_code_assignments" USING btree ("project_id","code_value_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_code_types_project_external_unique" ON "activity_code_types" USING btree ("project_id","external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_code_values_project_external_unique" ON "activity_code_values" USING btree ("project_id","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_code_values_type_idx" ON "activity_code_values" USING btree ("project_id","code_type_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_relationships_pair_unique" ON "activity_relationships" USING btree ("project_id","predecessor_activity_id","successor_activity_id","relation_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_relationships_successor_idx" ON "activity_relationships" USING btree ("project_id","successor_activity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "activity_resource_assignments_project_external_unique" ON "activity_resource_assignments" USING btree ("project_id","external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_resource_assignments_activity_idx" ON "activity_resource_assignments" USING btree ("project_id","activity_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_calendars_project_external_unique" ON "schedule_calendars" USING btree ("project_id","external_id");
--> statement-breakpoint
-- D-4 (#153): both ends of a schedule link are activities of the row's own project (the foreign keys only say they exist). Same body as drizzle/baseline-security.sql.
CREATE OR REPLACE FUNCTION project_os_activity_relationship_same_project() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT COUNT(*) FROM activities a WHERE a.id IN (NEW.predecessor_activity_id, NEW.successor_activity_id) AND a.project_id = NEW.project_id AND a.tenant_id = NEW.tenant_id) <> 2 THEN
    RAISE EXCEPTION 'ACTIVITY_RELATIONSHIP_CROSS_PROJECT: both activities must belong to project %', NEW.project_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER activity_relationships_same_project BEFORE INSERT OR UPDATE OF predecessor_activity_id, successor_activity_id, project_id, tenant_id ON activity_relationships FOR EACH ROW EXECUTE FUNCTION project_os_activity_relationship_same_project();
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_activity_relationship_same_project() FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'activity_relationships_same_project' AND tgrelid = 'public.activity_relationships'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'activity_relationships_same_project trigger is missing';
  END IF;
END $$;

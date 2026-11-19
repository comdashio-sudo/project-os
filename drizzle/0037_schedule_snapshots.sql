-- Q-23 (P-105..P-107): the live schedule. Each P6 import or update keeps a snapshot of the project's activities as they stood after it — dates, float,
-- completion — in the same transaction (server/scheduleSnapshots.ts), so the live read can show every activity's deviation from the baseline (the project's
-- first snapshot, unless another is marked baseline: one per project, by a partial unique index), the planned-against-actual at the data date, and two updates side by side.
-- Expand-only: two new tables. A snapshot line belongs to a snapshot of the SAME company and project by a composite foreign key.
-- Row-level security and the updated_at trigger come from project_os_apply_conventions(), run after this file; the explicit GRANT below says the intended privileges here too.
-- Rollback (no older code reads them): DROP TABLE "schedule_snapshot_activities"; DROP TABLE "schedule_snapshots";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_snapshot_activities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"snapshot_id" varchar(36) NOT NULL,
	"activity_id" varchar(36) NOT NULL,
	"code" varchar(80) NOT NULL,
	"planned_start_at" timestamp with time zone,
	"planned_finish_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"actual_finish_at" timestamp with time zone,
	"total_float_hours" numeric(10, 2),
	"percent_complete" numeric(5, 2),
	"remaining_hours" numeric(10, 2),
	"status" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schedule_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"import_id" varchar(36),
	"source" varchar(24) NOT NULL,
	"data_date" timestamp with time zone,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"activity_count" integer NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_snapshots_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id")
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_snapshot_activities" ADD CONSTRAINT "schedule_snapshot_activities_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_snapshot_activities" ADD CONSTRAINT "schedule_snapshot_activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_snapshot_activities" ADD CONSTRAINT "schedule_snapshot_activities_snapshot_fk" FOREIGN KEY ("snapshot_id","tenant_id","project_id") REFERENCES "public"."schedule_snapshots"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_snapshots" ADD CONSTRAINT "schedule_snapshots_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_snapshots" ADD CONSTRAINT "schedule_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "schedule_snapshots" ADD CONSTRAINT "schedule_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_snapshot_activities_snapshot_activity_unique" ON "schedule_snapshot_activities" USING btree ("snapshot_id","activity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedule_snapshots_tenant_project_created_idx" ON "schedule_snapshots" USING btree ("tenant_id","project_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_snapshots_one_baseline_per_project" ON "schedule_snapshots" USING btree ("project_id") WHERE "schedule_snapshots"."is_baseline";
--> statement-breakpoint
-- the application role writes a snapshot once and reads it: no UPDATE, no DELETE (a snapshot is the record of what a schedule said on that day); the baseline mark is the one column it may move
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN
    GRANT SELECT, INSERT ON "schedule_snapshots", "schedule_snapshot_activities" TO project_os_app;
    GRANT UPDATE ("is_baseline", "updated_at") ON "schedule_snapshots" TO project_os_app;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schedule_snapshot_activities_snapshot_fk' AND contype = 'f' AND array_length(conkey, 1) = 3) THEN RAISE EXCEPTION '0036: the same-project snapshot key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'schedule_snapshots_one_baseline_per_project') THEN RAISE EXCEPTION '0036: the one-baseline-per-project index is missing'; END IF;
END $$;

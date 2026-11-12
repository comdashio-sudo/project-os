-- Q-10 (d): the project's planned labour histogram (item 8 of the base file, optional) — workers planned per month, optionally per trade. Expand-only: one new table.
-- Row-level security, grants and the updated_at trigger come from project_os_apply_conventions(), run after this file (a tenant_id table is a tenant table).
-- Rollback (no older code reads it): DROP TABLE "project_planned_labour";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_planned_labour" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"month" date NOT NULL,
	"trade" varchar(80) DEFAULT '' NOT NULL,
	"workers" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_planned_labour_workers_check" CHECK ("project_planned_labour"."workers" >= 0 AND "project_planned_labour"."workers" <= 1000000)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_planned_labour" ADD CONSTRAINT "project_planned_labour_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "project_planned_labour" ADD CONSTRAINT "project_planned_labour_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_planned_labour_month_trade_unique" ON "project_planned_labour" USING btree ("tenant_id","project_id","month","trade");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'project_planned_labour_month_trade_unique') THEN RAISE EXCEPTION '0029: the month/trade key of project_planned_labour is missing'; END IF;
END $$;

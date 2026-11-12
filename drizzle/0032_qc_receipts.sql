-- Q-5: the QC engineer's receipt of a villa's activity («received» / «not received»), kept apart from the site's progress so the villa's card shows both.
-- Expand-only: two new tables (the state, one row per villa and activity; and its events: from, to, the date chosen, who, when). Row-level security, grants
-- and the updated_at trigger come from project_os_apply_conventions(), run after this file (tenant_id tables are tenant tables).
-- Rollback (no older code reads them): DROP TABLE "pmc_qc_receipt_events"; DROP TABLE "pmc_qc_receipts";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_qc_receipt_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"receipt_id" varchar(36) NOT NULL,
	"from_received" boolean,
	"to_received" boolean NOT NULL,
	"received_on" date NOT NULL,
	"changed_by_user_id" integer,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pmc_qc_receipts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"unit_id" varchar(36) NOT NULL,
	"activity_definition_id" varchar(36) NOT NULL,
	"received" boolean NOT NULL,
	"received_on" date NOT NULL,
	"updated_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipt_events" ADD CONSTRAINT "pmc_qc_receipt_events_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipt_events" ADD CONSTRAINT "pmc_qc_receipt_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipt_events" ADD CONSTRAINT "pmc_qc_receipt_events_receipt_id_pmc_qc_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."pmc_qc_receipts"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipt_events" ADD CONSTRAINT "pmc_qc_receipt_events_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipts" ADD CONSTRAINT "pmc_qc_receipts_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipts" ADD CONSTRAINT "pmc_qc_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipts" ADD CONSTRAINT "pmc_qc_receipts_unit_id_pmc_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."pmc_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipts" ADD CONSTRAINT "pmc_qc_receipts_activity_fk" FOREIGN KEY ("activity_definition_id") REFERENCES "public"."pmc_activity_definitions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "pmc_qc_receipts" ADD CONSTRAINT "pmc_qc_receipts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_qc_receipt_events_tenant_project_changed_idx" ON "pmc_qc_receipt_events" USING btree ("tenant_id","project_id","changed_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pmc_qc_receipts_unit_activity_unique" ON "pmc_qc_receipts" USING btree ("tenant_id","project_id","unit_id","activity_definition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_qc_receipts_tenant_project_activity_idx" ON "pmc_qc_receipts" USING btree ("tenant_id","project_id","activity_definition_id");

-- Q-43 (P2-06), batch 2: proof of a subcontractor's work without prices (docs/proposals/subcontractor-progress.md §4).
-- Impact: expand-only. Two enum types and two new, empty tables; nothing existing changes. Neither table has a rate, an amount or a contract value: the
-- price is applied only when an approved confirmation is pulled into a certificate (a later batch). A line belongs to a confirmation of the SAME company
-- and project (composite key); its shape (unit × activity × percent, or BOQ item × quantity) is a CHECK.
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (safe while no confirmation was pulled into a certificate — none can be in this batch): DROP TABLE "subcontract_work_confirmation_lines";
--   DROP TABLE "subcontract_work_confirmations"; DROP TYPE "work_confirmation_line_kind", "work_confirmation_status"; and remove the permission
--   project.subcontract.progress.record from role_permissions / permissions only if no custom role was granted it since.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."work_confirmation_line_kind" AS ENUM('unit', 'quantity'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."work_confirmation_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subcontract_work_confirmations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"subcontract_id" varchar(36) NOT NULL,
	"confirmation_number" varchar(60) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "work_confirmation_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" varchar(500),
	"note" varchar(500),
	"prepared_by_user_id" integer NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by_user_id" integer,
	"reviewed_at" timestamp with time zone,
	"certificate_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_confirmations_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id"),
	CONSTRAINT "work_confirmations_period_order" CHECK ("subcontract_work_confirmations"."period_end" >= "subcontract_work_confirmations"."period_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subcontract_work_confirmation_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"confirmation_id" varchar(36) NOT NULL,
	"kind" "work_confirmation_line_kind" NOT NULL,
	"pmc_unit_id" varchar(36),
	"pmc_activity_definition_id" varchar(36),
	"percent" numeric(7, 3),
	"boq_item_id" varchar(36),
	"quantity" numeric(18, 3),
	"corrects_line_id" varchar(36),
	"historical" boolean DEFAULT false NOT NULL,
	"note" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_confirmation_lines_shape" CHECK (("subcontract_work_confirmation_lines"."kind" = 'unit' AND "subcontract_work_confirmation_lines"."pmc_unit_id" IS NOT NULL AND "subcontract_work_confirmation_lines"."pmc_activity_definition_id" IS NOT NULL AND "subcontract_work_confirmation_lines"."percent" IS NOT NULL AND "subcontract_work_confirmation_lines"."boq_item_id" IS NULL AND "subcontract_work_confirmation_lines"."quantity" IS NULL) OR ("subcontract_work_confirmation_lines"."kind" = 'quantity' AND "subcontract_work_confirmation_lines"."boq_item_id" IS NOT NULL AND "subcontract_work_confirmation_lines"."quantity" IS NOT NULL AND "subcontract_work_confirmation_lines"."pmc_unit_id" IS NULL AND "subcontract_work_confirmation_lines"."pmc_activity_definition_id" IS NULL AND "subcontract_work_confirmation_lines"."percent" IS NULL))
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmation_lines" ADD CONSTRAINT "subcontract_work_confirmation_lines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmation_lines" ADD CONSTRAINT "subcontract_work_confirmation_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmation_lines" ADD CONSTRAINT "work_confirmation_lines_unit_fk" FOREIGN KEY ("pmc_unit_id") REFERENCES "public"."pmc_units"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmation_lines" ADD CONSTRAINT "work_confirmation_lines_activity_fk" FOREIGN KEY ("pmc_activity_definition_id") REFERENCES "public"."pmc_activity_definitions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmation_lines" ADD CONSTRAINT "work_confirmation_lines_boq_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmations" ADD CONSTRAINT "subcontract_work_confirmations_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmations" ADD CONSTRAINT "subcontract_work_confirmations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmations" ADD CONSTRAINT "subcontract_work_confirmations_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmations" ADD CONSTRAINT "subcontract_work_confirmations_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmations" ADD CONSTRAINT "work_confirmations_subcontract_fk" FOREIGN KEY ("subcontract_id") REFERENCES "public"."subcontract_contracts"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmations" ADD CONSTRAINT "work_confirmations_certificate_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."subcontract_certificates"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmation_lines" ADD CONSTRAINT "work_confirmation_lines_confirmation_fk" FOREIGN KEY ("confirmation_id","tenant_id","project_id") REFERENCES "public"."subcontract_work_confirmations"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_work_confirmation_lines" ADD CONSTRAINT "work_confirmation_lines_corrects_fk" FOREIGN KEY ("corrects_line_id") REFERENCES "public"."subcontract_work_confirmation_lines"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_confirmation_lines_unit_activity_idx" ON "subcontract_work_confirmation_lines" USING btree ("tenant_id","pmc_unit_id","pmc_activity_definition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_confirmation_lines_boq_idx" ON "subcontract_work_confirmation_lines" USING btree ("tenant_id","boq_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_confirmations_project_number_unique" ON "subcontract_work_confirmations" USING btree ("project_id","confirmation_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_confirmations_tenant_project_subcontract_idx" ON "subcontract_work_confirmations" USING btree ("tenant_id","project_id","subcontract_id");
--> statement-breakpoint
-- refuse to finish without the same-project line key and the line-shape check
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_confirmation_lines_confirmation_fk' AND contype = 'f' AND array_length(conkey, 1) = 3) THEN RAISE EXCEPTION '0037: the same-project line key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_confirmation_lines_shape' AND contype = 'c') THEN RAISE EXCEPTION '0037: the line-shape check is missing'; END IF;
END $$;

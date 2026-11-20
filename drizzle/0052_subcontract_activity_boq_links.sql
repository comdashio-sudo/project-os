-- Q-43 batch 6: how a unit line of a subcontractor's work confirmation is priced — per subcontract, an activity points to the BOQ item it is paid under
-- and the quantity of that item in one villa. The table holds no rate and no amount: the price stays in BOQ and is applied in the certificate code.
-- Impact: expand-only. One new, empty table; nothing existing changes. One link per subcontract × activity; the quantity is positive (CHECK).
-- Row-level security, the updated_at trigger and the column grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads it): DROP TABLE "subcontract_activity_boq_links";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subcontract_activity_boq_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"subcontract_id" varchar(36) NOT NULL,
	"pmc_activity_definition_id" varchar(36) NOT NULL,
	"boq_item_id" varchar(36) NOT NULL,
	"quantity_per_unit" numeric(18, 3) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subcontract_activity_boq_links_quantity_positive" CHECK ("subcontract_activity_boq_links"."quantity_per_unit" > 0)
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_activity_boq_links" ADD CONSTRAINT "subcontract_activity_boq_links_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_activity_boq_links" ADD CONSTRAINT "subcontract_activity_boq_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_activity_boq_links" ADD CONSTRAINT "activity_boq_links_subcontract_fk" FOREIGN KEY ("subcontract_id") REFERENCES "public"."subcontract_contracts"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_activity_boq_links" ADD CONSTRAINT "activity_boq_links_activity_fk" FOREIGN KEY ("pmc_activity_definition_id") REFERENCES "public"."pmc_activity_definitions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_activity_boq_links" ADD CONSTRAINT "activity_boq_links_boq_fk" FOREIGN KEY ("boq_item_id") REFERENCES "public"."boq_items"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subcontract_activity_boq_links" ADD CONSTRAINT "subcontract_activity_boq_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subcontract_activity_boq_links_unique" ON "subcontract_activity_boq_links" USING btree ("subcontract_id","pmc_activity_definition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subcontract_activity_boq_links_tenant_project_idx" ON "subcontract_activity_boq_links" USING btree ("tenant_id","project_id");

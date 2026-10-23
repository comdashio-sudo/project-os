-- Work order 12, item 3: material returns, stock counts, a unit/activity on each issue, and the destination project of a cross-project transfer.
-- For a database that applied an earlier baseline (a database built from the current baseline already has all of this): every statement is re-runnable.

ALTER TABLE "material_issues" ADD COLUMN IF NOT EXISTS "pmc_unit_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "material_issues" ADD COLUMN IF NOT EXISTS "pmc_activity_definition_id" varchar(36);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "material_returns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"material_issue_id" varchar(36) NOT NULL,
	"inventory_transaction_id" varchar(36) NOT NULL,
	"cost_entry_id" varchar(36) NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_cost" numeric(18, 2) NOT NULL,
	"total_cost" numeric(18, 2) NOT NULL,
	"returned_at" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warehouse_inventory_transfers" ADD COLUMN IF NOT EXISTS "destination_project_id" varchar(36);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouse_stocktake_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"stocktake_id" varchar(36) NOT NULL,
	"material_id" varchar(36) NOT NULL,
	"system_quantity" numeric(18, 3) NOT NULL,
	"counted_quantity" numeric(18, 3) NOT NULL,
	"variance" numeric(18, 3) NOT NULL,
	"value_delta" numeric(18, 2),
	"inventory_transaction_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouse_stocktakes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"warehouse_id" varchar(36) NOT NULL,
	"reference" varchar(120),
	"note" varchar(500) NOT NULL,
	"counted_at" timestamp with time zone NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_returns_tenant_id_companies_id_fk') THEN ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_returns_project_id_projects_id_fk') THEN ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_returns_material_issue_id_material_issues_id_fk') THEN ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_material_issue_id_material_issues_id_fk" FOREIGN KEY ("material_issue_id") REFERENCES "public"."material_issues"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_returns_cost_entry_id_cost_entries_id_fk') THEN ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_cost_entry_id_cost_entries_id_fk" FOREIGN KEY ("cost_entry_id") REFERENCES "public"."cost_entries"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_returns_created_by_user_id_users_id_fk') THEN ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_returns_tx_fk') THEN ALTER TABLE "material_returns" ADD CONSTRAINT "material_returns_tx_fk" FOREIGN KEY ("inventory_transaction_id") REFERENCES "public"."warehouse_inventory_transactions"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stocktake_lines_tenant_id_companies_id_fk') THEN ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "warehouse_stocktake_lines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stocktake_lines_project_id_projects_id_fk') THEN ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "warehouse_stocktake_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stocktake_lines_material_id_material_masters_id_fk') THEN ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "warehouse_stocktake_lines_material_id_material_masters_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wh_stocktake_lines_stocktake_fk') THEN ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "wh_stocktake_lines_stocktake_fk" FOREIGN KEY ("stocktake_id") REFERENCES "public"."warehouse_stocktakes"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wh_stocktake_lines_tx_fk') THEN ALTER TABLE "warehouse_stocktake_lines" ADD CONSTRAINT "wh_stocktake_lines_tx_fk" FOREIGN KEY ("inventory_transaction_id") REFERENCES "public"."warehouse_inventory_transactions"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stocktakes_tenant_id_companies_id_fk') THEN ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stocktakes_project_id_projects_id_fk') THEN ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stocktakes_warehouse_id_project_warehouses_id_fk') THEN ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_warehouse_id_project_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."project_warehouses"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_stocktakes_created_by_user_id_users_id_fk') THEN ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "material_returns_tx_unique" ON "material_returns" USING btree ("inventory_transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "material_returns_cost_unique" ON "material_returns" USING btree ("cost_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_returns_issue_idx" ON "material_returns" USING btree ("material_issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_returns_tenant_project_idx" ON "material_returns" USING btree ("tenant_id","project_id","returned_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "warehouse_stocktake_lines_material_unique" ON "warehouse_stocktake_lines" USING btree ("stocktake_id","material_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_stocktake_lines_tenant_project_idx" ON "warehouse_stocktake_lines" USING btree ("tenant_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_stocktakes_tenant_project_idx" ON "warehouse_stocktakes" USING btree ("tenant_id","project_id","counted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouse_stocktakes_warehouse_idx" ON "warehouse_stocktakes" USING btree ("warehouse_id");

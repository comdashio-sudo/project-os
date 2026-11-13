-- G-104 (D-32 part 2): the stocktake document. One warehouse; when the count opens, the system quantity of every material on that shelf is copied to a line;
-- the counter records what is really there; approving it — by someone other than the person who opened it — posts one adjustment per material that differs,
-- in the same transaction as the approval and its audit row (server/stocktakes.ts). Expand-only: one enum and two new tables, nothing existing changes.
-- A line belongs to a stocktake of the SAME company and project by a composite foreign key.
-- Row-level security, the updated_at trigger and the column-level grants come from project_os_apply_conventions(), run after this file; the explicit GRANTs below say the
-- intended privileges of the application role in this file as well (the sweep re-applies the same set).
-- Rollback (no older code reads any of it): DROP TABLE "stocktake_lines"; DROP TABLE "stocktakes"; DROP TYPE "stocktakes_status";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."stocktakes_status" AS ENUM('counting', 'approved'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stocktakes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"warehouse_id" varchar(36) NOT NULL,
	"stocktake_number" varchar(60) NOT NULL,
	"status" "stocktakes_status" DEFAULT 'counting' NOT NULL,
	"note" varchar(500),
	"approval_reason" varchar(500),
	"created_by_user_id" integer NOT NULL,
	"approved_by_user_id" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stocktakes_id_tenant_project_unique" UNIQUE("id","tenant_id","project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stocktake_lines" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"stocktake_id" varchar(36) NOT NULL,
	"material_id" varchar(36) NOT NULL,
	"system_quantity" numeric(18, 3) NOT NULL,
	"counted_quantity" numeric(18, 3),
	"adjustment_transaction_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_warehouse_id_project_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."project_warehouses"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stocktakes_project_number_unique" ON "stocktakes" USING btree ("project_id","stocktake_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stocktakes_tenant_project_idx" ON "stocktakes" USING btree ("tenant_id","project_id");
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_material_id_material_masters_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_masters"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_stocktake_fk" FOREIGN KEY ("stocktake_id","tenant_id","project_id") REFERENCES "public"."stocktakes"("id","tenant_id","project_id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stocktake_lines_stocktake_material_unique" ON "stocktake_lines" USING btree ("stocktake_id","material_id");
--> statement-breakpoint
-- the application role's privileges, said here explicitly (only where the role exists); the conventions sweep that runs after this file applies the same set and
-- enables row-level security with the tenant-and-project policies. No DELETE: a stocktake and its lines stay as the record of the count.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_os_app') THEN
    GRANT SELECT, INSERT ON "stocktakes", "stocktake_lines" TO project_os_app;
    GRANT UPDATE ("status", "approval_reason", "approved_by_user_id", "approved_at", "updated_at") ON "stocktakes" TO project_os_app;
    GRANT UPDATE ("counted_quantity", "adjustment_transaction_id", "updated_at") ON "stocktake_lines" TO project_os_app;
  END IF;
END $$;
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the same-project line key and one line per material
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_lines_stocktake_fk' AND contype = 'f' AND array_length(conkey, 1) = 3) THEN RAISE EXCEPTION '0035: the same-project line key is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'stocktake_lines_stocktake_material_unique') THEN RAISE EXCEPTION '0035: the one-line-per-material index is missing'; END IF;
END $$;

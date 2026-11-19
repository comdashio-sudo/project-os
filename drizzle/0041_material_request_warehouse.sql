-- Q-42 (P2-04, adviser 18-11): a material request from the site may name the warehouse it should be issued from and the subcontract it is for
-- (docs/proposals/future-mr.md §3.1). Both are optional and a preference only: the issue still chooses its warehouse, and nothing is reserved or
-- deducted until the issue. Expand-only: two nullable columns, their foreign keys and one index; nothing existing changes and no older code reads them.
-- Row-level security and the column-level grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads them): DROP INDEX "prq_tenant_project_warehouse_required_idx";
--   ALTER TABLE "procurement_requisitions" DROP COLUMN "subcontract_id"; ALTER TABLE "procurement_requisitions" DROP COLUMN "warehouse_id";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD COLUMN IF NOT EXISTS "warehouse_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "procurement_requisitions" ADD COLUMN IF NOT EXISTS "subcontract_id" varchar(36);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_warehouse_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."project_warehouses"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "procurement_requisitions" ADD CONSTRAINT "prq_subcontract_fk" FOREIGN KEY ("subcontract_id") REFERENCES "public"."subcontract_contracts"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prq_tenant_project_warehouse_required_idx" ON "procurement_requisitions" USING btree ("tenant_id","project_id","warehouse_id","required_at");

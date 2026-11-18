-- Q-44 (adviser 18-11): «undo the last save» for a QC receipt batch. Each event of a batch now carries the batch's id, so the batch can be found and reversed
-- by a NEW save (nothing is deleted). Expand-only: one nullable column and one index on pmc_qc_receipt_events; events written before have no id and are
-- never undone. The column is written once at insert and never changed: the convention function's column-level grants follow the table's rules (events are
-- append-only for the application, no UPDATE path writes them).
-- Rollback (no older code reads it): DROP INDEX "pmc_qc_receipt_events_batch_idx"; ALTER TABLE "pmc_qc_receipt_events" DROP COLUMN "batch_id";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "pmc_qc_receipt_events" ADD COLUMN IF NOT EXISTS "batch_id" varchar(36);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pmc_qc_receipt_events_batch_idx" ON "pmc_qc_receipt_events" USING btree ("tenant_id","project_id","batch_id") WHERE "pmc_qc_receipt_events"."batch_id" IS NOT NULL;

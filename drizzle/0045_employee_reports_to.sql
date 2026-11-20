-- Q-17 (205-5, G-147): a manager sees the performance of the people who report to them directly, and no one else's. That needs the reporting line: each
-- employee may name one direct manager, another employee of the SAME company (the server refuses another company's employee, oneself and a loop:
-- server/db.ts setEmployeeManagerForTenant). Expand-only: one nullable column and its index; nothing existing changes and no older code reads it.
-- Row-level security and the column-level grants come from project_os_apply_conventions(), run after this file.
-- Rollback (no older code reads it): DROP INDEX "employees_tenant_reports_to_idx"; ALTER TABLE "employees" DROP COLUMN "reports_to_employee_id";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "reports_to_employee_id" varchar(36);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "employees" ADD CONSTRAINT "employees_reports_to_employee_id_employees_id_fk" FOREIGN KEY ("reports_to_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_tenant_reports_to_idx" ON "employees" USING btree ("tenant_id","reports_to_employee_id");

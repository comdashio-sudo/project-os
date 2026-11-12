-- Q-12 part 1 (b): a company's own logo, shown on «My companies». One nullable column, expand-only: no older code reads it. The column is writable by the application role
-- through project_os_apply_conventions() (run after this file), like every non-immutable column.
-- Rollback: ALTER TABLE "companies" DROP COLUMN "logo_key";
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "logo_key" varchar(512);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'logo_key') THEN RAISE EXCEPTION '0028: companies.logo_key is missing'; END IF;
END $$;

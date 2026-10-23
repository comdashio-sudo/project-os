-- Riyal in V1 (owner decision, 22 Oct 2026). The baseline already builds these six tables with SAR as the default. This migration
-- applies the same change to any database built from an earlier baseline, and pins the currency to SAR with a CHECK on each table.
--
-- The DO block refuses to run if any of the six tables holds a row whose currency is not SAR. Nothing is converted here: a row in
-- another currency would be a real amount in the wrong unit, so it stops the migration instead of being rewritten silently.
-- The owner has stated there is no real data yet (the new database starts empty), so the block is expected to pass.

DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['change_requests', 'claims', 'commitments', 'contracts', 'project_resources', 'projects'] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE currency IS DISTINCT FROM ''SAR''', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'currency_sar: % row(s) in % are not SAR; this migration does not convert amounts', n, t;
    END IF;
  END LOOP;
END
$$;
--> statement-breakpoint
ALTER TABLE "change_requests" ALTER COLUMN "currency" SET DEFAULT 'SAR';
--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "currency" SET DEFAULT 'SAR';
--> statement-breakpoint
ALTER TABLE "commitments" ALTER COLUMN "currency" SET DEFAULT 'SAR';
--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "currency" SET DEFAULT 'SAR';
--> statement-breakpoint
ALTER TABLE "project_resources" ALTER COLUMN "currency" SET DEFAULT 'SAR';
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "currency" SET DEFAULT 'SAR';
--> statement-breakpoint
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_currency_sar" CHECK ("currency" = 'SAR');
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_currency_sar" CHECK ("currency" = 'SAR');
--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_currency_sar" CHECK ("currency" = 'SAR');
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_currency_sar" CHECK ("currency" = 'SAR');
--> statement-breakpoint
ALTER TABLE "project_resources" ADD CONSTRAINT "project_resources_currency_sar" CHECK ("currency" = 'SAR');
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_currency_sar" CHECK ("currency" = 'SAR');

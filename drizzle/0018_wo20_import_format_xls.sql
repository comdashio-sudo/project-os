-- Work order 20: the legacy Excel format (.xls) is a source format the import record can name (a Primavera «update activities» export arrives that way).
-- Adding a value to an enum is idempotent with IF NOT EXISTS and touches no row. The value is not used in this transaction.
-- Rollback: none needed (an unused enum value is harmless); removing one requires recreating the type.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TYPE "public"."data_imports_source_format" ADD VALUE IF NOT EXISTS 'xls';

-- D-79 (P-85): file storage inside the database for files up to 5 MB, used automatically when the S3 variables are absent (server/dbStorage.ts, the same interface as
-- server/storage.ts, so the screens do not change and a later move to S3 is a copy, not a code change). Expand-only: one new table.
-- Row-level security and the grants (project_os_app only; no anon, no PUBLIC) come from project_os_apply_conventions(), which the runner calls after this file: the
-- table carries tenant_id, so a company sees and writes only its own files. The CHECKs make a file over 5 MB, a size that is not the stored length, and a key whose
-- company segment is not the row's company, impossible (so the key's UPDATE grant from the conventions cannot move a file to another company's prefix).
-- The first free number when this was written (0023 is D-81). Requests still open may take 0024 too: whoever merges second renumbers.
-- Rollback: DROP TABLE "stored_files"; — only after copying the rows to S3 if any file must be kept (no other table references it).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stored_files" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(36) NOT NULL,
	"key" varchar(1024) NOT NULL,
	"content_type" varchar(255) DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stored_files_size_check" CHECK ("stored_files"."size" >= 0 AND "stored_files"."size" <= 5242880 AND octet_length("stored_files"."data") = "stored_files"."size"),
	CONSTRAINT "stored_files_key_owner_check" CHECK (split_part("stored_files"."key", '/', 2) = "stored_files"."tenant_id")
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_tenant_id_companies_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stored_files_key_unique" ON "stored_files" USING btree ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stored_files_tenant_idx" ON "stored_files" USING btree ("tenant_id");
--> statement-breakpoint
-- refuse to finish without what the rules stand on: the size CHECK and one row per key
DO $$ BEGIN
  IF to_regclass('public.stored_files') IS NULL THEN RAISE EXCEPTION '0024: stored_files is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stored_files_size_check' AND contype = 'c') THEN RAISE EXCEPTION '0024: the 5 MB size check is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stored_files_key_owner_check' AND contype = 'c') THEN RAISE EXCEPTION '0024: the key-owner check is missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'stored_files_key_unique' AND indexdef LIKE '%UNIQUE%') THEN RAISE EXCEPTION '0024: one row per key is not enforced'; END IF;
END $$;

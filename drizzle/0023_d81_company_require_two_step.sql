-- D-81 (owner's decision 2026-11-09, in his words: «لا أريد الدخول برمزين، فقط رمز دخول واحد يكفي»): two-step verification is optional and OFF by default for every role,
-- the platform owner and company administrators included. A company that wants it for its members switches it on in its administration screen; companies.require_two_step holds that choice.
-- Expand-only: two columns with a constant default (PostgreSQL 11+ stores it in the catalog, no table rewrite), so each ACCESS EXCLUSIVE lock is held for milliseconds.
-- A person may also switch it on for himself from his profile: user_mfa.required_by_self. Every enrolment made while the second step was compulsory (before D-81) reads false,
-- so nobody who once enrolled is asked for a second code until he chooses to be.
-- Every existing company and enrolment reads false: nobody is asked for a second code. Both columns are writable by the application role through
-- project_os_apply_conventions(), which the runner calls after this file (it grants UPDATE per writable column).
-- Rollback: ALTER TABLE "user_mfa" DROP COLUMN "required_by_self"; ALTER TABLE "companies" DROP COLUMN "require_two_step"; — the code that reads them treats a missing
-- column as "not required" (server/mfa.ts), so rolling back never locks anyone out; the owner can also lift any requirement at once with MFA_ENFORCEMENT=off.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "require_two_step" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_mfa" ADD COLUMN IF NOT EXISTS "required_by_self" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- refuse to finish without what the rule stands on: the column, NOT NULL, default false
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'require_two_step'
                   AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION '0023: companies.require_two_step is missing, nullable, or not false by default';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_mfa' AND column_name = 'required_by_self'
                   AND data_type = 'boolean' AND is_nullable = 'NO' AND column_default = 'false') THEN
    RAISE EXCEPTION '0023: user_mfa.required_by_self is missing, nullable, or not false by default';
  END IF;
  IF EXISTS (SELECT 1 FROM "user_mfa" WHERE "required_by_self") THEN RAISE EXCEPTION '0023: an earlier enrolment asks for a second code right after the column was added'; END IF;
  IF EXISTS (SELECT 1 FROM "companies" WHERE "require_two_step") THEN RAISE EXCEPTION '0023: a company requires two-step verification right after the column was added'; END IF;
END $$;

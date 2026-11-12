-- Q-12 (c): an invitation e-mail goes to an address that may have no account yet. The outbox gains the address (recipient_email) and the kind membership_invitation, and a row may
-- carry the address instead of a user; a CHECK keeps one of the two always present. Expand-only for every existing row (each already has a user). The invitation link is never
-- written: the row is a record that the mail was sent (or why not), with the link withheld; the token itself exists only in memory and in the invitee's mailbox.
-- Rollback (no older code writes a row without a user): DELETE FROM "email_outbox" WHERE "recipient_user_id" IS NULL; ALTER TABLE "email_outbox" DROP CONSTRAINT "email_outbox_recipient_check",
--   DROP COLUMN "recipient_email", ALTER COLUMN "recipient_user_id" SET NOT NULL; (the enum value stays: PostgreSQL cannot drop one, and no row would carry it)
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TYPE "public"."email_outbox_kind" ADD VALUE IF NOT EXISTS 'membership_invitation';
--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN IF NOT EXISTS "recipient_email" varchar(320);
--> statement-breakpoint
ALTER TABLE "email_outbox" ALTER COLUMN "recipient_user_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_recipient_check" CHECK ("email_outbox"."recipient_user_id" IS NOT NULL OR "email_outbox"."recipient_email" IS NOT NULL); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_outbox_recipient_check') THEN RAISE EXCEPTION '0030: the outbox recipient check is missing'; END IF;
END $$;

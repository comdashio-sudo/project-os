-- Work order 20, item 7 (owner's decision 2026-10-25): a session is idle-limited to 24 hours and capped at 14 days. last_seen_at is the idle clock.
-- Idempotent on purpose (a fresh database applies the baseline, which already holds the column, and then this file). Rollback: ALTER TABLE auth_sessions DROP COLUMN last_seen_at;
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;

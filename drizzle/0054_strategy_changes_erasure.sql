-- I57 (the adviser's decision, 26-11 05:30, option (a)): erasing a company's data failed for any company that had approved one strategy assumption, because the
-- change history strategy_assumption_changes refuses DELETE for every role (0047) and the erasure (server/tenantData.ts) keeps only audit_logs. The history stays
-- append-only in normal running; the one removal allowed is the company's own erasure: inside the erasure's transaction, which sets
-- project_os.erasing_tenant (SET LOCAL, so it ends with that transaction) to that company, for that company's rows only, and only once the company has been
-- frozen (not active; as the meeting minutes allow their removal, 0039). UPDATE and TRUNCATE stay refused always; audit_logs is untouched.
-- Impact: one function added, the DELETE trigger replaced by one that calls it (renamed so the readiness check can see it); no data read or written.
-- Rollback (written, not run): DROP TRIGGER strategy_assumption_changes_delete_on_erasure ON strategy_assumption_changes;
--   CREATE TRIGGER strategy_assumption_changes_refuse_delete BEFORE DELETE ON strategy_assumption_changes FOR EACH ROW EXECUTE FUNCTION project_os_append_only_refuse();
--   ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_refuse_delete; DROP FUNCTION project_os_strategy_changes_delete_guard();
--   — after which erasing a company with an approved assumption fails again (the reason for this file).
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_strategy_changes_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- the one removal: the company's own erasure, inside its transaction (the flag is transaction-local), for that company's rows, after its freeze
  IF current_setting('project_os.erasing_tenant', true) IS NOT DISTINCT FROM OLD.tenant_id
     AND EXISTS (SELECT 1 FROM companies c WHERE c.id = OLD.tenant_id AND c.status <> 'active') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only: % is refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION project_os_strategy_changes_delete_guard() FROM PUBLIC;
--> statement-breakpoint
DROP TRIGGER IF EXISTS strategy_assumption_changes_refuse_delete ON strategy_assumption_changes;
--> statement-breakpoint
CREATE OR REPLACE TRIGGER strategy_assumption_changes_delete_on_erasure BEFORE DELETE ON strategy_assumption_changes FOR EACH ROW EXECUTE FUNCTION project_os_strategy_changes_delete_guard();
--> statement-breakpoint
ALTER TABLE strategy_assumption_changes ENABLE ALWAYS TRIGGER strategy_assumption_changes_delete_on_erasure;
--> statement-breakpoint
-- refuse to finish without the three guards, each set to fire always (UPDATE and TRUNCATE still on the plain refusal)
DO $$ BEGIN
  IF (SELECT COUNT(*) FROM pg_trigger WHERE tgrelid = 'strategy_assumption_changes'::regclass AND tgname IN ('strategy_assumption_changes_refuse_update', 'strategy_assumption_changes_refuse_truncate', 'strategy_assumption_changes_delete_on_erasure') AND tgenabled = 'A') <> 3 THEN RAISE EXCEPTION '0054: the append-only triggers are missing'; END IF;
END $$;

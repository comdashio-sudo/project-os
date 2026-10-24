-- Work order 14, item 3. For a database that applied an earlier baseline; every statement can run again.
--   1. consultant_submittals takes the design-coordination submittals (design_submittals is merged into it, its rows copied first and counted, then the old table is dropped),
--      and learns who it was sent to (`consultant`) so the register can show the answers per consultant.
--   2. tenant_policies gets the NCR rule (`ncr_acceptance_mode`, default block) and project_os_cell_qc_accepted() honours it.
-- Rollback plan for the merge (the only destructive part): the data is in consultant_submittals under submittal_type = 'shop_drawing' AND discipline IS NOT NULL;
-- re-creating design_submittals from the 0000 baseline of the previous release and running the reverse of the INSERT below (status 'sent' back to 'submitted',
-- sent_at/sent_by_user_id back to submitted_at/submitted_by_user_id) restores it without loss.

ALTER TABLE "consultant_submittals" ADD COLUMN IF NOT EXISTS "consultant" varchar(160);
--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD COLUMN IF NOT EXISTS "discipline" varchar(24);
--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD COLUMN IF NOT EXISTS "drawing_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "consultant_submittals" ADD COLUMN IF NOT EXISTS "resubmission_of_id" varchar(36);
--> statement-breakpoint
ALTER TABLE "consultant_submittals" ALTER COLUMN "reply_note" TYPE text;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "consultant_submittals" ADD CONSTRAINT "consultant_submittals_drawing_id_design_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE "tenant_policies" ADD COLUMN IF NOT EXISTS "ncr_acceptance_mode" "tenant_policies_mode" DEFAULT 'block' NOT NULL;
--> statement-breakpoint
DO $$
DECLARE source_rows integer; missing integer;
BEGIN
  IF to_regclass('public.design_submittals') IS NULL THEN RETURN; END IF;
  EXECUTE 'SELECT count(*) FROM public.design_submittals' INTO source_rows;
  EXECUTE $copy$
    INSERT INTO consultant_submittals (id, tenant_id, project_id, submittal_type, submittal_number, revision, title, status, sent_at, due_at, replied_at, reply_code, reply_note,
      discipline, drawing_id, resubmission_of_id, created_by_user_id, sent_by_user_id, replied_by_user_id, created_at, updated_at)
    SELECT id, tenant_id, project_id, 'shop_drawing', submittal_number, 0, title, (CASE status::text WHEN 'submitted' THEN 'sent' ELSE status::text END)::consultant_submittals_status,
      submitted_at, due_at, replied_at, reply_code::text, reply_note, discipline::text, drawing_id, resubmission_of_id, created_by_user_id, submitted_by_user_id, replied_by_user_id, created_at, created_at
    FROM design_submittals
    ON CONFLICT (id) DO NOTHING
  $copy$;
  EXECUTE 'SELECT count(*) FROM public.design_submittals d WHERE NOT EXISTS (SELECT 1 FROM consultant_submittals c WHERE c.id = d.id)' INTO missing;
  IF missing <> 0 THEN RAISE EXCEPTION 'design_submittals merge: % of % rows did not arrive in consultant_submittals; nothing was dropped', missing, source_rows; END IF;
  EXECUTE 'DROP TABLE public.design_submittals';
END $$;
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."design_submittals_discipline";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."design_submittals_reply_code";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."design_submittals_status";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION project_os_cell_qc_accepted(p_unit varchar, p_activity varchar) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT r.response_code::text = ANY (string_to_array(COALESCE((SELECT p.qc_accepted_codes FROM tenant_policies p WHERE p.tenant_id = r.tenant_id), 'A,B'), ','))
       -- work order 14: while the company's NCR rule is "block" (its default) an open NCR on this unit and activity means the inspection does not count
       AND NOT (
         COALESCE((SELECT p.ncr_acceptance_mode::text FROM tenant_policies p WHERE p.tenant_id = r.tenant_id), 'block') = 'block'
         AND EXISTS (SELECT 1 FROM ncrs n WHERE n.tenant_id = r.tenant_id AND n.pmc_unit_id = p_unit AND n.pmc_activity_definition_id = p_activity AND n.status NOT IN ('closed', 'cancelled'))
       )
      FROM pmc_inspection_requests r
      JOIN pmc_inspection_request_units u ON u.inspection_request_id = r.id
     WHERE u.unit_id = p_unit AND r.activity_definition_id = p_activity AND r.response_code IS NOT NULL
     ORDER BY r.requested_at DESC, r.created_at DESC
     LIMIT 1), false)
$$;

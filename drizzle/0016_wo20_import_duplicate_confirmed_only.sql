-- The same file is refused only when an earlier copy of it was CONFIRMED (importing or completed). A rejected or unconfirmed analysis wrote nothing, so it must not block
-- uploading the file again (the owner's 2234-21.xer: the first attempt was refused with 14 errors and wrote no row, yet the second upload was refused as "already imported").
-- Expand-only: the unique rule gets narrower, nothing the previous release does can fail because of it.
-- Rollback: recreate the index with WHERE status <> 'failed' (it can only succeed while no two non-failed attempts share a hash).
DROP INDEX IF EXISTS data_imports_tenant_file_hash_unique;
CREATE UNIQUE INDEX data_imports_tenant_file_hash_unique ON data_imports (tenant_id, file_hash) WHERE status IN ('confirmed', 'importing', 'completed');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'data_imports' AND indexname = 'data_imports_tenant_file_hash_unique' AND indexdef LIKE '%confirmed%importing%completed%') THEN
    RAISE EXCEPTION 'data_imports_tenant_file_hash_unique was not rebuilt as the confirmed-only rule';
  END IF;
END $$;

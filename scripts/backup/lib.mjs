// Pure helpers of the daily backup (scripts/backup/backup.mjs): what "the same data" means, and when a dump is too small to be believed. No I/O here, so every
// branch is tested without a database (server/dailyBackup.test.ts).

/** PostgreSQL's server_version_num (170004) -> 17. pg_dump must be at least as new as the server it reads (an older one refuses, or worse, writes a dump the newer server's features break). */
export const majorOf = versionNum => Math.floor(Number(versionNum) / 10000);

/**
 * Compares the exact row counts read from the source in the snapshot the dump was taken in (`source`) with the counts read from the database the dump was restored into
 * (`restored`). Both are { "schema.table": number }. A table that is missing, or whose count differs, is a restore that did NOT reproduce the data.
 */
export function compareCounts(source, restored) {
  const missing = [], different = [];
  for (const [table, count] of Object.entries(source)) {
    if (!(table in restored)) missing.push(table);
    else if (Number(restored[table]) !== Number(count)) different.push({ table, source: Number(count), restored: Number(restored[table]) });
  }
  const extra = Object.keys(restored).filter(table => !(table in source));
  return { ok: missing.length === 0 && different.length === 0, missing, different, extra, tables: Object.keys(source).length, rows: Object.values(source).reduce((sum, count) => sum + Number(count), 0) };
}

/** A dump smaller than the floor is a failed dump that exited 0 (an empty schema list, a revoked privilege, a pooler that closed early). */
export const dumpIsSuspicious = ({ bytes, floor }) => !Number.isFinite(bytes) || bytes < floor;

/** The TABLE DATA entries of `pg_restore --list` output: one per table the dump will fill. */
export function tableDataEntries(listing) {
  return listing.split("\n").filter(line => /\sTABLE DATA\s/.test(line)).map(line => line.replace(/^.*\sTABLE DATA\s+/, "").trim().split(/\s+/).slice(0, 2).join("."));
}

/** The names of the secrets a run needs and does not have. Values are never inspected beyond "present", never printed. */
export const missingSecrets = (env, names) => names.filter(name => !String(env[name] ?? "").trim());

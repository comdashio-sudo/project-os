// A change to the database structure must arrive with a migration (work order 14, item 3).
//   node scripts/check-schema-migration.mjs <base-ref>      files changed by `git diff <base-ref>...HEAD`
// The structure lives in drizzle/schema.ts and is written out as drizzle/0000_baseline.sql (+ drizzle/baseline-security.sql). A database that already exists is brought
// forward only by a numbered migration (drizzle/0001_… and up), so a baseline that changed without one is a structure change that no existing database will ever receive.
// A change to schema.ts alone (a comment, a type) does not change the baseline and is allowed; `pnpm db:baseline:check` already fails when the two disagree.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const BASELINE_FILES = ["drizzle/0000_baseline.sql", "drizzle/baseline-security.sql"];
const MIGRATION = /^drizzle\/(?!0000_)\d{4}_[a-z0-9_]+\.sql$/;

/** @param {string[]} changed repo-relative paths added or modified */
export function decide(changed) {
  const baselineChanged = changed.filter(file => BASELINE_FILES.includes(file));
  const migrations = changed.filter(file => MIGRATION.test(file));
  if (!baselineChanged.length) return { ok: true, reason: "the baseline did not change", migrations };
  if (migrations.length) return { ok: true, reason: "the baseline changed and a migration came with it", migrations };
  return { ok: false, reason: `${baselineChanged.join(", ")} changed but no migration (drizzle/0001_… and up) was added or changed: an existing database would never receive this change`, migrations };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const base = process.argv[2];
  if (!base) { console.error("usage: node scripts/check-schema-migration.mjs <base-ref>"); process.exit(2); }
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
  const verdict = decide(changed);
  console.log(JSON.stringify({ checkedAgainst: base, changedFiles: changed.length, ...verdict }));
  process.exit(verdict.ok ? 0 : 1);
}

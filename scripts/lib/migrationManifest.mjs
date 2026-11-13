// D-24: every numbered migration with the SHA-256 of its content, in drizzle/MANIFEST.json. A migration that has reached production must never be edited
// (a database that already ran it would never see the change); the manifest makes such an edit fail the build instead of passing silently.
// drizzle/0000_baseline.sql is not listed: it is regenerated from drizzle/schema.ts by design and has its own check (scripts/build-baseline.mjs --check).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MANIFEST_NOTE = "D-24: each numbered migration and the SHA-256 of its content. Never change a hash here to make a check pass: a migration that reached production is not edited — write a new one. `pnpm db:manifest` only ADDS a new migration.";

/** The numbered migrations after the baseline, by file name, with the SHA-256 of their bytes. */
export function hashMigrations(dir) {
  return Object.fromEntries(readdirSync(dir).filter(name => /^\d{4}_.*\.sql$/.test(name) && !name.startsWith("0000_")).sort()
    .map(name => [name, createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")]));
}

/** What differs between the manifest and the files: an edited migration, a new one not listed yet, or a listed one whose file is gone. */
export function compareManifest(listed, actual) {
  const problems = [];
  for (const [name, hash] of Object.entries(listed)) {
    if (!(name in actual)) problems.push({ code: "FILE_GONE", name });
    else if (actual[name] !== hash) problems.push({ code: "EDITED", name });
  }
  for (const name of Object.keys(actual)) if (!(name in listed)) problems.push({ code: "NOT_LISTED", name });
  return problems;
}

export const describeProblem = problem => ({
  EDITED: `${problem.name} was edited after it was listed. A migration that reached production is never edited: put the change in a new migration (and restore this one).`,
  NOT_LISTED: `${problem.name} is not in drizzle/MANIFEST.json yet: run \`pnpm db:manifest\` to add it.`,
  FILE_GONE: `${problem.name} is listed in drizzle/MANIFEST.json but its file is gone. A migration that reached production is never removed.`,
}[problem.code]);

export function readManifest(path) {
  return JSON.parse(readFileSync(path, "utf8")).migrations ?? {};
}

/** Adds the migrations not listed yet; never changes or removes an entry that is there. Returns the names added. */
export function addNewMigrations(dir, path) {
  const listed = (() => { try { return readManifest(path); } catch { return {}; } })();
  const actual = hashMigrations(dir);
  const added = Object.keys(actual).filter(name => !(name in listed));
  const migrations = { ...listed };
  for (const name of added) migrations[name] = actual[name];
  const ordered = Object.fromEntries(Object.keys(migrations).sort().map(name => [name, migrations[name]]));
  writeFileSync(path, `${JSON.stringify({ note: MANIFEST_NOTE, migrations: ordered }, null, 2)}\n`);
  return added;
}

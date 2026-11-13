// D-24: `pnpm db:manifest` adds each new numbered migration to drizzle/MANIFEST.json (it never changes an entry that is there);
// `node scripts/migration-manifest.mjs --check` fails when a listed migration was edited or removed, or a new one is not listed.
import { join } from "node:path";
import { addNewMigrations, compareManifest, describeProblem, hashMigrations, readManifest } from "./lib/migrationManifest.mjs";

const dir = join(new URL("..", import.meta.url).pathname, "drizzle");
const manifest = join(dir, "MANIFEST.json");
if (process.argv.includes("--check")) {
  const problems = compareManifest(readManifest(manifest), hashMigrations(dir));
  for (const problem of problems) console.error(describeProblem(problem));
  if (problems.length) process.exit(1);
  console.log(`drizzle/MANIFEST.json matches the ${Object.keys(hashMigrations(dir)).length} numbered migrations`);
} else {
  const added = addNewMigrations(dir, manifest);
  console.log(added.length ? `added to drizzle/MANIFEST.json: ${added.join(", ")}` : "drizzle/MANIFEST.json already lists every migration");
}

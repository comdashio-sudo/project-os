// D-24 (#185): drizzle/MANIFEST.json lists every numbered migration with the SHA-256 of its content, and the build fails when one that is listed was edited
// or removed, or a new one is not listed yet. This test is part of `pnpm test`, so every pull request runs it (and `pnpm db:baseline:check` runs the same check).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error a plain .mjs module shared with the scripts
import { addNewMigrations, compareManifest, describeProblem, hashMigrations, readManifest } from "../../scripts/lib/migrationManifest.mjs";

const drizzle = path.resolve(import.meta.dirname, "../../drizzle");
type Problem = { code: string; name: string };
let scratch: string | null = null;
afterEach(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); scratch = null; });
const folder = (files: Record<string, string>) => { scratch = mkdtempSync(path.join(tmpdir(), "manifest-")); for (const [name, body] of Object.entries(files)) writeFileSync(path.join(scratch, name), body); return scratch; };

describe("migration manifest (D-24)", () => {
  it("lists every numbered migration of the repository with the hash of its content, and nothing else", () => {
    const problems: Problem[] = compareManifest(readManifest(path.join(drizzle, "MANIFEST.json")), hashMigrations(drizzle));
    expect(problems.map(problem => describeProblem(problem))).toEqual([]);
    expect(Object.keys(readManifest(path.join(drizzle, "MANIFEST.json")))).not.toContain("0000_baseline.sql");
  });

  it("NEGATIVE: an edited migration, a new one not listed, and a listed one whose file is gone are each named", () => {
    const dir = folder({ "0000_baseline.sql": "base", "0001_a.sql": "select 1;", "0002_b.sql": "select 2;" });
    const manifest = path.join(dir, "MANIFEST.json");
    expect(addNewMigrations(dir, manifest)).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(compareManifest(readManifest(manifest), hashMigrations(dir))).toEqual([]);
    writeFileSync(path.join(dir, "0001_a.sql"), "select 1; -- edited after it shipped");
    writeFileSync(path.join(dir, "0003_c.sql"), "select 3;");
    rmSync(path.join(dir, "0002_b.sql"));
    const problems: Problem[] = compareManifest(readManifest(manifest), hashMigrations(dir));
    expect(problems).toEqual([{ code: "EDITED", name: "0001_a.sql" }, { code: "FILE_GONE", name: "0002_b.sql" }, { code: "NOT_LISTED", name: "0003_c.sql" }]);
    expect(describeProblem(problems[0])).toContain("never edited");
  });

  it("adding new migrations never changes an entry that is there (an edit cannot be «fixed» by re-running it)", () => {
    const dir = folder({ "0001_a.sql": "select 1;" });
    const manifest = path.join(dir, "MANIFEST.json");
    addNewMigrations(dir, manifest);
    const before = readManifest(manifest)["0001_a.sql"];
    writeFileSync(path.join(dir, "0001_a.sql"), "select 'edited';");
    writeFileSync(path.join(dir, "0002_b.sql"), "select 2;");
    expect(addNewMigrations(dir, manifest)).toEqual(["0002_b.sql"]);
    expect(readManifest(manifest)["0001_a.sql"]).toBe(before);
    expect(compareManifest(readManifest(manifest), hashMigrations(dir))).toEqual([{ code: "EDITED", name: "0001_a.sql" }]);
  });
});

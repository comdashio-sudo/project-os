import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error a plain .mjs script: it has no type declarations
import { decide } from "../scripts/check-schema-migration.mjs";

describe("a structure change must come with a migration", () => {
  it("passes when nothing in the structure changed, including a change to schema.ts alone", () => {
    expect(decide(["server/db.ts", "client/src/App.tsx"]).ok).toBe(true);
    expect(decide(["drizzle/schema.ts"]).ok).toBe(true);
  });
  it("fails when the baseline changed and no numbered migration came with it — for either baseline file", () => {
    for (const file of ["drizzle/0000_baseline.sql", "drizzle/baseline-security.sql"]) {
      const verdict = decide([file, "drizzle/schema.ts"]);
      expect(verdict.ok, file).toBe(false);
      expect(verdict.reason).toContain(file);
    }
  });
  it("passes when a migration (0001 and up) is added or changed with the baseline", () => {
    expect(decide(["drizzle/0000_baseline.sql", "drizzle/0005_new_thing.sql"]).ok).toBe(true);
    expect(decide(["drizzle/baseline-security.sql", "drizzle/0012_guard.sql"]).ok).toBe(true);
  });
  it("does not count the baseline itself, or a file that is not a migration, as the migration", () => {
    expect(decide(["drizzle/0000_baseline.sql", "drizzle/meta/_journal.json", "drizzle/notes.sql"]).ok).toBe(false);
  });
  it("the script exits 1 on a real git history that changes the baseline alone, and 0 once a migration is added", () => {
    const run = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
    const dir = execFileSync("mktemp", ["-d"], { encoding: "utf8" }).trim();
    run(dir, "init", "-q", "-b", "main");
    run(dir, "config", "user.email", "t@example.test"); run(dir, "config", "user.name", "t");
    execFileSync("mkdir", ["-p", `${dir}/drizzle`]);
    execFileSync("sh", ["-c", `echo a > ${dir}/drizzle/0000_baseline.sql && echo s > ${dir}/drizzle/baseline-security.sql`]);
    run(dir, "add", "-A"); run(dir, "commit", "-qm", "base");
    run(dir, "checkout", "-q", "-b", "change");
    execFileSync("sh", ["-c", `echo b >> ${dir}/drizzle/0000_baseline.sql`]);
    run(dir, "commit", "-qam", "baseline only");
    const script = `${__dirname}/../scripts/check-schema-migration.mjs`;
    const exit = (): number => { try { execFileSync("node", [script, "main"], { cwd: dir, stdio: "pipe" }); return 0; } catch (error) { return (error as { status?: number }).status ?? -1; } };
    expect(exit()).toBe(1);
    execFileSync("sh", ["-c", `echo m > ${dir}/drizzle/0001_x.sql`]);
    run(dir, "add", "-A"); run(dir, "commit", "-qm", "with migration");
    expect(exit()).toBe(0);
  });
});

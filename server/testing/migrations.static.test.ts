import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A migration that parses but cannot run on a fresh database is invisible to every other test (they run against a database someone already built).
// These checks need no database; the build-from-nothing proof is scripts/setup-integration-test-db.mjs, which the database suite starts with.
const dir = path.resolve(import.meta.dirname, "../../drizzle");
const files = readdirSync(dir).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort();

/** Remove dollar-quoted bodies (functions, DO blocks), string literals and comments so a ';' inside them does not count. */
function stripLiterals(sql: string) {
  return sql
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "$$$$")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

describe("drizzle migrations build from an empty database", () => {
  it("are numbered without gaps, and the baseline is the first", () => {
    files.forEach((name, index) => expect(name.slice(0, 4)).toBe(String(index).padStart(4, "0")));
    expect(files[0]).toBe("0000_baseline.sql");
  });

  for (const name of files) {
    const raw = readFileSync(path.join(dir, name), "utf8");
    const chunks = raw.split("--> statement-breakpoint").map(chunk => chunk.trim()).filter(Boolean);

    it(`${name}: every breakpoint chunk is exactly one statement`, () => {
      const offenders = chunks.filter(chunk => /;\s*\S/.test(stripLiterals(chunk)));
      expect(offenders.map(chunk => chunk.slice(0, 80))).toEqual([]);
    });

    it(`${name}: no identifier is longer than 63 characters (PostgreSQL would truncate it silently, and two truncated names can collide)`, () => {
      const identifiers = [...stripLiterals(raw).matchAll(/"([^"]+)"/g)].map(match => match[1]);
      expect(identifiers.filter(id => id.length > 63)).toEqual([]);
    });
  }

  it("the baseline carries what the second layer of isolation and the audit trail stand on", () => {
    const baseline = readFileSync(path.join(dir, "0000_baseline.sql"), "utf8");
    for (const needed of ["CREATE FUNCTION project_os_apply_conventions()", "CREATE FUNCTION app_tenant_ids()", "audit_logs_refuse_update", "audit_logs_refuse_delete", "audit_logs_refuse_truncate", "ENABLE ALWAYS TRIGGER", "SELECT project_os_apply_conventions();"]) expect(baseline, needed).toContain(needed);
    expect(baseline).not.toMatch(/CREATE TABLE "login_codes"|ENGINE=|AUTO_INCREMENT|`/);
  });

  it("0000_baseline.sql is exactly what drizzle/schema.ts and drizzle/baseline-security.sql produce (run `pnpm db:baseline` after editing either)", () => {
    const result = spawnSync(process.execPath, ["scripts/build-baseline.mjs", "--check"], { cwd: path.resolve(dir, ".."), encoding: "utf8", timeout: 120_000 });
    expect(result.stderr + result.stdout).toContain("matches");
    expect(result.status).toBe(0);
  }, 150_000);
});

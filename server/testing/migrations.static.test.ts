import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A migration that parses but cannot run on a fresh database is invisible to
// every other test (they run against a database someone already built). These
// are the two defects that actually broke a from-scratch build (0038, 0049);
// the checks need no database.
const dir = path.resolve(import.meta.dirname, "../../drizzle");
const files = readdirSync(dir).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort();

/** Remove string literals and comments so a ';' inside a default value does not count. */
function stripLiterals(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

describe("drizzle migrations build from an empty database", () => {
  it("are numbered without gaps", () => {
    files.forEach((name, index) => expect(name.slice(0, 4)).toBe(String(index).padStart(4, "0")));
  });

  for (const name of files) {
    const raw = readFileSync(path.join(dir, name), "utf8");
    const chunks = raw.split("--> statement-breakpoint").map(chunk => chunk.trim()).filter(Boolean);

    it(`${name}: every breakpoint chunk is exactly one statement`, () => {
      const offenders = chunks.filter(chunk => /;\s*\S/.test(stripLiterals(chunk)));
      expect(offenders.map(chunk => chunk.slice(0, 80))).toEqual([]);
    });

    it(`${name}: no identifier is longer than 64 characters`, () => {
      const identifiers = [...stripLiterals(raw).matchAll(/`([^`]+)`/g)].map(match => match[1]);
      expect(identifiers.filter(id => id.length > 64)).toEqual([]);
    });
  }
});

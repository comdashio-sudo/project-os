/** @vitest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// G-100, the part that can be enforced by machine: no screen may read a tRPC query and never look at its failure. Before this check, 22 queries
// were read that way, so a failed source looked exactly like an empty one (a supplier picker with no suppliers, a catalog with no materials, a
// "not an administrator" message for a server that simply did not answer). A new query that forgets fails here by name.
const dirs = [join(__dirname), join(__dirname, "..", "components")];
const files = dirs.flatMap(dir => readdirSync(dir).filter(name => /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)).map(name => ({ name, source: readFileSync(join(dir, name), "utf8") })));

describe("a failed data source is never mistaken for an empty one", () => {
  it("scans the screens and components (the scan is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(60);
    expect(files.flatMap(({ source }) => Array.from(source.matchAll(/const\s+\w+\s*=\s*trpc\.[\w.]+\.useQuery\(/g))).length).toBeGreaterThan(60);
  });

  it("every query that is kept has its failure read (.error, .isError, .status) or handed to SourceNotice / SectionMessage", () => {
    const unread: string[] = [];
    for (const { name, source } of files) for (const match of Array.from(source.matchAll(/const\s+(\w+)\s*=\s*trpc\.[\w.]+\.useQuery\(/g))) {
      const id = match[1];
      if (!new RegExp(`\\b${id}\\.(error|isError|status)\\b|query=\\{${id}\\}`).test(source)) unread.push(`${name}: ${id}`);
    }
    expect(unread).toEqual([]);
  });

  it("no query is thrown away after reading its data (`.useQuery(...).data`), because then its failure can never be seen", () => {
    const thrownAway = files.filter(({ source }) => /trpc\.[\w.]+\.useQuery\([^;]*\)\s*\.data\b/.test(source)).map(({ name }) => name);
    expect(thrownAway).toEqual([]);
  });

  it("a destructured query reads its failure too", () => {
    const offenders: string[] = [];
    for (const { name, source } of files) for (const match of Array.from(source.matchAll(/const\s+\{([^}]*)\}\s*=\s*trpc\.[\w.]+\.useQuery\(/g))) if (!/\b(error|isError)\b/.test(match[1])) offenders.push(`${name}: {${match[1].trim()}}`);
    expect(offenders).toEqual([]);
  });
});

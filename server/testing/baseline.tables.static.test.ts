import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// One test per table of the baseline, without a database. `project_os_apply_conventions()` raises when a table is not classified for isolation, but only at
// migration time and as one message for the whole sweep; here each table fails by name in the plain unit run, so a new table with no `tenant_id` and no place
// in the global / child lists is caught by `pnpm test`, not by the first migration against a database.
const root = join(__dirname, "..", "..", "drizzle");
const baseline = readFileSync(join(root, "0000_baseline.sql"), "utf8");
const security = readFileSync(join(root, "baseline-security.sql"), "utf8");

const tables = Array.from(baseline.matchAll(/CREATE TABLE "(\w+)" \(([\s\S]*?)\n\);/g)).map(match => ({ name: match[1], body: match[2] }));
const globalTables = new Set(Array.from((/global_tables constant text\[\] := ARRAY\[([^\]]*)\]/.exec(security)?.[1] ?? "").matchAll(/'(\w+)'/g)).map(match => match[1]));
const childTables = new Map(Array.from(security.matchAll(/"(\w+)":\s*\["(\w+)",\s*"(\w+)"\]/g)).map(match => [match[1], { column: match[2], parent: match[3] }] as const));
const byName = new Map(tables.map(table => [table.name, table]));

describe("the baseline's tables, one by one", () => {
  it("finds the tables (the scan is not vacuous) and the lists the sweep reads", () => {
    expect(tables.length).toBeGreaterThan(110);
    expect(globalTables.size).toBeGreaterThan(5);
    expect(childTables.size).toBeGreaterThan(3);
  });

  it.each(tables.map(table => [table.name]))("%s reaches a company: it has its own tenant_id, or is a listed global table, or a listed child of a table that does (or is `companies`, its own tenant)", name => {
    const table = byName.get(name)!;
    const ownTenant = /"tenant_id"\s+varchar/.test(table.body);
    const child = childTables.get(name);
    const viaParent = child ? byName.has(child.parent) && new RegExp(`"${child.column}"\\s+varchar`).test(table.body) && (/"tenant_id"\s+varchar/.test(byName.get(child.parent)!.body)) : false;
    expect(ownTenant || name === "companies" || globalTables.has(name) || viaParent, `${name} is not classified for row-level isolation`).toBe(true);
  });

  it.each(tables.map(table => [table.name]))("%s has a primary key", name => {
    expect(byName.get(name)!.body, `${name} has no primary key`).toMatch(/PRIMARY KEY|CONSTRAINT "[\w]+" PRIMARY KEY/);
  });

  it("lists no table that does not exist (a renamed table would otherwise leave a stale global or child entry)", () => {
    const stale = [...Array.from(globalTables), ...Array.from(childTables.keys()), ...Array.from(childTables.values()).map(entry => entry.parent)].filter(name => !byName.has(name));
    expect(stale).toEqual([]);
  });
});

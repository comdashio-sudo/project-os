import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// V1 money is in the Saudi riyal only (owner decision, 22 Oct 2026). These checks read the source and the migration text, with no database:
// the default on the six tables that carry a currency, the CHECK that pins them to SAR, and that the migration converts nothing.
// The database suite proves the migration on a real build from nothing.
const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");
const schema = read("drizzle", "schema.ts");
const baseline = read("drizzle", "0000_baseline.sql");
const migration = read("drizzle", "0001_currency_sar.sql");

const SIX = ["change_requests", "claims", "commitments", "contracts", "project_resources", "projects"];

// schema.ts: each table is one `export const x = pgTable(` declaration; its table name is the first quoted string after the call.
const blocks = schema.split(/\nexport const /).slice(1).map(block => ({ name: /pgTable\(\s*"(\w+)"/.exec(block)?.[1] ?? "", body: block }));
const tableBlock = (name: string) => blocks.find(block => block.name === name)?.body ?? "";

describe("riyal-only currency: the six tables", () => {
  it.each(SIX)("%s defaults to SAR in drizzle/schema.ts", name => {
    expect(tableBlock(name), `${name} is declared in schema.ts`).not.toBe("");
    expect(tableBlock(name)).toMatch(/currency: varchar\("currency", \{ length: 3 \}\)\.default\("SAR"\)\.notNull\(\)/);
  });

  it("no table in schema.ts still defaults to USD", () => {
    expect(schema).not.toContain('default("USD")');
    expect(baseline).not.toContain("DEFAULT 'USD'");
  });

  it.each(SIX)("%s is built with SAR as the default in the baseline", name => {
    const create = new RegExp(`CREATE TABLE "${name}" \\(([\\s\\S]*?)\\n\\);`).exec(baseline)?.[1] ?? "";
    expect(create, `${name} is created in the baseline`).not.toBe("");
    expect(create).toContain(`"currency" varchar(3) DEFAULT 'SAR' NOT NULL`);
  });

  it.each(SIX)("%s gets the SAR default and a CHECK in the migration", name => {
    expect(migration).toContain(`ALTER TABLE "${name}" ALTER COLUMN "currency" SET DEFAULT 'SAR';`);
    expect(migration).toContain(`ALTER TABLE "${name}" ADD CONSTRAINT "${name}_currency_sar" CHECK ("currency" = 'SAR');`);
  });

  it("the migration constrains exactly the six tables, and no other", () => {
    const constrained = Array.from(migration.matchAll(/ADD CONSTRAINT "(\w+)_currency_sar" CHECK \("currency" = 'SAR'\)/g)).map(match => match[1]);
    expect(constrained.sort()).toEqual([...SIX].sort());
    const defaulted = Array.from(migration.matchAll(/ALTER TABLE "(\w+)" ALTER COLUMN "currency" SET DEFAULT 'SAR'/g)).map(match => match[1]);
    expect(defaulted.sort()).toEqual([...SIX].sort());
  });

  it("the migration refuses to run over a non-SAR row in any of the six, and names the six it checks", () => {
    const list = /ARRAY\[([^\]]*)\]/.exec(migration)?.[1] ?? "";
    expect(Array.from(list.matchAll(/'(\w+)'/g)).map(match => match[1]).sort()).toEqual([...SIX].sort());
    expect(migration).toMatch(/IF n > 0 THEN\s+RAISE EXCEPTION/);
    expect(migration).toContain("currency IS DISTINCT FROM ''SAR''");
  });

  it("the migration converts no amount: it has no UPDATE, no DELETE and no DROP", () => {
    expect(migration).not.toMatch(/\bUPDATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\b/i);
    expect(migration).not.toMatch(/\bDROP\b/i);
  });
});

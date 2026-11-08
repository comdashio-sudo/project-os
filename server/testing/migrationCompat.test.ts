import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script shared with CI
import { checkFile } from "../../scripts/ci/check-migration-compat.mjs";

const run = (sql: string) => checkFile("0099_x.sql", sql) as { allowed: boolean; findings: string[] };

describe("migrations must be backward compatible (expand, then contract)", () => {
  it("accepts the additive statements: new table, nullable column, column with a default, new index, loosening", () => {
    expect(run(`CREATE TABLE a (id uuid PRIMARY KEY); ALTER TABLE b ADD COLUMN c text; ALTER TABLE b ADD COLUMN d int NOT NULL DEFAULT 0; CREATE INDEX i ON b (c); ALTER TABLE b ALTER COLUMN c DROP NOT NULL; ALTER TYPE t ADD VALUE IF NOT EXISTS 'x';`).findings).toEqual([]);
  });
  it("refuses each contract step and names it", () => {
    for (const sql of ["DROP TABLE a;", "ALTER TABLE a DROP COLUMN b;", "ALTER TABLE a RENAME COLUMN b TO c;", "ALTER TABLE a RENAME TO z;", "ALTER TABLE a ALTER COLUMN b TYPE bigint;", "ALTER TABLE a ALTER COLUMN b SET NOT NULL;", "ALTER TABLE a ADD COLUMN b text NOT NULL;", "DROP TYPE t;"]) expect(run(sql).findings.length, sql).toBeGreaterThan(0);
  });
  it("a word in a comment or in a string is not a statement", () => {
    expect(run(`-- DROP TABLE a;\nINSERT INTO t VALUES ('DROP COLUMN x'); /* RENAME TO y */`).findings).toEqual([]);
  });
  it("a DROP inside a DO block still counts", () => {
    expect(run(`DO $$ BEGIN ALTER TABLE a DROP COLUMN b; END $$;`).findings.length).toBeGreaterThan(0);
  });
  it("a contract step is allowed only with a stated reason", () => {
    expect(run(`ALTER TABLE a DROP COLUMN b;`).allowed).toBe(false);
    expect(run(`-- contract-ok: release 0018 no longer reads b\nALTER TABLE a DROP COLUMN b;`).allowed).toBe(true);
  });
});

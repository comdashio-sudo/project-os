// D-24 (#185): the database really holds what migrations 0002, 0003, 0004 and 0007 declare. They are re-runnable, so on a database where an object already
// existed in another shape they pass silently; scripts/verify-migration-results.mjs reads every table, column (type and nullability), enum value, index, named
// constraint, function and trigger they declare and asks the catalogue for each. Positive on the test database built from the migrations; negative inside a
// transaction that is rolled back, so nothing is left changed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import pg from "pg";
import { isTestDatabaseUrl } from "./testing/testDatabase";
// @ts-expect-error a plain .mjs module shared with the scripts
import { expectationsOfFiles, verifyExpectations } from "../scripts/lib/migrationExpectations.mjs";

const ownerUrl = process.env.TEST_DATABASE_URL;
type Problem = { migration: string; problem: string };

describe.skipIf(!isTestDatabaseUrl(ownerUrl))("what migrations 0002, 0003, 0004 and 0007 declare is in the database (D-24)", () => {
  let owner: pg.Client;
  const expectations = expectationsOfFiles(path.resolve(import.meta.dirname, "../drizzle"));
  const verify = async (): Promise<Problem[]> => verifyExpectations(async (text: string, params?: unknown[]) => (await owner.query(text, params)).rows, expectations);
  beforeAll(async () => { owner = new pg.Client({ connectionString: ownerUrl }); await owner.connect(); });
  afterAll(async () => { await owner?.end(); });

  it("reads every object the four migrations declare, and the database built from the migrations has each one as declared", async () => {
    const total = expectations.reduce((sum: number, e: Record<string, unknown[]>) => sum + e.tables.length + e.columns.length + e.enums.length + e.indexes.length + e.constraints.length + e.functions.length + e.triggers.length, 0);
    expect(total).toBeGreaterThan(400);
    expect(await verify()).toEqual([]);
  });

  it("NEGATIVE: a column of another type, a missing index, a missing enum value and a missing constraint are each named (in a transaction that is rolled back)", async () => {
    await owner.query("BEGIN");
    try {
      await owner.query("ALTER TABLE material_returns ALTER COLUMN reason TYPE varchar(600)");
      await owner.query("DROP INDEX IF EXISTS material_returns_issue_idx");
      await owner.query("ALTER TABLE webhook_deliveries ALTER COLUMN status DROP DEFAULT");
      await owner.query("ALTER TABLE webhook_deliveries ALTER COLUMN status TYPE text USING status::text");
      await owner.query("DROP TYPE webhook_deliveries_status CASCADE");
      await owner.query("CREATE TYPE webhook_deliveries_status AS ENUM ('pending', 'delivered')");
      await owner.query('ALTER TABLE master_plan_drawings DROP CONSTRAINT "mpd_creator_fk"');
      const problems = (await verify()).map(item => item.problem);
      expect(problems).toEqual(expect.arrayContaining([
        "column material_returns.reason is varchar(600), the migration says varchar(500)",
        "index material_returns_issue_idx is missing",
        "enum webhook_deliveries_status has no value «failed»",
        "constraint mpd_creator_fk is missing",
      ]));
    } finally {
      await owner.query("ROLLBACK");
    }
    expect(await verify()).toEqual([]);
  });
});

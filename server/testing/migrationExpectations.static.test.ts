// D-24: what a migration declares, read from its SQL, and what later migrations changed of it (needs no database).
import { describe, expect, it } from "vitest";
// @ts-expect-error a plain .mjs module shared with the scripts
import { applyLaterChanges, expectationsOf } from "../../scripts/lib/migrationExpectations.mjs";

const first = `CREATE TABLE IF NOT EXISTS "t" (\n\t"id" varchar(36) PRIMARY KEY NOT NULL,\n\t"note" varchar(500),\n\t"amount" numeric(18, 2) NOT NULL,\n\t"gone" text\n);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "t_note_idx" ON "t" USING btree ("note");
DO $$ BEGIN CREATE TYPE "public"."t_status" AS ENUM('a', 'b'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;

describe("migration expectations (D-24)", () => {
  it("reads tables, typed columns with their nullability, indexes and enum values", () => {
    const expected = expectationsOf(first);
    expect(expected.tables).toEqual(["t"]);
    expect(expected.columns).toEqual([
      { table: "t", column: "id", dataType: "character varying", length: 36, notNull: true },
      { table: "t", column: "note", dataType: "character varying", length: 500, notNull: false },
      { table: "t", column: "amount", dataType: "numeric", precision: 18, scale: 2, notNull: true },
      { table: "t", column: "gone", dataType: "text", notNull: false },
    ]);
    expect(expected.indexes).toEqual(["t_note_idx"]);
    expect(expected.enums).toEqual([{ name: "t_status", values: ["a", "b"] }]);
  });

  it("applies what a later migration changed, and ignores a rollback plan written in a comment", () => {
    const expected = applyLaterChanges({ migration: "x", ...expectationsOf(first) }, `ALTER TABLE "t" ALTER COLUMN "note" TYPE text;
ALTER TABLE "t" ALTER COLUMN "amount" DROP NOT NULL;
ALTER TABLE "t" DROP COLUMN "gone";
-- Rollback: DROP TABLE "t"; DROP INDEX "t_note_idx";`);
    expect(expected.tables).toEqual(["t"]);
    expect(expected.indexes).toEqual(["t_note_idx"]);
    expect(expected.columns.find((c: { column: string }) => c.column === "note")).toMatchObject({ dataType: "text", length: undefined });
    expect(expected.columns.find((c: { column: string }) => c.column === "amount")).toMatchObject({ notNull: false });
    expect(expected.columns.some((c: { column: string }) => c.column === "gone")).toBe(false);
  });
});

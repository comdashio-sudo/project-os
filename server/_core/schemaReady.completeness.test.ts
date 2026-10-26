import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_SCHEMA } from "./schemaReady";

// The code that starts a release asks the database whether the migrations it needs are there (/healthz says "schema behind" when not). That list must not fall behind the migrations:
// a migration added without its entry here is exactly the gap that broke sign-in on 2026-10-26. From 0010 on, every migration must be represented.
const dir = path.resolve(import.meta.dirname, "../../drizzle");
const migrations = readdirSync(dir).filter(name => /^\d{4}_.*\.sql$/.test(name)).map(name => name.replace(/\.sql$/, "")).sort();

describe("the schema readiness list covers every migration", () => {
  it("lists each migration from 0010 on, and nothing that does not exist", () => {
    const wanted = migrations.filter(name => Number(name.slice(0, 4)) >= 10);
    const listed = Array.from(new Set(REQUIRED_SCHEMA.map(item => item.migration))).sort();
    expect(listed).toEqual(wanted);
  });
});

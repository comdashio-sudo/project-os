// D-15 (#176): the script that builds the test database drops and re-creates project_os_integration_test, so it must refuse — before it connects to
// anything — a URL that names any other database. Port 1 has nothing listening: a refusal shows as the script's own message and exit 2, while a name it
// accepts goes on to connect and fails on the closed port instead. No database is touched by this test.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const run = (url: string) => spawnSync(process.execPath, ["scripts/setup-integration-test-db.mjs"], {
  env: { PATH: process.env.PATH ?? "", DATABASE_URL: url, PROJECT_OS_APP_DB_PASSWORD: "unused-in-this-test" }, encoding: "utf8", timeout: 20_000,
});

describe("setup-integration-test-db (D-15)", () => {
  it("NEGATIVE: refuses a URL that names another database, with its own message, before any connection", () => {
    for (const name of ["dashio", "project_os", "postgres_prod", "project_os_integration_test_copy"]) {
      const result = run(`postgres://nobody:x@127.0.0.1:1/${name}`);
      expect(result.status, name).toBe(2);
      expect(result.stderr).toContain("Refusing to run");
      expect(result.stderr).toContain(`«${name}»`);
      expect(result.stderr).not.toMatch(/ECONNREFUSED|connect/i);
    }
  });

  it("lets the maintenance database and the test database through the name check (they then meet the closed port, not the refusal)", () => {
    for (const name of ["postgres", "project_os_integration_test"]) {
      const result = run(`postgres://nobody:x@127.0.0.1:1/${name}`);
      expect(result.status, name).not.toBe(0);
      expect(result.stderr, name).not.toContain("Refusing to run");
      expect(`${result.stderr}${result.stdout}`, name).toMatch(/ECONNREFUSED/);
    }
  });

  it("drops only the literal test database, and turns autovacuum off on it (no other drop, no other ALTER)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("scripts/setup-integration-test-db.mjs", "utf8");
    expect(source.match(/DROP DATABASE[^"`]*/g)).toEqual(["DROP DATABASE IF EXISTS project_os_integration_test WITH (FORCE)"]);
    expect(source).toContain("autovacuum_enabled = false");
  });
});

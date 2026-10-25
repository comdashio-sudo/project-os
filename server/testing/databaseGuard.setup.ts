import { beforeAll } from "vitest";
import { assertTestDatabaseUrl } from "./testDatabase";

// Runs before every test file. With no database variables set, nothing
// happens and database tests skip. With any of them set, each one must name
// the test database, or the whole run fails before a single connection opens.
for (const variableName of ["DATABASE_URL", "TEST_DATABASE_URL"] as const) {
  const value = process.env[variableName];
  if (value) assertTestDatabaseUrl(value, variableName);
}

// The tests build companies and accounts through the public procedures as ordinary users; registration is open for them (the closed default is proved by its own tests, which close it again).
process.env.REGISTRATION = process.env.REGISTRATION ?? "open";

// A test that calls a service function directly has no request around it, so no caller's companies are installed: it plays the server's own
// jobs, with every company visible. Anything that goes through a tRPC procedure (the router tests, the HTTP tests) still gets its own caller's
// context from the procedure's middleware, so row-level security is exercised for real wherever a request is simulated.
// TEST_DB_NO_FALLBACK=true removes the fallback: every direct call then sees nothing, which the isolation tests use.
// (Imported inside the hook, not at the top: a test file that replaces the driver with vi.mock must be the first to load the connection module.)
beforeAll(async () => {
  if (process.env.TEST_DB_NO_FALLBACK === "true") return;
  const { useFallbackDbContextForTests } = await import("../_core/database");
  useFallbackDbContextForTests({ userId: null, tenantIds: [], system: true, reason: "test: direct call outside a request" });
});

import { assertTestDatabaseUrl } from "./testDatabase";

// Runs before every test file. With no database variables set, nothing
// happens and database tests skip. With any of them set, each one must name
// the test database, or the whole run fails before a single connection opens.
for (const variableName of ["DATABASE_URL", "TEST_DATABASE_URL"] as const) {
  const value = process.env[variableName];
  if (value) assertTestDatabaseUrl(value, variableName);
}

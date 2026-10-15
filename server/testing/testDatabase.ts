// The only database a test may connect to. Every database test, the vitest
// setup guard and getDb() under vitest check against this name, so a
// production connection string in the environment is refused, not used.
export const INTEGRATION_TEST_DATABASE = "project_os_integration_test";

export function databaseNameFromUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    if (!/^mysql2?:$/.test(url.protocol) || !url.hostname) return null;
    return decodeURIComponent(url.pathname.replace(/^\/+/, "")) || null;
  } catch {
    return null;
  }
}

export function isTestDatabaseUrl(value: string | undefined): boolean {
  return databaseNameFromUrl(value) === INTEGRATION_TEST_DATABASE;
}

// The message names the variable and the database, never the URL: the URL
// carries the credentials.
export function assertTestDatabaseUrl(value: string | undefined, variableName: string): void {
  if (isTestDatabaseUrl(value)) return;
  const databaseName = databaseNameFromUrl(value);
  throw new Error(
    `${variableName} must point at the test database "${INTEGRATION_TEST_DATABASE}"; ` +
      (databaseName ? `it points at "${databaseName}". Refusing to run tests against it.` : "it is not a mysql:// URL with a database name."),
  );
}

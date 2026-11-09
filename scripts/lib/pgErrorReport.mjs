// What a failed database step says about itself, for a log anyone can read (D-69, release run 42525350064). An uncaught pg DatabaseError prints a
// code frame of pg-protocol's parser first and its message last, so the release step that kept the first 200 characters of stderr showed only
// "error" -- five releases failed with no reason given. This turns the error into one JSON line with the fields PostgreSQL sends (SQLSTATE,
// message, detail, hint, where) and the stage that was running. Never a statement (it can carry a password), never a URL, never a secret:
// connection strings are cut out, password=/PGPASSWORD= assignments and the password slot of anything shaped like a URL are blanked even when
// the value is not known, and every value the caller names as secret is replaced, whatever field it appears in.
const FIELDS = ["code", "severity", "message", "detail", "hint", "where", "routine", "schema", "table", "column", "constraint"];
const MAX = 400;

export function redact(text, secrets = []) {
  let out = String(text);
  // the named values first, so a value that contains a quote, a backslash or a space is replaced whole
  for (const secret of secrets) if (secret && secret.length >= 4) out = out.split(secret).join("<secret>");
  // the password slot of anything URL-shaped (scheme://user:password@...), even a malformed one (a space in the host) that a URL parser refuses
  out = out.replace(/([a-z][a-z0-9+.-]*:\/\/[^:/@\s]*:)[^@\n]*@/gi, "$1<secret>@");
  out = out.replace(/\b(?:postgres|postgresql):\/\/[^\s"'`]+/gi, "<connection-url>");
  // key=value forms (libpq connection strings, environment dumps), whether or not the value is known
  out = out.replace(/\b(PGPASSWORD|[A-Z0-9_]*_PASSWORD|password)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"'}]+)/gi, "$1$2<secret>");
  return out;
}

/** Every password the environment of a database script can hold, read without a URL parser (a malformed URL must not throw before the guard). */
export function secretsFromEnvironment(env = process.env) {
  const out = [];
  for (const name of ["PROJECT_OS_APP_DB_PASSWORD", "SUPABASE_DB_PASSWORD", "PGPASSWORD"]) if (env[name]) out.push(env[name]);
  for (const name of ["DATABASE_URL", "AUDIT_APP_DATABASE_URL", "TEST_DATABASE_URL", "TEST_APP_DATABASE_URL"]) {
    const match = /^[a-z][a-z0-9+.-]*:\/\/[^:/@\s]*:([^@]*)@/i.exec(env[name] ?? "");
    if (!match || !match[1]) continue;
    out.push(match[1]);
    try { const decoded = decodeURIComponent(match[1]); if (decoded !== match[1]) out.push(decoded); } catch { /* keep the raw form */ }
  }
  return out;
}

export function describeDatabaseError(error, { stage, secrets = [] } = {}) {
  const report = { stage: stage ?? "unknown" };
  for (const field of FIELDS) {
    const value = error?.[field];
    if (value === undefined || value === null || value === "") continue;
    report[field] = redact(value, secrets).slice(0, MAX);
  }
  if (!report.code) report.code = error?.code ?? error?.name ?? "UNKNOWN";
  if (!report.message) report.message = redact(error?.message ?? String(error), secrets).slice(0, MAX);
  return report;
}

// redacts the VALUES of a parsed report: a password with a quote or a backslash is escaped in JSON text and would not match there
const redactValues = (value, secrets) => {
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value)) return value.map(item => redactValues(item, secrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValues(item, secrets)]));
  return value;
};

/** The reason a child script gave, from its stderr: its last JSON line when it wrote one, otherwise the END of stderr (where Node prints the message), never the start. */
export function failureDetail(stderr, secrets = []) {
  const lines = String(stderr ?? "").split("\n").map(line => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith("{")) continue;
    let parsed;
    try { parsed = JSON.parse(lines[i]); } catch { continue; } // not JSON: keep looking
    return redactValues(parsed, secrets);
  }
  const text = redact(lines.join("\n"), secrets);
  return text.length > MAX ? `…${text.slice(-MAX)}` : text;
}

/** `new URL` on a connection string, for scripts that must not crash with it: a TypeError from a malformed URL carries the whole string (password
 *  included) in `input`, and Node prints that when it is uncaught. Here the failure is one redacted JSON line and exit code 2. */
export function parseDatabaseUrlOrExit(value, { script, secrets = secretsFromEnvironment(process.env) } = {}) {
  try { return new URL(value); } catch (error) {
    console.error(JSON.stringify({ script, ...describeDatabaseError(error, { stage: "parse the connection URL", secrets }) }));
    process.exit(2);
  }
}

// What a failed database step says about itself, for a log anyone can read (D-69, release run 42525350064). An uncaught pg DatabaseError prints a
// code frame of pg-protocol's parser first and its message last, so the release step that kept the first 200 characters of stderr showed only
// "error" -- five releases failed with no reason given. This turns the error into one JSON line with the fields PostgreSQL sends (SQLSTATE,
// message, detail, hint, where) and the stage that was running. Never a statement (it can carry a password), never a URL, never a secret:
// connection strings are cut out and every value the caller names as secret is replaced, whatever field it appears in.
const FIELDS = ["code", "severity", "message", "detail", "hint", "where", "routine", "schema", "table", "column", "constraint"];
const MAX = 400;

export function redact(text, secrets = []) {
  let out = String(text);
  out = out.replace(/\b(?:postgres|postgresql):\/\/[^\s"'`]+/gi, "<connection-url>");
  for (const secret of secrets) if (secret && secret.length >= 4) out = out.split(secret).join("<secret>");
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

/** The reason a child script gave, from its stderr: its last JSON line when it wrote one, otherwise the END of stderr (where Node prints the message), never the start. */
export function failureDetail(stderr, secrets = []) {
  const lines = String(stderr ?? "").split("\n").map(line => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith("{")) continue;
    try { return JSON.parse(redact(lines[i], secrets)); } catch { /* not JSON: keep looking */ }
  }
  const text = redact(lines.join("\n"), secrets);
  return text.length > MAX ? `…${text.slice(-MAX)}` : text;
}

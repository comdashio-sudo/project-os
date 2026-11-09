import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { describeDatabaseError, failureDetail, redact, secretsFromEnvironment } from "../scripts/lib/pgErrorReport.mjs";

// D-69, release run 42525350064: the release log showed only "error" because the step kept the first 200 characters of an uncaught DatabaseError
// (pg-protocol's code frame comes first, the message last). These pin the report that replaces it.
const fakePassword = "fake-app-password-for-this-test-only";

// The shape pg gives a server error: an Error whose name is "error", with PostgreSQL's fields as properties.
const databaseError = (fields: Record<string, string>) => Object.assign(new Error(fields.message), { name: "error", ...fields });

describe("describeDatabaseError: PostgreSQL's own fields, the stage, and no secret", () => {
  it("keeps code, message, detail, hint and where, and names the stage", () => {
    const report = describeDatabaseError(databaseError({ code: "42501", severity: "ERROR", message: "permission denied for function app_system", detail: "d", hint: "h", where: "SQL function \"x\"" }), { stage: "table catalogue" });
    expect(report).toEqual({ stage: "table catalogue", code: "42501", severity: "ERROR", message: "permission denied for function app_system", detail: "d", hint: "h", where: "SQL function \"x\"" });
  });

  it("a plain Error (not from the server) still says what it was", () => {
    expect(describeDatabaseError(new Error("Connected as someone_else"), { stage: "identify the connected role" })).toMatchObject({ stage: "identify the connected role", code: "Error", message: "Connected as someone_else" });
  });

  it("negative: a password or a connection URL in any field never reaches the report", () => {
    const url = `postgres://project_os_app:${fakePassword}@db.example.test:5432/postgres`; // secret-scan:allow: a made-up test value
    const report = describeDatabaseError(databaseError({ code: "28P01", message: `password authentication failed (${url})`, detail: `tried ${fakePassword}` }), { stage: "connect", secrets: [fakePassword] });
    const text = JSON.stringify(report);
    expect(text).not.toContain(fakePassword);
    expect(text).not.toContain("db.example.test");
    expect(report.code).toBe("28P01");
    expect(report.message).toContain("password authentication failed");
  });

  it("redact ignores empty and very short secrets instead of shredding the text", () => {
    expect(redact("error: abc", ["", "a"])).toBe("error: abc");
  });
});

describe("failureDetail: the reason from a child's stderr", () => {
  it("prefers the last JSON line the child wrote", () => {
    const stderr = 'noise\n{"verifyDbSecurity":"ERROR","stage":"connect","code":"28P01","message":"password authentication failed"}\n';
    expect(failureDetail(stderr)).toEqual({ verifyDbSecurity: "ERROR", stage: "connect", code: "28P01", message: "password authentication failed" });
  });

  it("without JSON keeps the END of an uncaught error (where Node prints the message), not the code frame at the start", () => {
    const frame = "/x/node_modules/pg-protocol/src/parser.ts:395\n      : new DatabaseError(messageValue, LATEINIT_LENGTH, name)\n        ^\n\n";
    const stderr = `${frame}error: the real reason is here\n${"    at frame\n".repeat(100)}`;
    const detail = failureDetail(stderr) as string;
    expect(detail.length).toBeLessThanOrEqual(401);
    expect(failureDetail(`${frame}error: the real reason is here\n`)).toContain("the real reason is here");
  });

  it("negative: a secret in stderr is replaced, JSON or not", () => {
    expect(JSON.stringify(failureDetail(`{"message":"bad ${fakePassword}"}`, [fakePassword]))).not.toContain(fakePassword);
    expect(failureDetail(`boom ${fakePassword}`, [fakePassword])).not.toContain(fakePassword);
  });
});

// QA on #226 and the engineering notes: each a negative test.
describe("no password in any output, whatever shape it arrives in", () => {
  const leaked = "Sup3r-S3cret-xyz";

  it("a malformed AUDIT_APP_DATABASE_URL (a space in the host) is reported at stage connect, and the password appears 0 times", () => {
    const env: Record<string, string | undefined> = { ...process.env, AUDIT_APP_DATABASE_URL: `postgres://project_os_app:${leaked}@bad host:5432/x` }; // secret-scan:allow: a made-up test value
    delete env.DATABASE_URL; delete env.TEST_DATABASE_URL; delete env.PROJECT_OS_APP_DB_PASSWORD;
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-db-security.mjs"], { encoding: "utf8", env });
    expect(run.status).toBe(1);
    expect((run.stdout + run.stderr).split(leaked).length - 1).toBe(0);
    expect(JSON.parse(run.stderr.trim().split("\n").at(-1)!)).toMatchObject({ verifyDbSecurity: "ERROR", stage: "connect", code: "ERR_INVALID_URL" });
  }, 60_000);

  it("password=... and PGPASSWORD=... are blanked even when the value is not in the list", () => {
    const out = redact(`host=db.example.test password=${leaked} user=x; PGPASSWORD=${leaked} SUPABASE_DB_PASSWORD="${leaked} two"`);
    expect(out).not.toContain(leaked);
    expect(out).toContain("password=<secret>");
    expect(out).toContain("PGPASSWORD=<secret>");
  });

  it("the password slot of a URL is blanked even when the value is unknown and the URL does not parse", () => {
    expect(redact(`could not connect to mysql://u:${leaked}@bad host/x`)).not.toContain(leaked);
  });

  it("redaction runs on the parsed values: a password with a quote or a backslash, escaped in the JSON text, is still removed", () => {
    const tricky = `pa"ss\\word-${leaked}`;
    const stderr = JSON.stringify({ verifyDbSecurity: "ERROR", message: `failed for ${tricky}` });
    expect(stderr).not.toContain(tricky); // the JSON text holds it escaped, so a text replace would miss it
    const detail = failureDetail(stderr, [tricky]) as { message: string };
    expect(detail.message).toBe("failed for <secret>");
  });

  it("the owner's password from DATABASE_URL is among the secrets predeploy redacts (provisioning connects as the owner)", () => {
    const owner = "Owner-Only-Pass-9f2";
    const secrets = secretsFromEnvironment({ DATABASE_URL: `postgresql://postgres.ref:${owner}@pooler.example.test:5432/postgres`, PROJECT_OS_APP_DB_PASSWORD: "app-password-123" }); // secret-scan:allow: made-up test values
    expect(secrets).toEqual(expect.arrayContaining([owner, "app-password-123"]));
    expect(JSON.stringify(failureDetail(`App role provisioning failed: ${owner}`, secrets))).not.toContain(owner);
    expect(JSON.stringify(failureDetail(`{"reason":"tried ${owner}"}`, secrets))).not.toContain(owner);
  });

  it("predeploy itself: a provisioning failure never prints the owner's password", () => {
    const owner = "Owner-Only-Pass-9f2";
    const env: Record<string, string | undefined> = { ...process.env, DATABASE_URL: `postgres://postgres:${owner}@bad host:5432/project_os_integration_test`, PROJECT_OS_APP_DB_PASSWORD: "app-password-1234567" }; // secret-scan:allow: made-up test values
    delete env.TEST_DATABASE_URL;
    const run = spawnSync(process.execPath, ["scripts/predeploy.mjs"], { encoding: "utf8", env });
    expect(run.status).not.toBe(0);
    expect((run.stdout + run.stderr).split(owner).length - 1).toBe(0);
    expect((run.stdout + run.stderr)).not.toContain("app-password-1234567");
  }, 60_000);

  it("sibling paths: migrate.mjs and provision-app-role.mjs refuse a malformed URL in one redacted line, exit 2", () => {
    const owner = "Owner-Only-Pass-9f2";
    for (const script of ["scripts/migrate.mjs", "scripts/provision-app-role.mjs"]) {
      const env: Record<string, string | undefined> = { ...process.env, DATABASE_URL: `postgres://postgres:${owner}@bad host:5432/x`, PROJECT_OS_APP_DB_PASSWORD: "app-password-1234567" }; // secret-scan:allow: made-up test values
      delete env.TEST_DATABASE_URL;
      const run = spawnSync(process.execPath, [script], { encoding: "utf8", env });
      expect(run.status, script).toBe(2);
      expect((run.stdout + run.stderr).split(owner).length - 1, script).toBe(0);
      expect(run.stderr, script).toContain('"stage":"parse the connection URL"');
    }
  }, 60_000);
});

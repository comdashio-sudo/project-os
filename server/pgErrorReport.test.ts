import { describe, expect, it } from "vitest";
import { describeDatabaseError, failureDetail, redact } from "../scripts/lib/pgErrorReport.mjs";

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

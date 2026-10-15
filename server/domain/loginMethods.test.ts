import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VERIFIED_LOGIN_METHODS } from "./loginMethods";

// G-107: self-signup is open only to a person whose email was proved. That holds because every route that starts a session
// proves it first. The guard sits where those routes meet (`startSession`); a new sign-in method has to be named here,
// and it fails this test until it is added to the verified list on purpose.
const routes = readFileSync(join(__dirname, "..", "_core", "auth", "routes.ts"), "utf8");
const google = readFileSync(join(__dirname, "..", "_core", "auth", "google.ts"), "utf8");

describe("every route that starts a session proves the email address", () => {
  const methods = Array.from(routes.matchAll(/startSession\(req, res, [\w.]+, "(\w+)"/g)).map(match => match[1]);
  it("finds the sign-in routes (the scan is not vacuous) and each one is on the verified list", () => {
    expect(methods.sort()).toEqual(["email", "google"]);
    expect(methods.filter(method => !VERIFIED_LOGIN_METHODS.includes(method))).toEqual([]);
  });
  it("starts a session in exactly one place", () => {
    expect(routes.match(/res\.cookie\(COOKIE_NAME/g)?.length).toBe(1);
  });
  it("accepts a Google identity only when Google says the email is verified, and an email session only after the code check", () => {
    expect(google).toContain('claims.email_verified !== true && claims.email_verified !== "true"');
    expect(routes).toMatch(/await dependencies\.emailCodes\.verifyCode\([^)]*\);\s*await startSession\(req, res, email, "email"\)/);
  });
});

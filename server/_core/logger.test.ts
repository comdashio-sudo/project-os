import { describe, expect, it } from "vitest";
import { captureLogs, formatLog, logError, safePath, scrub } from "./logger";

// Every secret and personal value below is invented. The point of each test is that the value, not just a label, is absent from the output.
const SECRETS = {
  email: "someone.private@example.test",
  // built from parts so the repository's own secret scan does not mistake an invented token for a real one
  jwt: ["eyJhbGciOiJIUzI1NiJ9", "eyJvcGVuSWQiOiJlbWFpbDphYmMifQ", "c2lnbmF0dXJlLXZhbHVlLTEyMw"].join("."),
  password: "Sup3rS3cretPassw0rd",
  url: "postgres://app_user:Sup3rS3cretPassw0rd@gateway.example.test:6543/project_os",
  code: "482913",
  phone: "+966 50 123 4567",
  ip: "203.0.113.77",
  resend: "re_AbCdEf1234567890GhIjKl",
  hex: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
};
const joined = (line: string) => line;
const leaks = (line: string) => Object.entries(SECRETS).filter(([, value]) => line.includes(value)).map(([name]) => name);

describe("scrub", () => {
  it("keeps a UUID whole even when its groups are all digits (a request id is not a phone number), and still removes a phone number beside it", () => {
    const requestId = "c90a4d4b-6692-416b-963f-469084681300";
    const allDigits = "12345678-1234-4123-8123-123456789012";
    expect(scrub(`request ${requestId} and ${allDigits}`)).toBe(`request ${requestId} and ${allDigits}`);
    expect(scrub(`call ${SECRETS.phone} about ${requestId}`)).toBe(`call [number] about ${requestId}`);
  });
  it("removes every kind of secret and personal value", () => {
    // A bare password with no shape cannot be recognised in free text; it is protected by never printing messages, and here it appears where it really travels: inside a URL.
    const { password: _bare, ...recognisable } = SECRETS;
    expect(leaks(scrub(Object.values(recognisable).join(" and ")))).toEqual([]);
  });
  it("leaves ordinary words, codes of our own and plain numbers alone", () => {
    expect(scrub("PROJECT_OS_AUTH_CODE_INVALID on /api/trpc/auth.me status 401 in 12 ms")).toBe("PROJECT_OS_AUTH_CODE_INVALID on /api/trpc/auth.me status 401 in 12 ms");
  });
});

describe("safePath", () => {
  it("drops the query string and the fragment, where codes, tokens and inputs travel", () => {
    expect(safePath(`/api/auth/google/callback?code=${SECRETS.hex}&state=abc#frag`)).toBe("/api/auth/google/callback");
    expect(safePath(`/api/trpc/projects.get?batch=1&input=${encodeURIComponent(JSON.stringify({ email: SECRETS.email }))}`)).toBe("/api/trpc/projects.get");
    expect(safePath(undefined)).toBe("-");
  });
});

describe("formatLog", () => {
  it("prints a driver error's name, code and place but never its message (which holds the statement and the values)", () => {
    const error = Object.assign(new Error(`Failed query: INSERT INTO users VALUES ('${SECRETS.email}', '${SECRETS.password}') duplicate key value violates unique constraint "users_email_unique"`), { code: "23505", table: "users", constraint: "users_email_unique", detail: `Key (email)=(${SECRETS.email}) already exists.` });
    const line = formatLog("error", "trpc", error, { path: "/api/trpc/x" });
    expect(leaks(line)).toEqual([]);
    expect(line).not.toContain("already exists");
    expect(line).not.toContain("INSERT INTO");
    expect(JSON.parse(line)).toMatchObject({ level: "error", event: "trpc", errorName: "Error", errorCode: "23505", table: "users", constraint: "users_email_unique", path: "/api/trpc/x" });
  });

  it("keeps a message that is one of our own project codes, because it is what an engineer needs", () => {
    expect(JSON.parse(formatLog("error", "trpc", new Error("PROJECT_OS_GRN_COMMITMENT_INVALID"))).errorMessage).toBe("PROJECT_OS_GRN_COMMITMENT_INVALID");
  });

  it("scrubs any string a caller puts in the context, and skips empty values", () => {
    const line = formatLog("warn", `event for ${SECRETS.email}`, undefined, { note: `${SECRETS.url} ${SECRETS.jwt}`, empty: undefined, status: 500 });
    expect(leaks(line)).toEqual([]);
    expect(JSON.parse(line)).toMatchObject({ status: 500 });
    expect(JSON.parse(line)).not.toHaveProperty("empty");
  });

  it("prints a few stack frames without the message line and without the directory of the machine", () => {
    const line = formatLog("error", "x", new Error(`boom ${SECRETS.password}`));
    expect(leaks(line)).toEqual([]);
    const { frames } = JSON.parse(line);
    expect(typeof frames).toBe("string");
    expect(frames).not.toContain("/home/");
  });

  it("copes with something that is not an Error", () => {
    expect(JSON.parse(formatLog("error", "x", `plain ${SECRETS.email}`))).toEqual(expect.objectContaining({ errorName: "string" }));
    expect(leaks(formatLog("error", "x", { email: SECRETS.email }))).toEqual([]);
  });

  it("looks at the cause too, by name and code only", () => {
    const line = formatLog("error", "x", new Error("wrapper", { cause: Object.assign(new Error(`inner ${SECRETS.password}`), { code: "ECONNRESET" }) }));
    expect(JSON.parse(line)).toMatchObject({ causeName: "Error", causeCode: "ECONNRESET" });
    expect(leaks(line)).toEqual([]);
  });
});

describe("logError", () => {
  it("writes one JSON line to the sink and the sink can be restored", () => {
    const lines: string[] = [];
    const restore = captureLogs(line => lines.push(joined(line)));
    logError("scheduled.cycle", new Error(`failed for ${SECRETS.email}`), { job: "email" });
    restore();
    expect(lines).toHaveLength(1);
    expect(leaks(lines[0])).toEqual([]);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "scheduled.cycle", job: "email" });
  });
});

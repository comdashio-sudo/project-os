import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Fixtures are assembled at run time so this file never contains a literal
// that looks like a credential, and the scanner passes over its own tests.
const scan = (text: string) => spawnSync(process.execPath, ["scripts/scan-secrets.mjs", "--stdin"], { input: text, encoding: "utf8" });
const fake = (...parts: string[]) => parts.join("");

describe("secret scan", () => {
  it("passes ordinary code, env references and documented placeholders", () => {
    const text = [
      "const url = process.env.DATABASE_URL;",
      "JWT_SECRET=<set in the secret manager>",
      "DATABASE_URL=mysql://user:password@db.example.test:4000/project_os_integration_test",
      "RESEND_API_KEY=your_resend_key_here",
    ].join("\n");
    const result = scan(text);
    expect(result.status).toBe(0);
  });

  it("flags provider keys, private keys, credentialed connection strings and assigned secrets", () => {
    const cases: Array<[string, string]> = [
      ["aws-access-key", fake("AK", "IA", "ABCDEFGHIJKLMNOP")],
      ["private-key-block", fake("-----BEGIN ", "RSA PRIVATE KEY-----")],
      ["github-token", fake("gh", "p_", "a".repeat(36))],
      ["resend-api-key", fake("re", "_", "A".repeat(8), "_", "b".repeat(24))],
      ["credentialed-connection-string", fake("mysql", "://", "someone", ":", "hunter22x", "@", "gateway01.eu-central-1.prod.aws.tidbcloud.com:4000/db")],
      ["assigned-secret-literal", fake("JWT_", "SECRET", "=", "q".repeat(32))],
    ];
    for (const [rule, text] of cases) {
      const result = scan(text);
      expect(result.status, rule).toBe(1);
      expect(result.stderr, rule).toContain(rule);
    }
  });

  it("never prints the matched value", () => {
    const value = "q".repeat(32);
    const result = scan(fake("JWT_", "SECRET", "=", value));
    expect(result.stderr + result.stdout).not.toContain(value);
  });

  it("honours the explicit allow marker", () => {
    const result = scan(fake("JWT_", "SECRET", "=", "q".repeat(32), " // secret-scan:allow fake"));
    expect(result.status).toBe(0);
  });
});

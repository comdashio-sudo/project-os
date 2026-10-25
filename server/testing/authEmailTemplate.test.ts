import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The sign-in message is sent by Supabase Auth through the owner's SMTP; this is the template the launch button puts there (scripts/bootstrap/run.ts reads it).
// What it must be, from the lessons of another platform that put codes in spam and into dead links (docs/TASLEEM_LESSONS.md section 1):
//   a large code, the validity in minutes, ONE button on the platform's own domain, and short text. The e-mail address never appears in a link.
const root = path.resolve(import.meta.dirname, "../..");
const template = readFileSync(path.join(root, "docs/auth-email-templates/otp.html"), "utf8");
const lib = readFileSync(path.join(root, "scripts/bootstrap/lib.ts"), "utf8");

describe("sign-in code e-mail template", () => {
  it("shows the code large", () => {
    expect(template).toMatch(/font-size:\s*(3\d|4\d)px[^"]*">\{\{ \.Token \}\}/);
  });
  it("states the validity the launch button really configures", () => {
    const seconds = Number(lib.match(/mailer_otp_exp:\s*(\d+)/)?.[1]);
    expect(seconds).toBeGreaterThan(0);
    const minutes = seconds / 60;
    expect(template).toContain(`${minutes} دقيقة`);
    expect(template).toContain(`${minutes} minutes`);
  });
  it("has exactly one button, on the platform's own site address, and the address of the person is in no link", () => {
    const anchors = template.match(/<a\s[^>]*>/g) ?? [];
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toContain('href="{{ .SiteURL }}/login?step=code"');
    expect(template).not.toMatch(/href="[^"]*(\.Email|\.NewEmail|@)/);
    expect(template).not.toMatch(/\.ConfirmationURL|\.RedirectTo|\.TokenHash/);
    expect(template.match(/https?:\/\//g) ?? []).toEqual([]); // no other domain at all
  });
  it("tells the person that only the newest code works", () => {
    expect(template).toContain("أحدث رمز يصلك هو الوحيد الذي يعمل");
    expect(template).toContain("only the newest code works");
  });
  it("is short", () => {
    const text = template.replace(/<[^>]+>/g, " ").replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();
    expect(text.length).toBeLessThan(420);
  });
});

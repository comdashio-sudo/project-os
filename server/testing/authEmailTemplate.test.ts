import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The sign-in message is sent by Supabase Auth through the owner's SMTP; this is the template the launch button puts there for Confirm signup AND Magic Link (scripts/bootstrap/run.ts).
// What it must be (docs/TASLEEM_LESSONS.md section 1, and the owner's decision of 2026-10-25): a large code, the validity in minutes, "only the newest code works", "ignore if you did not ask",
// all of it in Arabic and in English, and NO link at all. The sender's domain (dashio.tasleemsa.com) is not the platform's (dashio-lovat.vercel.app), and a button pointing to another
// domain raises the chance of the spam folder; the button returns when the platform has its own domain. Urdu is added later to this same template.
const root = path.resolve(import.meta.dirname, "../..");
const template = readFileSync(path.join(root, "docs/auth-email-templates/otp.html"), "utf8");
const lib = readFileSync(path.join(root, "scripts/bootstrap/lib.ts"), "utf8");
const text = template.replace(/<[^>]+>/g, " ").replace(/\{\{[^}]+\}\}/g, "").replace(/\s+/g, " ").trim();

describe("sign-in code e-mail template", () => {
  it("shows the code large, once", () => {
    expect(template).toMatch(/font-size:\s*(3\d|4\d)px[^"]*">\{\{ \.Token \}\}/);
    expect(template.match(/\{\{ \.Token \}\}/g)).toHaveLength(1);
  });
  it("states the validity the launch button really configures, in both languages", () => {
    const seconds = Number(lib.match(/mailer_otp_exp:\s*(\d+)/)?.[1]);
    expect(seconds).toBeGreaterThan(0);
    const minutes = seconds / 60;
    expect(template).toContain(`${minutes} دقيقة`);
    expect(template).toContain(`${minutes} minutes`);
  });
  it("has no link, no button and no domain at all, and the address of the person appears nowhere", () => {
    expect(template).not.toMatch(/<a[\s>]/i);
    expect(template).not.toMatch(/href\s*=/i);
    expect(template).not.toMatch(/\.SiteURL|\.ConfirmationURL|\.RedirectTo|\.TokenHash|\.Email|\.NewEmail|@/);
    expect(template.match(/https?:\/\//g) ?? []).toEqual([]);
  });
  it("says in Arabic and in English: the code, the validity, only the newest code works, and ignore it if you did not ask", () => {
    for (const phrase of ["رمز الدخول إلى Dashio", "أحدث رمز وحده يعمل", "إن لم تطلب الدخول فتجاهل الرسالة"]) expect(text, phrase).toContain(phrase);
    for (const phrase of ["Your Dashio sign-in code", "Only the newest code works", "If you did not request to sign in, ignore this message"]) expect(text, phrase).toContain(phrase);
  });
  it("is short, and each language sits in a block with its own direction", () => {
    expect(text.length).toBeLessThan(420);
    expect(template.match(/dir="rtl"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(template.match(/dir="ltr"/g)?.length).toBeGreaterThanOrEqual(1);
  });
  it("the subject is bilingual and is the one the launch button writes to both templates", () => {
    expect(lib).toContain('export const OTP_SUBJECT = "رمز الدخول إلى Dashio | Dashio sign-in code"');
    expect(lib).toMatch(/mailer_subjects_confirmation: OTP_SUBJECT, mailer_templates_confirmation_content: template, mailer_subjects_magic_link: OTP_SUBJECT, mailer_templates_magic_link_content: template/);
  });
});

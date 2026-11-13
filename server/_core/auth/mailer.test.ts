// D-22 (#183): a reply-to address from a named variable, and a warning at start when the links in a mail point at a different domain from the one the mail
// comes from — said by variable name only. Synthetic addresses only (*.example.test and made-up names).
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureLogs } from "../logger";
import { createSmtpMailer, mailLinkDomainMismatch, registrableDomain, smtpSettingsFromEnv, warnOnMailLinkDomainMismatch } from "./mailer";

const smtp = { SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "user", SMTP_PASSWORD: "unused-test-value", EMAIL_FROM: "Dashio <noreply@dashio.example.test>" };
const mail = { to: "person@example.test", subject: "s", text: "t", html: "<p>t</p>" };
let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe("reply-to (D-22)", () => {
  it("puts EMAIL_REPLY_TO on every message when it is set", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const settings = smtpSettingsFromEnv({ ...smtp, EMAIL_REPLY_TO: "support@dashio.example.test" })!;
    await createSmtpMailer({ ...settings, transport: { sendMail } }).send(mail);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ from: smtp.EMAIL_FROM, replyTo: "support@dashio.example.test", to: mail.to });
  });

  it("NEGATIVE: without it (or blank) the message has no reply-to at all, not an empty one", async () => {
    for (const env of [smtp, { ...smtp, EMAIL_REPLY_TO: "   " }]) {
      const sendMail = vi.fn().mockResolvedValue({});
      await createSmtpMailer({ ...smtpSettingsFromEnv(env)!, transport: { sendMail } }).send(mail);
      expect(sendMail.mock.calls[0][0]).not.toHaveProperty("replyTo");
    }
  });
});

describe("the links' domain against the sender's (D-22)", () => {
  it("reads the registrable domain, two-part suffixes included", () => {
    expect(registrableDomain("app.dashio.example.test")).toBe("example.test");
    expect(registrableDomain("portal.dashio-example.com.sa")).toBe("dashio-example.com.sa");
    expect(registrableDomain("127.0.0.1")).toBeNull();
  });

  it("is quiet when the links and the sender share a domain (a sub-domain of it included)", () => {
    const lines: string[] = []; restore = captureLogs(line => lines.push(line));
    for (const env of [
      { APP_BASE_URL: "https://app.dashio.example.test", EMAIL_FROM: "Dashio <noreply@dashio.example.test>" },
      { APP_BASE_URL: "https://portal.dashio-example.com.sa/", EMAIL_FROM: "noreply@mail.dashio-example.com.sa" },
    ]) {
      expect(mailLinkDomainMismatch(env)).toBe(false);
      expect(warnOnMailLinkDomainMismatch(env)).toBe(false);
    }
    expect(lines).toEqual([]);
  });

  it("NEGATIVE: warns once when they differ, by variable name, and prints neither value", () => {
    const lines: string[] = []; restore = captureLogs(line => lines.push(line));
    const env = { APP_BASE_URL: "https://app.dashio.example.test", EMAIL_FROM: "Dashio <noreply@other-sender.test>" };
    expect(mailLinkDomainMismatch(env)).toBe(true);
    expect(warnOnMailLinkDomainMismatch(env)).toBe(true);
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line).toMatchObject({ level: "warn", event: "mail.link_domain_mismatch" });
    expect(lines[0]).toContain("APP_BASE_URL");
    expect(lines[0]).toContain("EMAIL_FROM");
    expect(lines[0]).not.toMatch(/example\.test|other-sender|noreply/);
  });

  it("says nothing when there is nothing to compare (a variable missing or unreadable)", () => {
    const lines: string[] = []; restore = captureLogs(line => lines.push(line));
    for (const env of [{}, { APP_BASE_URL: "https://app.example.test" }, { EMAIL_FROM: "noreply@example.test" }, { APP_BASE_URL: "not a url", EMAIL_FROM: "noreply@example.test" }, { APP_BASE_URL: "http://127.0.0.1:3000", EMAIL_FROM: "noreply@example.test" }]) {
      expect(mailLinkDomainMismatch(env)).toBeNull();
      expect(warnOnMailLinkDomainMismatch(env)).toBe(false);
    }
    expect(lines).toEqual([]);
  });
});

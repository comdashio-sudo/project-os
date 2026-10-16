import { describe, expect, it } from "vitest";
import { approvalsWaitingEmail, dailyDigestEmail, dailyMailWindow, DAILY_MAIL_HOUR_UTC, preferenceAllows, supportEscalationEmail } from "./emailNotifications";

describe("e-mail notification messages", () => {
  it("an escalation names the ticket and the reason in Arabic first and English after, and links to the app", () => {
    const mail = supportEscalationEmail({ ticketSubject: "Invoice question", reason: "urgent", link: "https://app.example.test/support/t1" });
    expect(mail.subject).toBe("تصعيد دعم | Support escalation: Invoice question");
    expect(mail.text.indexOf("صُعِّد طلب دعم")).toBeLessThan(mail.text.indexOf("A support request needs you"));
    expect(mail.text).toContain("السبب: طلب عاجل.");
    expect(mail.text).toContain("https://app.example.test/support/t1");
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain('dir="ltr"');
  });

  it("never puts markup from a ticket subject into the html", () => {
    const mail = supportEscalationEmail({ ticketSubject: '<script>alert("x")</script> & more', reason: "customer_replied", link: null });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("href"); // no link, no anchor
  });

  it("clips a very long subject so the mail stays readable", () => {
    const mail = supportEscalationEmail({ ticketSubject: "x".repeat(500), reason: "urgent", link: null });
    expect(mail.subject.length).toBeLessThan(160);
    expect(mail.subject.endsWith("…")).toBe(true);
  });

  it("the approvals reminder lists only the queues that have something, and says nothing when nothing waits", () => {
    const mail = approvalsWaitingEmail({ queues: [{ code: "time", ar: "إدخالات وقت", en: "time entries", count: 3 }, { code: "po", ar: "أوامر شراء", en: "purchase orders", count: 0 }, { code: "run", ar: "دورات رواتب", en: "payroll runs", count: 1 }], link: null })!;
    expect(mail.subject).toBe("بانتظار اعتمادك (4) | Waiting for your approval (4)");
    expect(mail.text).toContain("• إدخالات وقت: 3");
    expect(mail.text).toContain("• payroll runs: 1");
    expect(mail.text).not.toContain("purchase orders");
    expect(approvalsWaitingEmail({ queues: [{ code: "time", ar: "x", en: "x", count: 0 }], link: null })).toBeNull();
  });

  it("the daily digest carries counts and codes only, skips a project with nothing to say, and is null when no project has anything", () => {
    const quiet = { code: "P-2", name: "Quiet", approvalsWaiting: 0, overdueActions: 0, openCriticalIssues: 0, openNcrs: 0, progressLoggedYesterday: 0 };
    const busy = { code: "P-1", name: "Villas", approvalsWaiting: 2, overdueActions: 1, openCriticalIssues: 0, openNcrs: 4, progressLoggedYesterday: 3 };
    const mail = dailyDigestEmail({ date: "2026-11-02", projects: [quiet, busy], link: null })!;
    expect(mail.text).toContain("P-1 · Villas");
    expect(mail.text).not.toContain("P-2");
    expect(mail.text).toContain("open NCRs 4");
    expect(mail.text).not.toMatch(/SAR|salary|amount|راتب/);
    expect(dailyDigestEmail({ date: "2026-11-02", projects: [quiet], link: null })).toBeNull();
  });

  it("a person's choice decides, and with none recorded everything is on", () => {
    expect(preferenceAllows(new Set(), "daily_digest")).toBe(true);
    expect(preferenceAllows(new Set(["daily_digest"] as const), "daily_digest")).toBe(false);
    expect(preferenceAllows(new Set(["daily_digest"] as const), "support_escalation")).toBe(true);
  });

  it("the once-a-day mails wait for the morning hour and belong to the UTC date", () => {
    expect(dailyMailWindow(new Date(`2026-11-02T0${DAILY_MAIL_HOUR_UTC - 1}:59:00Z`))).toEqual({ day: "2026-11-02", open: false });
    expect(dailyMailWindow(new Date(`2026-11-02T0${DAILY_MAIL_HOUR_UTC}:00:00Z`))).toEqual({ day: "2026-11-02", open: true });
  });
});

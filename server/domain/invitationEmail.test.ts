import { describe, expect, it } from "vitest";
import { membershipInvitationEmail } from "./emailNotifications";

// Q-12 (c): the invitation mail's words. Synthetic names only.
describe("membership invitation e-mail", () => {
  const base = { companyName: "Example Builders Co.", roleName: "Site engineer", link: "https://app.example.test/invite/accept?token=abc", expiresOn: "2026-11-19" };
  it("names the company, the project and the role, Arabic first, with the link and the expiry", () => {
    const mail = membershipInvitationEmail({ ...base, projectName: "VIL-7 · Example Villas" });
    expect(mail.subject).toBe("دعوة للانضمام إلى Example Builders Co. — مشروع VIL-7 · Example Villas");
    expect(mail.text.indexOf("دُعيت للانضمام إلى شركة «Example Builders Co.» في مشروع «VIL-7 · Example Villas» بدور «Site engineer».")).toBe(0);
    expect(mail.text).toContain("صالحة حتى 2026-11-19");
    expect(mail.text).toContain("You are invited to join «Example Builders Co.» on the project «VIL-7 · Example Villas» as «Site engineer».");
    expect(mail.text).toContain(base.link);
  });
  it("a company-wide invitation names no project, and markup in a name is escaped in the html", () => {
    const mail = membershipInvitationEmail({ ...base, companyName: "<b>Co</b>", projectName: null });
    expect(mail.subject).toBe("دعوة للانضمام إلى <b>Co</b>");
    expect(mail.text).not.toContain("مشروع");
    expect(mail.html).toContain("&lt;b&gt;Co&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Co</b>");
  });
});

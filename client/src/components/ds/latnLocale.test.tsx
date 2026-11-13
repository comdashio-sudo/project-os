// D-26 (6.4): every locale passed to Intl / toLocale*String outside the format helpers goes through latnLocale, so Arabic and Urdu screens write 0-9.
import { describe, expect, it } from "vitest";
import { latnLocale } from "./format";

const EASTERN = /[٠-٩۰-۹]/;
describe("latnLocale (D-26)", () => {
  it("adds the Latin digits to any locale, keeps other extensions, and falls back to en-US", () => {
    expect(latnLocale("ar")).toBe("ar-u-nu-latn");
    expect(latnLocale("ar-SA")).toBe("ar-SA-u-nu-latn");
    expect(latnLocale("ur-PK-u-nu-latn")).toBe("ur-PK-u-nu-latn");
    expect(latnLocale("ar-SA-u-ca-gregory")).toBe("ar-SA-u-nu-latn-ca-gregory");
    expect(latnLocale(undefined)).toBe("en-US");
  });
  it("Arabic and Urdu dates and numbers come out in Western digits through it (NEGATIVE: not without it)", () => {
    const day = new Date("2026-11-13T12:00:00Z");
    for (const locale of ["ar", "ar-SA", "ar-EG", "ur", "ur-PK"]) {
      expect(day.toLocaleDateString(latnLocale(locale), { timeZone: "UTC" }), locale).not.toMatch(EASTERN);
      expect((1234567.5).toLocaleString(latnLocale(locale)), locale).not.toMatch(EASTERN);
      expect(new Intl.DateTimeFormat(latnLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(day), locale).not.toMatch(EASTERN);
    }
    // the browser draws «ar» in Arabic-Indic digits (the audit found ٢٠٢٦ on /pmo); Node's ICU does it for «ar-EG», so the negative is shown there
    expect((1234567.5).toLocaleString("ar-EG")).toMatch(EASTERN);
    expect(new Date("2026-11-13T12:00:00Z").toLocaleDateString("ar-EG", { timeZone: "UTC" })).toMatch(EASTERN);
  });
});

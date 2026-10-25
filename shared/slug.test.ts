import { describe, expect, it } from "vitest";
import { SLUG_MAX_LENGTH, slugFromName, slugProblem } from "./slug";

describe("short name (workspace slug) rule", () => {
  it("accepts lowercase English letters, digits and single dashes between them", () => {
    expect(slugProblem("fanaa")).toBeNull();
    expect(slugProblem("al-noor-2024")).toBeNull();
  });

  it("names the first rule a value breaks, in the same order the form shows them", () => {
    expect(slugProblem("   ")).toBe("required");
    expect(slugProblem("ab")).toBe("too_short");
    expect(slugProblem("a".repeat(SLUG_MAX_LENGTH + 1))).toBe("too_long");
    expect(slugProblem("فناء")).toBe("format");
    expect(slugProblem("Fanaa")).toBe("format");
    expect(slugProblem("-fanaa")).toBe("format");
    expect(slugProblem("fan--aa")).toBe("format");
  });

  it("the form's suggestion from an Arabic legal name is a valid short name (فناء becomes fanaa, the example the owner gave)", () => {
    expect(slugFromName("فناء")).toBe("fanaa");
    expect(slugProblem(slugFromName("فناء"))).toBeNull();
  });

  it("transliterates Arabic letters, keeps Latin letters and digits, and turns other characters into single dashes", () => {
    expect(slugFromName("Al Noor Co.")).toBe("al-noor-co");
    expect(slugFromName("Café 2024!")).toBe("cafe-2024");
    expect(slugFromName("  شركة  ")).toBe("sharaka");
    expect(slugFromName("ورک اسپیس")).toBe("wrak-asapys");
  });

  it("the suggestion is always a valid short name or empty, never a value the rule refuses", () => {
    for (const name of ["شركة الأمل للمقاولات", "نور الدين", "۱۲۳ مؤسسة", "Acme & Sons — Ltd", "ـــ", "٠٠٠"]) {
      const slug = slugFromName(name);
      if (slug) expect(slugProblem(slug), name).toBeNull();
      expect(slug.length, name).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    }
  });
});

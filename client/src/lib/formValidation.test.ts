import { describe, expect, it } from "vitest";
import { dateFieldError, emailFieldError, numberFieldError, requiredFieldError, slugFieldError } from "./formValidation";

// Every message the form shows is written in the three languages; the tests read them in each one.
describe("field messages from the catalogue", () => {
  it("says what is wrong with a short name, in the language of the screen", () => {
    expect(slugFieldError("", "en")).toBe("Enter the workspace short name.");
    expect(slugFieldError("ab", "en")).toBe("The short name must be at least 3 characters.");
    expect(slugFieldError("فناء", "en")).toBe("Use only lowercase English letters, digits and dashes, for example: fanaa.");
    expect(slugFieldError("فناء", "ar")).toBe("استعمل أحرفًا إنجليزية صغيرة وأرقامًا وشرطة فقط، مثل: fanaa.");
    expect(slugFieldError("فناء", "ur")).toBe("صرف چھوٹے انگریزی حروف، ہندسے اور ڈیش استعمال کریں، مثلاً: fanaa۔");
  });

  it("accepts a valid short name", () => {
    expect(slugFieldError("fanaa", "ur")).toBeNull();
  });

  it("checks required, number, date and e-mail fields without a browser message", () => {
    expect(requiredFieldError("  ", "ur")).toBe("یہ فیلڈ ضروری ہے۔");
    expect(requiredFieldError("x", "ur")).toBeNull();
    expect(numberFieldError("abc", "en")).toBe("Enter a valid number.");
    expect(numberFieldError("12", "en")).toBeNull();
    expect(numberFieldError("", "en")).toBeNull();
    expect(dateFieldError("2026-02-30", "en")).toBe("Enter a valid date.");
    expect(dateFieldError("2026-02-28", "en")).toBeNull();
    expect(emailFieldError("owner@example.test", "en")).toBeNull();
    expect(emailFieldError("owner example", "ar")).toBe("أدخل عنوان بريد إلكتروني صحيحًا.");
  });
});

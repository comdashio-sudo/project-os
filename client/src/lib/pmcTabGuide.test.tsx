// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { PMC_TAB_GUIDE, PMC_NOT_IN_PLATFORM } from "./pmcTabGuide";
import { PMC_TEXT } from "@/pages/ProjectPmc";

// Q-37 (c, P2-10): every PMC tab has its explanation, in the three languages; and what PMC does not have is said once.
describe("PMC tab guide (Q-37 c)", () => {
  it("covers exactly the PMC tabs — a new tab without its explanation fails here", () => {
    expect(Object.keys(PMC_TAB_GUIDE).sort()).toEqual(Object.keys(PMC_TEXT.en.tabs).sort());
  });
  it("every sentence exists in Arabic, English and Urdu, with Western digits only", () => {
    const texts = [...Object.values(PMC_TAB_GUIDE).flatMap(help => [help.what, help.when]), PMC_NOT_IN_PLATFORM];
    for (const text of texts) for (const language of ["ar", "en", "ur"] as const) {
      expect(text[language].trim().length, text.en).toBeGreaterThan(3);
      expect(text[language]).not.toMatch(/[٠-٩۰-۹]/);
    }
  });
  it("names what is not in the platform by decision (no Google Sheets sync, no 3D screen)", () => {
    expect(PMC_NOT_IN_PLATFORM.en).toMatch(/Google Sheets/);
    expect(PMC_NOT_IN_PLATFORM.en).toMatch(/3D/);
  });
});

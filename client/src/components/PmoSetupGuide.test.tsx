// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PMO_SETUP_GUIDE } from "@/lib/pmoSetupGuide";

// Q-37 (a, P1-04): the PMO setup explains the three levels and every field, in the three languages. Made-up examples only.
const h = vi.hoisted(() => ({ language: "ar" as "ar" | "en" | "ur" }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: h.language, isArabic: h.language === "ar", isRtl: h.language !== "en", setLanguage: vi.fn() }) }));
import { PmoFieldHelp, PmoSetupIntro } from "./PmoSetupGuide";

afterEach(() => cleanup());
const texts = (): Array<Record<"ar" | "en" | "ur", string>> => [PMO_SETUP_GUIDE.title, PMO_SETUP_GUIDE.example, PMO_SETUP_GUIDE.required, PMO_SETUP_GUIDE.optional, ...PMO_SETUP_GUIDE.levels.flatMap(level => [level.name, level.text]), ...Object.values(PMO_SETUP_GUIDE.fields).map(field => field.text)];

describe("PMO setup guide (Q-37 a)", () => {
  it("every sentence exists in Arabic, English and Urdu, with Western digits only", () => {
    for (const text of texts()) for (const language of ["ar", "en", "ur"] as const) {
      expect(text[language].trim().length, `${language}: ${text.en}`).toBeGreaterThan(1);
      expect(text[language]).not.toMatch(/[٠-٩۰-۹]/);
    }
  });

  it("says what the server does: code and name are required, the program's portfolio and both link targets are optional, a mismatch is refused and empty unlinks", () => {
    const { fields } = PMO_SETUP_GUIDE;
    expect([fields.code.required, fields.name.required, fields.linkProject.required]).toEqual([true, true, true]);
    expect([fields.programPortfolio.required, fields.linkProgram.required, fields.linkPortfolio.required]).toEqual([false, false, false]);
    expect(fields.code.text.en).toMatch(/capitals/);
    expect(fields.linkPortfolio.text.en).toMatch(/refused/);
    expect(fields.linkPortfolio.text.en).toMatch(/unlinks/);
  });

  it("renders the three levels with the made-up example, and one help line per field marked required or optional", () => {
    h.language = "en";
    render(<><PmoSetupIntro /><PmoFieldHelp field="code" /><PmoFieldHelp field="linkProgram" /></>);
    expect(Array.from(document.querySelectorAll("[data-level]")).map(node => node.getAttribute("data-level"))).toEqual(["portfolio", "program", "project"]);
    expect(document.querySelector("[data-pmo-setup-example]")!.textContent).toContain("PF-HOUSING");
    expect(document.querySelector('[data-field-help="code"]')!.textContent).toMatch(/^Required · /);
    expect(document.querySelector('[data-field-help="linkProgram"]')!.textContent).toMatch(/^Optional · /);
    cleanup(); h.language = "ar";
    render(<PmoFieldHelp field="name" />);
    expect(document.querySelector('[data-field-help="name"]')!.textContent).toMatch(/^إلزامي · /);
  });
});

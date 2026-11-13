/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLanguageNeutral, urduCopiesOf } from "./urduCopies";

// D-66 (D-12 a): the screens of this batch hold no Urdu text that is a copy of its English twin. A file joins the list when its batch is done
// (D-67 and D-68 add theirs), so a translated screen cannot slide back to English unnoticed.
const TRANSLATED = ["pages/ProjectPmc.tsx", "pages/ProjectMasterPlan.tsx", "pages/PmcSitePlan.tsx", "pages/PmcProgramme.tsx"];

describe("D-66: Urdu copies of English", () => {
  it("finds a copied Urdu text in a dictionary, in a nested `as Record` dictionary, and in an inline pick", () => {
    const source = `const t = { ar: { a: "أ" }, en: { title: "Plan", s: { x: "Open" } as Record<string, string>, f: (n: number) => \`\${n} units\` }, ur: { title: "Plan", s: { x: "Open" } as Record<string, string>, f: (n: number) => \`\${n} units\` } };
const p = pickLanguage(language, { ar: "حفظ", en: "Save", ur: "Save" });`;
    expect(urduCopiesOf(source).map(copy => copy.key).sort()).toEqual(["", "f", "s.x", "title"]);
  });

  it("NEGATIVE: a translated text, a glossary term kept in Latin, a number or a single letter is not a copy", () => {
    const source = `const t = { en: { title: "Plan", code: "WBS", ratio: "CPI / SPI", x: "X", n: "100" }, ur: { title: "پلان", code: "WBS", ratio: "CPI / SPI", x: "X", n: "100" } };`;
    expect(urduCopiesOf(source)).toEqual([]);
    expect(isLanguageNeutral("Export Excel")).toBe(false);
    expect(isLanguageNeutral("PMC · EVM")).toBe(true);
  });

  it.each(TRANSLATED)("%s has no Urdu text copied from English", file => {
    expect(urduCopiesOf(readFileSync(join(__dirname, "..", file), "utf8"), file)).toEqual([]);
  });
});

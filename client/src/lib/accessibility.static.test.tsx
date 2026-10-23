/** @vitest-environment node */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AA_LARGE_TEXT_AND_CONTROL, AA_TEXT, contrastRatio } from "./contrast";

// Accessibility basics (docs/UI_AUDIT.md section 11): every field has a label, text meets WCAG AA contrast, keyboard focus is visible.
// Every test here is a STATIC check: it reads the source or the CSS text. It cannot see a rendered page, so a passing run does not
// prove a screen; the measurement in docs/UI_AUDIT.md section 11 does that on the running app.
const read = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");
const css = read("index.css");
const ui = (name: string) => read("components", "ui", name);
const page = (name: string) => read("pages", name);

// The value of a token declared in the light theme (the first declaration in index.css, which is the :root block).
function lightToken(name: string): string {
  const match = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`token ${name} has no hex value in index.css`);
  return match[1];
}

// The panels a form field or a text sits on in the light theme: white, the paper background, and the two tinted panels the screens use.
const SURFACES = ["#ffffff", "#f5f7fc", "#f8fafc", "#e6f4f3", "#eafbf9", "#f7f8fc", "#f4f6f8"];

describe("static check: the colour tokens meet WCAG AA", () => {
  it("gives a form control's border 3:1 against every panel a field sits on (1.4.11)", () => {
    const border = lightToken("--dashio-control");
    for (const surface of SURFACES) expect(contrastRatio(border, surface), `${border} on ${surface}`).toBeGreaterThanOrEqual(AA_LARGE_TEXT_AND_CONTROL);
  });

  it("makes the light input border the control border token, and leaves the card line to --dashio-line", () => {
    expect(css).toMatch(/--input:\s*var\(--dashio-control\);/);
    expect(css).toMatch(/--border:\s*var\(--dashio-line\);/);
  });

  it("gives error text and filled destructive buttons 4.5:1 on white and on the paper background", () => {
    const red = lightToken("--destructive");
    expect(contrastRatio(red, "#ffffff"), "red text on white").toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(red, "#f5f7fc"), "red text on paper").toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio("#ffffff", red), "white text on a red button").toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("gives the muted text token 4.5:1 on white and on the paper background", () => {
    const muted = lightToken("--dashio-slate");
    expect(contrastRatio(muted, "#ffffff")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(muted, "#f5f7fc")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("uses the dark teal #0e6b70 (the colour these screens already use for headings) for the teal text that failed", () => {
    for (const surface of ["#f5f7fc", "#eafbf9", "#f7f8fc", "#ffffff"])
      expect(contrastRatio("#0e6b70", surface), `#0e6b70 on ${surface}`).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("static check: a form field keeps its border and its focus ring", () => {
  it("gives the native controls (select, textarea, text inputs) the control border unless the field is invalid or focused", () => {
    const utilities = css.slice(css.lastIndexOf("@layer utilities {"));
    expect(utilities).toContain(`select:not([aria-invalid="true"]):not(:focus-visible)`);
    expect(utilities).toContain(`textarea:not([aria-invalid="true"]):not(:focus-visible)`);
    expect(utilities).toMatch(/input:not\(\[type="checkbox"\]\)[^{]*:not\(:focus-visible\)\s*\{\s*border-color:\s*var\(--input\);/);
  });

  it("gives the shared Input a focus-visible ring", () => {
    expect(ui("input.tsx")).toMatch(/focus-visible:ring-\[3px\]/);
  });

  it("gives the shared Textarea a focus-visible ring", () => {
    expect(ui("textarea.tsx")).toMatch(/focus-visible:ring-ring\/50/);
  });

  it("gives the shared Select trigger a focus-visible ring", () => {
    expect(ui("select.tsx")).toMatch(/focus-visible:ring-ring\/50/);
  });

  it("gives the shared Button a focus-visible ring", () => {
    expect(ui("button.tsx")).toMatch(/focus-visible:ring-\[3px\]/);
  });

  it("gives the shared Tabs trigger a focus-visible ring", () => {
    expect(ui("tabs.tsx")).toMatch(/focus-visible:/);
  });
});

describe("static check: every field on the controls and HSE screens has a name, not only a placeholder", () => {
  // The placeholder was the only text these fields showed (11 on /controls, and 2 fields and a text area in HSE). Each now also has an
  // aria-label that repeats the placeholder, so a screen reader names the field and the screen shows what it did before.
  const CONTROLS_PLACEHOLDERS = ["costCode", "original", "current", "amount", "percent", "pv", "ev", "ac", "bac"];
  for (const key of CONTROLS_PLACEHOLDERS) {
    it(`names the ${key} field`, () => {
      expect(page("ProjectControls.tsx")).toContain(`aria-label={t.${key}} placeholder={t.${key}}`);
    });
  }

  it("names the HSE title field and the description field", () => {
    const hse = page("ProjectHse.tsx");
    expect(hse).toContain(`aria-label={isArabic ? "العنوان" : "Title"} placeholder={isArabic ? "العنوان" : "Title"}`);
    expect(hse).toContain(`<Textarea aria-label={isArabic ? "الوصف" : "Description"} placeholder={isArabic ? "الوصف" : "Description"}`);
  });
});

describe("static check: the text colours that failed on the screens are the ones the screens already use", () => {
  it("draws the EVM outcome heading in the dark teal, not the aqua that measured 2.78:1", () => {
    expect(page("EvmCalculator.tsx")).toContain(`text-[#0e6b70]">{t.outcome}`);
  });

  it("draws the commercial chain and profitability eyebrows in the dark teal, not #0e8f9a (3.65:1)", () => {
    expect(page("CommercialChain.tsx")).toContain(`text-[#0e6b70]">{copy.eyebrow}`);
    expect(page("ProjectProfitability.tsx")).toContain(`text-[#0e6b70]">{t.eyebrow}`);
  });

  it("draws the setup step count in slate-600 (4.4:1 on the tinted panel before)", () => {
    expect(page("SetupWizard.tsx")).toContain(`<p className="mt-3 text-xs text-slate-600">{t.stepOf(index + 1)}</p>`);
  });

  it("fills the active step number with 10% white, which keeps white text at 4.5:1 or more on the teal", () => {
    expect(page("SetupWizard.tsx")).toContain("rounded-full bg-white/10 text-xs");
  });
});

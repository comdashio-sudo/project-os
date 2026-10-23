/** @vitest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// UI audit (docs/UI_AUDIT.md): on a phone every control must reach 44px. The rule lives in index.css under (pointer: coarse), so a
// desktop screen (pointer: fine) renders as before. This is a static check of that rule, in the style of shared/arabicText.test.ts.
const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

// The index of the `{` that opens each coarse-pointer block, and the body of each block (brace matching).
const coarseOpens = Array.from(css.matchAll(/@media \(pointer: coarse\)\s*\{/g)).map(match => match.index! + match[0].length - 1);
function bodyOf(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error("unclosed block in index.css");
}
const coarse = coarseOpens.map(open => bodyOf(css, open)).join("\n");
const outsideCoarse = coarseOpens.reduce((rest, open) => rest.replace(`@media (pointer: coarse) {${bodyOf(css, open)}}`, ""), css);

// Every simple rule inside the coarse blocks: its selector list and its declarations. Comments go first, so a selector does not carry
// the comment written above it.
const rules = Array.from(coarse.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)).map(match => ({ selector: match[1].replace(/\s+/g, " ").trim(), body: match[2] }));
const sized = rules.filter(rule => /min-height:\s*44px/.test(rule.body) && /min-width:\s*44px/.test(rule.body));
const sizedSelectors = sized.map(rule => rule.selector).join(" | ");

describe("the touch-target rule in index.css", () => {
  it("is one coarse-pointer block, inside the utilities layer so it beats the components-layer .flex reset", () => {
    expect(coarseOpens).toHaveLength(1);
    expect(css).toMatch(/@layer utilities\s*\{\s*@media \(pointer: coarse\)/);
  });

  it("gives buttons, links, inputs, selects and textareas a 44px minimum height and width", () => {
    for (const control of ["button", "a[href]", "input", "select", "textarea"]) expect(sizedSelectors, control).toContain(control);
    expect(sized.length).toBeGreaterThan(0);
  });

  it("keeps the 44px minimum out of desktop styles, so a fine pointer renders as before", () => {
    expect(outsideCoarse).not.toMatch(/min-(height|width):\s*44px/);
  });

  it("leaves the drawn size of checkboxes, radios and switches alone (their label row is the target)", () => {
    for (const excluded of ['[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[type="checkbox"]', '[type="radio"]'])
      expect(sizedSelectors, excluded).toContain(`:not(${excluded})`);
  });

  it("makes the tabs list tall enough for 44px triggers, with its 3px padding", () => {
    expect(coarse).toMatch(/:where\(\[data-slot="tabs-list"\]\)\s*\{\s*min-height:\s*50px;/);
  });

  // Static checks of the rule for each input type. They read the CSS text; they cannot measure a layout (docs/UI_AUDIT.md section 1
  // has the measuring probe), so a passing run here does not prove a 44px box on a phone.
  const ruleWith = (selectorStart: string, declaration: RegExp) =>
    rules.some(rule => rule.selector.startsWith(selectorStart) && declaration.test(rule.body));

  it("gives a file picker a 44px minimum height (the field is the target, 36px by default)", () => {
    expect(ruleWith(':where(input[type="file"])', /min-height:\s*44px/)).toBe(true);
  });

  it("gives every input except checkboxes, radios, files and hidden ones a 44px minimum width, beating the shared min-w-0", () => {
    expect(ruleWith('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"])', /min-width:\s*44px/)).toBe(true);
  });

  it("gives a checkbox or radio label row a 44px minimum height", () => {
    expect(coarse).toMatch(/:where\(label:has\(> input\[type="checkbox"\]\), label:has\(> input\[type="radio"\]\)\)\s*\{\s*min-height:\s*44px;/);
  });

  // Every literal input type written in client/src. A type that is not listed here fails, so a new kind of field must be added to
  // KNOWN_INPUT_TYPES together with a rule above that sizes it. An input with no type attribute is a text field.
  const KNOWN_INPUT_TYPES = ["text", "number", "date", "file", "checkbox", "radio", "hidden"];
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
    });
  }
  it("covers every literal input type the client writes, so a new kind of small field cannot slip in unnoticed", () => {
    const found = new Set<string>();
    for (const file of sourceFiles(join(__dirname, ".."))) {
      for (const match of Array.from(readFileSync(file, "utf8").matchAll(/<input\b((?:(?!<)[\s\S])*)/g))) {
        const type = /\btype="([a-z]+)"/.exec(match[1]);
        found.add(type ? type[1] : "text");
      }
    }
    expect(found.size).toBeGreaterThan(0);
    for (const type of Array.from(found)) expect(KNOWN_INPUT_TYPES, `input type ${type}`).toContain(type);
  });
});

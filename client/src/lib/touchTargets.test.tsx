/** @vitest-environment node */
import { readFileSync } from "node:fs";
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

// Every simple rule inside the coarse blocks: its selector list and its declarations.
const rules = Array.from(coarse.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map(match => ({ selector: match[1].replace(/\s+/g, " ").trim(), body: match[2] }));
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

  it("leaves the drawn size of checkboxes, radios, switches and file pickers alone", () => {
    for (const excluded of ['[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[type="checkbox"]', '[type="radio"]', '[type="file"]'])
      expect(sizedSelectors, excluded).toContain(`:not(${excluded})`);
  });

  it("makes the tabs list tall enough for 44px triggers, with its 3px padding", () => {
    expect(coarse).toMatch(/:where\(\[data-slot="tabs-list"\]\)\s*\{\s*min-height:\s*50px;/);
  });
});

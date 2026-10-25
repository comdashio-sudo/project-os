import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../lib/contrast";

const AA_TEXT = 4.5;
const AA_UI = 3;

// Every foreground/background pair of every direction (and its dark mode) is held to WCAG AA, read from the token file itself -- not from a copy of the colours.
const css = readFileSync(path.resolve(import.meta.dirname, "directions.css"), "utf8");
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const match of Array.from(body.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))) vars[match[1]] = match[2];
  return vars;
}

const modes = [
  { name: "A light", vars: block('[data-direction="a"]') },
  { name: "A dark", vars: { ...block('[data-direction="a"]'), ...block('[data-direction="a"][data-mode="dark"]') } },
  { name: "B light", vars: block('[data-direction="b"]') },
  { name: "C light", vars: block('[data-direction="c"]') },
  { name: "C dark", vars: { ...block('[data-direction="c"]'), ...block('[data-direction="c"][data-mode="dark"]') } },
];

// text pairs (4.5:1): [foreground token, background token]
const textPairs: Array<[string, string]> = [
  ["foreground", "background"], ["card-foreground", "card"], ["popover-foreground", "popover"],
  ["primary-foreground", "primary"], ["secondary-foreground", "secondary"], ["accent-foreground", "accent"],
  ["muted-foreground", "background"], ["muted-foreground", "card"], ["muted-foreground", "muted"],
  ["destructive-foreground", "destructive"], ["success-foreground", "success"], ["warning-foreground", "warning"], ["info-foreground", "info"],
  ["success-soft-foreground", "success-soft"], ["warning-soft-foreground", "warning-soft"], ["danger-soft-foreground", "danger-soft"], ["info-soft-foreground", "info-soft"],
  ["sidebar-foreground", "sidebar"], ["sidebar-accent-foreground", "sidebar-accent"], ["hero-foreground", "hero"],
  // coloured text on the page: links and error text sit on the card or the page
  ["primary", "background"], ["primary", "card"], ["destructive", "card"], ["destructive", "background"], ["success", "card"], ["warning", "card"], ["info", "card"],
];
// non-text pairs (3:1): a control's border and the focus ring against the surface they sit on
const uiPairs: Array<[string, string]> = [["input", "card"], ["input", "background"], ["ring", "background"], ["ring", "card"]];

describe.each(modes)("direction $name", ({ vars }) => {
  it("defines every token the pairs use", () => {
    for (const [a, b] of [...textPairs, ...uiPairs]) { expect(vars[a], a).toBeTruthy(); expect(vars[b], b).toBeTruthy(); }
  });
  it.each(textPairs)("text: %s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrastRatio(vars[fg], vars[bg]), `${fg} ${vars[fg]} on ${bg} ${vars[bg]}`).toBeGreaterThanOrEqual(AA_TEXT);
  });
  it.each(uiPairs)("control: %s against %s is at least 3:1", (fg, bg) => {
    expect(contrastRatio(vars[fg], vars[bg]), `${fg} ${vars[fg]} on ${bg} ${vars[bg]}`).toBeGreaterThanOrEqual(AA_UI);
  });
});

describe("the directions are really different", () => {
  it("do not share a primary colour, a radius or an Arabic face", () => {
    const set = (name: string) => css.match(new RegExp(`\\[data-direction="${name}"\\] \\{[\\s\\S]*?\\n\\}`))![0];
    const pick = (block: string, token: string) => block.match(new RegExp(`--${token}:\\s*([^;]+);`))![1].trim();
    const all = ["a", "b", "c"].map(set);
    for (const token of ["primary", "radius"]) expect(new Set(all.map(block => pick(block, token))).size, token).toBe(3);
    expect(new Set(all.map(block => pick(block, "font-ar").split(",")[1])).size).toBe(3);
  });
});

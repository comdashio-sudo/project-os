// D-26 (#187, 6.6): the primary button's text against its fill is at least 4.5:1 (WCAG AA for normal text), measured from the colour tokens themselves —
// at rest and in the faded hover/press state (the fill at the opacity the button classes give it, over the darkest surface it can stand on).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(import.meta.dirname, file), "utf8");
const indexCss = read("../index.css");
const directions = read("./directions.css");
const hex = (value: string) => { const h = value.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (rgb: number[]) => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg: number[], bg: number[], alpha: number) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
const token = (css: string, name: string) => { const value = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]; if (!value) throw new Error(`no ${name}`); return value; };
/** The lowest opacity the primary button classes put on the fill (hover/active «bg-primary/NN»). */
const lowestAlpha = () => Math.min(...[read("../components/ds/Button.tsx"), read("../components/ui/button.tsx")].flatMap(source => Array.from(source.matchAll(/(?:hover|active):bg-primary\/(\d+)/g)).map(match => Number(match[1]) / 100)));

// the app's own theme (index.css): light and dark, the fill and the text from the brand tokens; and the design directions (directions.css)
const app = { light: { fill: token(indexCss, "dashio-indigo"), text: token(indexCss, "dashio-white"), surfaces: [token(indexCss, "dashio-white")] },
  dark: { fill: token(indexCss, "dashio-indigo-soft"), text: token(indexCss, "dashio-ink"), surfaces: [token(indexCss, "dashio-bg-dark"), token(indexCss, "dashio-surface-dark")] } };
const blocks = Array.from(directions.matchAll(/(\[data-direction="[abc]"\](?:\[data-mode="dark"\])?)\s*\{([^}]*)\}/g)).filter(block => /--primary:\s*#/.test(block[2]));

describe("primary button contrast (D-26, 6.6)", () => {
  it("the app theme: text on the fill is at least 4.5:1 at rest, and at the faded hover/press over every surface", () => {
    const alpha = lowestAlpha();
    expect(alpha).toBeGreaterThanOrEqual(0.9);
    for (const [mode, pair] of Object.entries(app)) {
      expect(contrast(hex(pair.fill), hex(pair.text)), `${mode} at rest`).toBeGreaterThanOrEqual(4.5);
      for (const surface of pair.surfaces) expect(contrast(over(hex(pair.fill), hex(surface), alpha), hex(pair.text)), `${mode} faded over ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every design direction's primary pair is at least 4.5:1", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const [, selector, body] of blocks) expect(contrast(hex(token(body, "primary")), hex(token(body, "primary-foreground"))), selector).toBeGreaterThanOrEqual(4.5);
  });

  it("NEGATIVE: the faded state the buttons used before (90% hover, 80% press) falls under 4.5:1 in the dark theme", () => {
    const dark = app.dark;
    expect(contrast(over(hex(dark.fill), hex(dark.surfaces[0]), 0.9), hex(dark.text))).toBeLessThan(4.5);
    expect(contrast(over(hex(dark.fill), hex(dark.surfaces[0]), 0.8), hex(dark.text))).toBeLessThan(4.5);
  });
});
